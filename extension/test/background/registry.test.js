import assert from "node:assert/strict";
import { test } from "node:test";

import { createRegistry } from "../../src/background/registry.js";
import { defaultState } from "../../src/storage/schema.js";
import { createStore } from "../../src/storage/store.js";
import { oktaTenant, portal } from "../core/helpers.js";
import { createFakeBrowser } from "../fake-browser.js";

const CONSOLE_KEY = "aws:111122223333:AdminAccess";
const PORTAL_KEY = portal().key;

/** @param {(state: ReturnType<typeof defaultState>) => void} [prepare] */
function setup(prepare = () => {}) {
  const state = defaultState();
  state.organizations[PORTAL_KEY] = portal();
  state.organizations[oktaTenant().key] = oktaTenant();
  prepare(state);
  const browser = createFakeBrowser({ storage: state });
  const store = createStore(browser.storage.local);
  browser.storage.onChanged.addListener(() => store.invalidate());
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  const registry = createRegistry({
    store,
    identities: browser.contextualIdentities,
    now: () => {
      clock += 1000;
      return new Date(clock);
    },
  });
  browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) =>
    registry.forget(contextualIdentity.cookieStoreId),
  );
  return { browser, store, registry };
}

/** Lets event listeners that were fired without being awaited finish. */
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the first use creates a container and records it", async () => {
  const { browser, registry } = setup();

  const cookieStoreId = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  assert.deepEqual(browser.identities.get(cookieStoreId), {
    cookieStoreId,
    name: "111122223333(acme) / AdminAccess",
    color: browser.identities.get(cookieStoreId).color,
    icon: "dollar",
  });
  assert.deepEqual(browser.stored().containers[CONSOLE_KEY], {
    key: CONSOLE_KEY,
    cookieStoreId,
    kind: "aws-console",
    orgKey: PORTAL_KEY,
    managedName: "111122223333(acme) / AdminAccess",
    userRenamed: false,
    createdAt: "2026-01-01T00:00:01.000Z",
    lastUsedAt: "2026-01-01T00:00:01.000Z",
  });
});

test("a second use reuses the container and notes when", async () => {
  const { browser, registry } = setup();

  const first = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  const second = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  assert.equal(second, first);
  assert.equal(browser.calls.create, 1);
  assert.equal(browser.calls.update, 0);
  const record = browser.stored().containers[CONSOLE_KEY];
  assert.equal(record.createdAt, "2026-01-01T00:00:01.000Z");
  assert.equal(record.lastUsedAt, "2026-01-01T00:00:02.000Z");
});

test("two simultaneous requests for one key create one container", async () => {
  const { browser, registry } = setup();

  const [first, second, third] = await Promise.all([
    registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
  ]);

  assert.equal(first, second);
  assert.equal(first, third);
  assert.equal(browser.calls.create, 1);
  assert.equal(browser.identities.size, 1);
});

test("different keys get different containers", async () => {
  const { browser, registry } = setup();

  const [consoleStore, portalStore, oktaStore] = await Promise.all([
    registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    registry.getOrCreate(PORTAL_KEY, PORTAL_KEY),
    registry.getOrCreate(oktaTenant().key, oktaTenant().key),
  ]);

  assert.equal(new Set([consoleStore, portalStore, oktaStore]).size, 3);
  assert.equal(browser.identities.get(portalStore).name, "acme portal");
  assert.equal(browser.identities.get(portalStore).icon, "briefcase");
  assert.equal(browser.identities.get(oktaStore).name, "acme okta admin");
  assert.equal(browser.identities.get(oktaStore).icon, "fingerprint");
});

test("a template change renames the container instead of creating one", async () => {
  const { browser, store, registry } = setup();
  const cookieStoreId = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  await store.update((state) => {
    state.settings.consoleTemplate = "{org} / {accountId} / {role}";
  });
  await registry.syncNames();

  assert.equal(browser.calls.create, 1);
  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "acme / 111122223333 / AdminAccess",
  );
  assert.equal(
    browser.stored().containers[CONSOLE_KEY].managedName,
    "acme / 111122223333 / AdminAccess",
  );
  assert.equal(
    await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    cookieStoreId,
  );
});

test("a label change renames on the next use too", async () => {
  const { browser, store, registry } = setup();
  const cookieStoreId = await registry.getOrCreate(PORTAL_KEY, PORTAL_KEY);

  await store.update((state) => {
    state.organizations[PORTAL_KEY].label = "prod-org";
  });
  await registry.getOrCreate(PORTAL_KEY, PORTAL_KEY);

  assert.equal(browser.identities.get(cookieStoreId).name, "prod-org portal");
  assert.equal(browser.identities.get(cookieStoreId).color, "red");
  assert.equal(browser.calls.create, 1);
});

