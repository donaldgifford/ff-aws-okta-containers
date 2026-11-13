import assert from "node:assert/strict";
import { test } from "node:test";

import { oktaTenant, PORTAL_URL, portal } from "../core/helpers.js";
import { createBackground, settle } from "./helpers.js";

const OKTA_URL = "https://acme-admin.okta.com/admin/dashboard";

/** A top-level navigation in the given tab. */
function navigation(tab, url, overrides = {}) {
  return {
    requestId: "navigation-1",
    url,
    method: "GET",
    type: "main_frame",
    tabId: tab.id,
    cookieStoreId: tab.cookieStoreId,
    incognito: tab.incognito,
    ...overrides,
  };
}

function others(browser, tab) {
  return [...browser.openTabs.values()].filter((other) => other.id !== tab.id);
}

test("a portal typed into a new tab moves to its container and the empty tab closes", async () => {
  const { browser, onNavigation, failures } = createBackground();
  const tab = browser.addTab({ url: "about:newtab" });

  const response = await onNavigation(navigation(tab, `${PORTAL_URL}#/`));
  await settle();

  assert.deepEqual(response, { cancel: true });
  const [moved] = others(browser, tab);
  assert.equal(moved.url, `${PORTAL_URL}#/`);
  assert.equal(browser.identities.get(moved.cookieStoreId).name, "acme portal");
  assert.equal(browser.identities.get(moved.cookieStoreId).icon, "briefcase");
  assert.equal(browser.openTabs.has(tab.id), false);
  assert.deepEqual(failures, []);
});

test("an Okta admin console moves to its tenant's container", async () => {
  const { browser, onNavigation } = createBackground();
  const tab = browser.addTab({ url: "about:blank" });

  const response = await onNavigation(navigation(tab, OKTA_URL));

  assert.deepEqual(response, { cancel: true });
  const [moved] = others(browser, tab);
  assert.equal(moved.url, OKTA_URL);
  assert.equal(
    browser.identities.get(moved.cookieStoreId).name,
    "acme okta admin",
  );
  assert.equal(
    browser.stored().containers[oktaTenant().key].cookieStoreId,
    moved.cookieStoreId,
  );
});

test("a tab that was showing a page keeps it and stays open", async () => {
  const { browser, onNavigation } = createBackground();
  const tab = browser.addTab({ url: "https://example.com/links" });

  const response = await onNavigation(navigation(tab, OKTA_URL));
  await settle();

  assert.deepEqual(response, { cancel: true });
  assert.equal(browser.openTabs.get(tab.id).url, "https://example.com/links");
  const [moved] = others(browser, tab);
  assert.equal(moved.index, tab.index + 1);
});

test("a second visit reuses the same container", async () => {
  const { browser, onNavigation } = createBackground();
  const first = browser.addTab({ url: "https://example.com/" });
  const second = browser.addTab({ url: "https://example.com/" });

  await onNavigation(navigation(first, OKTA_URL));
  await onNavigation(navigation(second, OKTA_URL));

  const moved = [...browser.openTabs.values()].filter(
    (tab) => tab.url === OKTA_URL,
  );
  assert.equal(moved.length, 2);
  assert.equal(moved[0].cookieStoreId, moved[1].cookieStoreId);
  assert.equal(browser.calls.create, 1);
});

for (const [label, tabOverrides, url, requestOverrides] of [
  ["a POST", {}, OKTA_URL, { method: "POST" }],
  ["a private window", { incognito: true }, OKTA_URL, {}],
  [
    "a tab already in a container",
    { cookieStoreId: "firefox-container-9" },
    OKTA_URL,
    {},
  ],
  [
    "the tenant's own sign-in host",
    {},
    "https://acme.okta.com/app/UserHome",
    {},
  ],
  ["a tenant that is not enrolled", {}, "https://other-admin.okta.com/", {}],
  [
    "a portal that is not enrolled",
    {},
    "https://d-0987654321.awsapps.com/start/",
    {},
  ],
  [
    "a portal host outside /start",
    {},
    "https://d-1234567890.awsapps.com/mail",
    {},
  ],
]) {
  test(`${label} is left alone`, async () => {
    const { browser, onNavigation } = createBackground();
    const tab = browser.addTab({ url: "about:newtab", ...tabOverrides });

    const response = await onNavigation(navigation(tab, url, requestOverrides));
    await settle();

    assert.deepEqual(response, {});
    assert.deepEqual(others(browser, tab), []);
    assert.equal(browser.openTabs.has(tab.id), true);
    assert.equal(browser.calls.create, 0);
  });
}

