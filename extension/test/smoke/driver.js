// Test driver for the headless load test. It is appended to a temporary copy
// of the extension by run.mjs and never ships: it reports to a local port,
// which the extension itself is not allowed to do.
//
// It is listed first in the background scripts, so its error handlers are in
// place before the real background script runs.

const REPORT_URL = "__REPORT_URL__";

/** @type {string[]} */
const errors = [];

self.addEventListener("error", (event) => {
  errors.push(String(event.message ?? event));
});
self.addEventListener("unhandledrejection", (event) => {
  errors.push(`unhandled rejection: ${String(event.reason)}`);
});

/**
 * Exercises the registry against real containers: two requests for one key
 * must leave exactly one container, which is then cleaned up.
 *
 * @returns {Promise<Record<string, boolean>>}
 */
async function registryChecks() {
  const { createStore } = await import("./src/storage/store.js");
  const { createRegistry } = await import("./src/background/registry.js");
  const store = createStore(browser.storage.local);
  const registry = createRegistry({
    store,
    identities: browser.contextualIdentities,
  });
  const key = "aws:111122223333:SmokeTest";
  const before = await browser.contextualIdentities.query({});

  const first = await registry.getOrCreate(key, null);
  const second = await registry.getOrCreate(key, null);
  const during = await browser.contextualIdentities.query({});
  const created = during.filter(
    (identity) =>
      !before.some((old) => old.cookieStoreId === identity.cookieStoreId),
  );

  const removed = await registry.removeUnused(browser.tabs);
  const after = await browser.contextualIdentities.query({});

  return {
    "the second call reuses the first container": first === second,
    "two calls for one key leave one container": created.length === 1,
    "the container is named from its key":
      created[0]?.name === "111122223333(unknown) / SmokeTest",
    "an unused managed container can be removed":
      removed.includes(key) && after.length === before.length,
  };
}

async function report() {
  /** @type {Record<string, unknown>} */
  const result = { loaded: true };
  try {
    const granted = await browser.permissions.getAll();
    result.origins = granted.origins ?? [];
    result.checks = await registryChecks();
  } catch (error) {
    errors.push(`driver: ${String(error)}`);
  }
  result.errors = errors;
  await fetch(REPORT_URL, { method: "POST", body: JSON.stringify(result) });
}

// Give the real background script a moment to load and fail if it is going to.
setTimeout(report, 1500);