test("a console is renamed in place when its account name arrives", async () => {
  const { browser, store, registry } = setup();
  const cookieStoreId = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  await store.update((state) => {
    state.accounts["111122223333"] = {
      accountId: "111122223333",
      name: "payments-prod",
      orgKey: PORTAL_KEY,
      seenAt: "2026-01-01T00:00:00.000Z",
    };
  });
  await registry.syncNames();

  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "payments-prod(acme) / AdminAccess",
  );
  assert.equal(browser.identities.get(cookieStoreId).color, "red");
  assert.equal(browser.calls.create, 1);
});

test("a container renamed by hand is not renamed back", async () => {
  const { browser, store, registry } = setup();
  const cookieStoreId = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  browser.renameByHand(cookieStoreId, "my favourite account");

  await store.update((state) => {
    state.settings.consoleTemplate = "{role} in {account}";
  });
  await registry.syncNames();
  const again = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  assert.equal(again, cookieStoreId);
  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "my favourite account",
  );
  assert.equal(browser.calls.update, 0);
  assert.equal(browser.stored().containers[CONSOLE_KEY].userRenamed, true);
});

test("handing naming back renames a hand-renamed container", async () => {
  const { browser, registry } = setup();
  const cookieStoreId = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  browser.renameByHand(cookieStoreId, "my favourite account");
  await registry.syncNames();

  await registry.handBack(CONSOLE_KEY);

  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "111122223333(acme) / AdminAccess",
  );
  assert.equal(browser.stored().containers[CONSOLE_KEY].userRenamed, false);
});

test("a deleted container is forgotten and recreated on the next use", async () => {
  const { browser, registry } = setup();
  const first = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  browser.deleteByHand(first);
  await settle();
  assert.equal(browser.stored().containers[CONSOLE_KEY], undefined);

  const second = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  assert.notEqual(second, first);
  assert.equal(browser.calls.create, 2);
  assert.equal(browser.stored().containers[CONSOLE_KEY].cookieStoreId, second);
});

test("a container deleted while the background was stopped is recreated", async () => {
  const { browser, registry } = setup();
  const first = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  // Deleted with no onRemoved event seen: the mapping is stale.
  browser.identities.delete(first);

  const second = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);

  assert.notEqual(second, first);
  assert.equal(browser.stored().containers[CONSOLE_KEY].cookieStoreId, second);
});

test("removing someone else's container changes nothing", async () => {
  const { browser, registry } = setup();
  await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  const before = browser.stored();
  const writes = browser.calls.storageSet;

  await registry.forget("firefox-container-999");

  assert.deepEqual(browser.stored(), before);
  assert.equal(browser.calls.storageSet, writes);
});

test("an existing container with the same name is never adopted", async () => {
  const { browser, registry } = setup();
  const theirs = await browser.contextualIdentities.create({
    name: "acme portal",
    color: "pink",
    icon: "pet",
  });
  browser.calls.create = 0;

  const ours = await registry.getOrCreate(PORTAL_KEY, PORTAL_KEY);
  await registry.syncNames();
  await registry.removeUnused(browser.tabs);

  assert.notEqual(ours, theirs.cookieStoreId);
  assert.equal(browser.calls.create, 1);
  assert.deepEqual(browser.identities.get(theirs.cookieStoreId), {
    cookieStoreId: theirs.cookieStoreId,
    name: "acme portal",
    color: "pink",
    icon: "pet",
  });
});

test("only managed containers with no open tabs are removed", async () => {
  const { browser, registry } = setup();
  const inUse = await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY);
  const idle = await registry.getOrCreate(PORTAL_KEY, PORTAL_KEY);
  await browser.tabs.create({
    url: "https://example.com/",
    cookieStoreId: inUse,
  });

  const removed = await registry.removeUnused(browser.tabs);
  await settle();

  assert.deepEqual(removed, [PORTAL_KEY]);
  assert.equal(browser.identities.has(idle), false);
  assert.equal(browser.identities.has(inUse), true);
  assert.deepEqual(Object.keys(browser.stored().containers), [CONSOLE_KEY]);
});

test("a malformed key is refused before anything is created", async () => {
  const { browser, registry } = setup();

  await assert.rejects(
    registry.getOrCreate("nonsense", null),
    /Not a container key/,
  );
  assert.equal(browser.calls.create, 0);
});

test("a failed creation does not block the next attempt", async () => {
  const { browser, registry } = setup();
  const create = browser.contextualIdentities.create;
  browser.contextualIdentities.create = async () => {
    throw new Error("containers are disabled");
  };

  await assert.rejects(
    registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    /disabled/,
  );
  browser.contextualIdentities.create = create;

  assert.match(
    await registry.getOrCreate(CONSOLE_KEY, PORTAL_KEY),
    /^firefox-container-/,
  );
});
