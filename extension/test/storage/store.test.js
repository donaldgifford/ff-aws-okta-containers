import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultState, SCHEMA_VERSION } from "../../src/storage/schema.js";
import { createStore, StorageError } from "../../src/storage/store.js";
import { portal } from "../core/helpers.js";
import { createFakeBrowser } from "../fake-browser.js";

test("first use writes the defaults at the current schema version", async () => {
  const browser = createFakeBrowser();
  const store = createStore(browser.storage.local);

  const state = await store.load();

  assert.deepEqual(state, defaultState());
  assert.equal(browser.stored().schemaVersion, SCHEMA_VERSION);
});

test("reads are cached behind one promise until storage changes", async () => {
  const browser = createFakeBrowser({ storage: defaultState() });
  const store = createStore(browser.storage.local);

  assert.equal(store.load(), store.load());
  const first = await store.load();
  store.invalidate();
  const second = await store.load();

  assert.notEqual(first, second);
  assert.deepEqual(first, second);
});

test("an update writes only the keys that changed", async () => {
  const browser = createFakeBrowser({ storage: defaultState() });
  const store = createStore(browser.storage.local);
  const written = [];
  browser.storage.onChanged.addListener((changes) => {
    written.push(Object.keys(changes));
  });

  await store.update((state) => {
    state.organizations[portal().key] = portal();
  });
  await store.update(() => {});

  assert.deepEqual(written, [["organizations"]]);
  assert.deepEqual(browser.stored().organizations, {
    [portal().key]: portal(),
  });
  assert.deepEqual((await store.load()).organizations, {
    [portal().key]: portal(),
  });
});

test("updates run one at a time and none is lost", async () => {
  const browser = createFakeBrowser({ storage: defaultState() });
  const store = createStore(browser.storage.local);

  await Promise.all(
    ["a", "b", "c", "d"].map((id) =>
      store.update((state) => {
        state.accounts[id] = {
          accountId: id,
          name: id,
          orgKey: portal().key,
          seenAt: "2026-01-01T00:00:00.000Z",
        };
      }),
    ),
  );

  assert.deepEqual(Object.keys(browser.stored().accounts), [
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("an update sees what another context wrote in the meantime", async () => {
  const browser = createFakeBrowser({ storage: defaultState() });
  const store = createStore(browser.storage.local);
  await store.load();

  // The options page saves a label while the background has a cached copy.
  await browser.storage.local.set({
    organizations: { [portal().key]: portal({ label: "edited" }) },
  });
  await store.update((state) => {
    state.notice = { message: "x", at: "2026-01-01T00:00:00.000Z" };
  });

  assert.equal(browser.stored().organizations[portal().key].label, "edited");
});

test("data from a newer schema version is refused and left untouched", async () => {
  const newer = { ...defaultState(), schemaVersion: SCHEMA_VERSION + 1 };
  const browser = createFakeBrowser({ storage: newer });
  const store = createStore(browser.storage.local);

  await assert.rejects(store.load(), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.reason, "newer-schema");
    return true;
  });
  await assert.rejects(
    store.update((state) => {
      state.notice = null;
    }),
    StorageError,
  );
  assert.deepEqual(browser.stored(), newer);
  assert.equal(browser.calls.storageSet, 0);
});

test("a failed read is not cached", async () => {
  const browser = createFakeBrowser({ storage: { schemaVersion: "bad" } });
  const store = createStore(browser.storage.local);

  await assert.rejects(store.load(), StorageError);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });

  assert.equal((await store.load()).schemaVersion, SCHEMA_VERSION);
});
