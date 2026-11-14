import assert from "node:assert/strict";
import { test } from "node:test";

import { refreshAccess } from "../../src/background/access.js";
import { originsFor, planEnrolment } from "../../src/core/enrol.js";
import {
  changeRegion,
  originsForRegion,
  recordAccess,
  relabelOrganization,
  removeOrganization,
  saveOrganization,
} from "../../src/options/enrolment.js";
import { defaultState } from "../../src/storage/schema.js";
import { createStore } from "../../src/storage/store.js";
import { oktaTenant, PORTAL_HOST, portal } from "../core/helpers.js";
import { createFakeBrowser } from "../fake-browser.js";

const REGIONS = ["us-east-1", "us-west-2", "eu-west-1"];
const NOW = new Date("2026-02-02T00:00:00.000Z");
const OTHER_PORTAL = portal({
  key: "aws-portal:d-0987654321.awsapps.com",
  host: "d-0987654321.awsapps.com",
  label: "other",
});

/** @param {object[]} organizations */
function setup(organizations = []) {
  const state = defaultState();
  for (const organization of organizations) {
    state.organizations[organization.key] = organization;
  }
  const browser = createFakeBrowser({
    storage: state,
    origins: organizations
      .filter((organization) => organization.accessGranted)
      .flatMap((organization) => originsFor(organization)),
  });
  const store = createStore(browser.storage.local);
  browser.storage.onChanged.addListener(() => store.invalidate());
  return { browser, store, permissions: browser.permissions };
}

async function origins(browser) {
  return (await browser.permissions.getAll()).origins.sort();
}

test("a granted enrolment is saved with its label and region", async () => {
  const { browser, store } = setup();
  const plan = planEnrolment({
    address: PORTAL_HOST,
    region: "us-west-2",
    regions: REGIONS,
  });

  await saveOrganization(store, plan, " acme ", NOW);

  assert.deepEqual(browser.stored().organizations, {
    [portal().key]: portal({ addedAt: NOW.toISOString() }),
  });
});

test("enrolling again updates the label and keeps the original date", async () => {
  const { browser, store } = setup([portal()]);
  const plan = planEnrolment({
    address: PORTAL_HOST,
    region: "eu-west-1",
    regions: REGIONS,
  });

  await saveOrganization(store, plan, "renamed", NOW);

  assert.deepEqual(
    browser.stored().organizations[portal().key],
    portal({ label: "renamed", region: "eu-west-1" }),
  );
});

test("removing the last organization leaves no site access", async () => {
  const { browser, store, permissions } = setup([portal(), oktaTenant()]);

  await removeOrganization({ store, permissions }, portal().key);
  await removeOrganization({ store, permissions }, oktaTenant().key);

  assert.deepEqual(browser.stored().organizations, {});
  assert.deepEqual(await origins(browser), []);
});

test("removing one of two portals in a region keeps the region's API address", async () => {
  const { browser, store, permissions } = setup([portal(), OTHER_PORTAL]);

  await removeOrganization({ store, permissions }, portal().key);

  assert.deepEqual(Object.keys(browser.stored().organizations), [
    OTHER_PORTAL.key,
  ]);
  assert.deepEqual(await origins(browser), [
    "https://d-0987654321.awsapps.com/*",
    "https://portal.sso.us-west-2.amazonaws.com/*",
  ]);
});

test("removing something that is not enrolled does nothing", async () => {
  const { browser, store, permissions } = setup([portal()]);

  await removeOrganization({ store, permissions }, "aws-portal:nope");

  assert.deepEqual(Object.keys(browser.stored().organizations), [portal().key]);
  assert.equal((await origins(browser)).length, 2);
});

test("a label edit is saved trimmed", async () => {
  const { browser, store } = setup([portal()]);

  await relabelOrganization(store, portal().key, "  prod-org ");

  assert.equal(browser.stored().organizations[portal().key].label, "prod-org");
});

test("changing region swaps the API address", async () => {
  const { browser, store, permissions } = setup([portal()]);
  assert.deepEqual(originsForRegion("eu-west-1"), [
    "https://portal.sso.eu-west-1.amazonaws.com/*",
  ]);
  browser.grant(...originsForRegion("eu-west-1"));

  await changeRegion({ store, permissions }, portal().key, "eu-west-1");

  assert.equal(
    browser.stored().organizations[portal().key].region,
    "eu-west-1",
  );
  assert.deepEqual(await origins(browser), [
    `https://${PORTAL_HOST}/*`,
    "https://portal.sso.eu-west-1.amazonaws.com/*",
  ]);
});