test("a request that did not come from a tab is left alone", async () => {
  const { browser, onNavigation } = createBackground();

  const response = await onNavigation(
    navigation(
      { id: -1, cookieStoreId: "firefox-default", incognito: false },
      OKTA_URL,
    ),
  );

  assert.deepEqual(response, {});
  assert.equal(browser.calls.create, 0);
});

test("each switch stops its own kind and only its own kind", async () => {
  const { browser, onNavigation } = createBackground((state) => {
    state.settings.awsPortalsEnabled = false;
  });
  const tab = browser.addTab({ url: "https://example.com/" });

  assert.deepEqual(await onNavigation(navigation(tab, PORTAL_URL)), {});
  assert.deepEqual(await onNavigation(navigation(tab, OKTA_URL)), {
    cancel: true,
  });
  assert.equal(others(browser, tab).length, 1);
});

test("with the Okta switch off an admin console is left alone", async () => {
  const { browser, onNavigation } = createBackground((state) => {
    state.settings.oktaAdminEnabled = false;
  });
  const tab = browser.addTab({ url: "about:newtab" });

  assert.deepEqual(await onNavigation(navigation(tab, OKTA_URL)), {});
  assert.equal(browser.calls.create, 0);
});

test("if the container cannot be created the request goes ahead where it is", async () => {
  const { browser, onNavigation, failures } = createBackground();
  const tab = browser.addTab({ url: "about:newtab" });
  browser.contextualIdentities.create = async () => {
    throw new Error("containers are disabled");
  };

  const response = await onNavigation(navigation(tab, OKTA_URL));
  await settle();

  assert.deepEqual(response, {});
  assert.equal(browser.openTabs.has(tab.id), true);
  assert.equal(failures.length, 1);
});

test("if the tab cannot be opened the request goes ahead where it is", async () => {
  const { browser, onNavigation } = createBackground();
  const tab = browser.addTab({ url: "about:newtab" });
  browser.tabs.create = async () => {
    throw new Error("no window");
  };

  assert.deepEqual(await onNavigation(navigation(tab, OKTA_URL)), {});
  assert.equal(browser.openTabs.has(tab.id), true);
});

test("if storage cannot be read nothing is moved", async () => {
  const { browser, store, onNavigation } = createBackground();
  const tab = browser.addTab({ url: "about:newtab" });
  await browser.storage.local.set({ schemaVersion: 99 });
  store.invalidate();

  assert.deepEqual(await onNavigation(navigation(tab, OKTA_URL)), {});
  assert.equal(browser.calls.create, 0);
});

test("after enrolment the tab it started from is reopened in the container", async () => {
  const { browser, reopen } = createBackground();
  const tab = browser.addTab({ url: `${PORTAL_URL}#/`, index: 3 });

  assert.equal(await reopen(tab.id, portal()), true);

  assert.equal(browser.openTabs.has(tab.id), false);
  const [moved] = [...browser.openTabs.values()];
  assert.equal(moved.url, `${PORTAL_URL}#/`);
  assert.equal(moved.index, 4);
  assert.equal(browser.identities.get(moved.cookieStoreId).name, "acme portal");
});

for (const [label, tabOverrides, organization] of [
  ["a tab that has gone elsewhere", { url: "https://example.com/" }, portal()],
  ["a tab on another organization", { url: OKTA_URL }, portal()],
  [
    "the tenant's own sign-in page",
    { url: "https://acme.okta.com/" },
    oktaTenant(),
  ],
  [
    "a tab already in a container",
    { url: PORTAL_URL, cookieStoreId: "firefox-container-9" },
    portal(),
  ],
  ["a private tab", { url: PORTAL_URL, incognito: true }, portal()],
]) {
  test(`after enrolment ${label} is not reopened`, async () => {
    const { browser, reopen } = createBackground();
    const tab = browser.addTab(tabOverrides);

    assert.equal(await reopen(tab.id, organization), false);
    assert.equal(browser.openTabs.has(tab.id), true);
    assert.equal(browser.openTabs.size, 1);
  });
}

test("after enrolment a tab that has been closed is ignored", async () => {
  const { browser, reopen } = createBackground();

  assert.equal(await reopen(12345, portal()), false);
  assert.equal(browser.openTabs.size, 0);
});