test("changing region keeps the old API address while another portal uses it", async () => {
  const { browser, store, permissions } = setup([portal(), OTHER_PORTAL]);
  browser.grant(...originsForRegion("eu-west-1"));

  await changeRegion({ store, permissions }, portal().key, "eu-west-1");

  assert.ok(
    (await origins(browser)).includes(
      "https://portal.sso.us-west-2.amazonaws.com/*",
    ),
  );
});

test("a grant revoked in the add-on manager is noticed", async () => {
  const { browser, store, permissions } = setup([portal(), oktaTenant()]);

  browser.revoke("https://portal.sso.us-west-2.amazonaws.com/*");
  const changed = await refreshAccess({ store, permissions });

  assert.deepEqual(changed, [portal().key]);
  assert.equal(
    browser.stored().organizations[portal().key].accessGranted,
    false,
  );
  assert.equal(
    browser.stored().organizations[oktaTenant().key].accessGranted,
    true,
  );
});

test("a grant given back is noticed too", async () => {
  const { browser, store, permissions } = setup([
    portal({ accessGranted: false }),
  ]);

  assert.deepEqual(await refreshAccess({ store, permissions }), []);
  browser.grant(...originsFor(portal()));

  assert.deepEqual(await refreshAccess({ store, permissions }), [portal().key]);
  assert.equal(
    browser.stored().organizations[portal().key].accessGranted,
    true,
  );
});

test("the answer to granting access again is recorded", async () => {
  const { browser, store } = setup([portal({ accessGranted: false })]);

  await recordAccess(store, portal().key, true);

  assert.equal(
    browser.stored().organizations[portal().key].accessGranted,
    true,
  );
});

test("checking access writes nothing when nothing changed", async () => {
  const { browser, store, permissions } = setup([portal(), oktaTenant()]);
  const writes = browser.calls.storageSet;

  assert.deepEqual(await refreshAccess({ store, permissions }), []);
  assert.equal(browser.calls.storageSet, writes);
});

// Giving up an address makes the background script re-check access and
// write what it finds, from its own copy of the store. These two tests pin
// the order that keeps that write from undoing the options page's change.
function withBackground(organizations) {
  const context = setup(organizations);
  const background = createStore(context.browser.storage.local);
  context.browser.storage.onChanged.addListener(() => background.invalidate());
  /** @type {Promise<unknown>[]} */
  const checks = [];
  context.browser.permissions.onRemoved.addListener(() => {
    checks.push(
      refreshAccess({ store: background, permissions: context.permissions }),
    );
  });
  return { ...context, checks };
}

test("a removed organization is not written back by the background's access check", async () => {
  const { browser, store, permissions, checks } = withBackground([
    portal(),
    oktaTenant(),
  ]);
  /** @type {string[][]} */
  const storedWhenRevoked = [];
  const remove = permissions.remove;
  permissions.remove = async (details) => {
    storedWhenRevoked.push(Object.keys(browser.stored().organizations));
    return remove(details);
  };

  await removeOrganization({ store, permissions }, oktaTenant().key);
  await Promise.all(checks);

  assert.deepEqual(storedWhenRevoked, [[portal().key]]);
  assert.deepEqual(Object.keys(browser.stored().organizations), [portal().key]);
  assert.equal(
    browser.stored().organizations[portal().key].accessGranted,
    true,
  );
});

test("a region change is not undone by the background's access check", async () => {
  const { browser, store, permissions, checks } = withBackground([portal()]);
  browser.grant(...originsForRegion("eu-west-1"));
  /** @type {(string | null)[]} */
  const regionWhenRevoked = [];
  const remove = permissions.remove;
  permissions.remove = async (details) => {
    regionWhenRevoked.push(browser.stored().organizations[portal().key].region);
    return remove(details);
  };

  await changeRegion({ store, permissions }, portal().key, "eu-west-1");
  await Promise.all(checks);

  assert.deepEqual(regionWhenRevoked, ["eu-west-1"]);
  assert.deepEqual(
    browser.stored().organizations[portal().key],
    portal({ region: "eu-west-1" }),
  );
});
