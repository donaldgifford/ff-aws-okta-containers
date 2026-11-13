// Background entry point. Firefox stops this script when it is idle and
// starts it again for the next event, so every listener must be registered
// synchronously at the top level, on every start, and nothing that matters
// may live only in memory.

import { createStore } from "../storage/store.js";
import { createRegistry } from "./registry.js";

const store = createStore(browser.storage.local);
const registry = createRegistry({
  store,
  identities: browser.contextualIdentities,
});

/**
 * Logs a failure. Only ever given an error and a fixed description: never a
 * URL, a response body or anything else that could carry a token.
 *
 * @param {string} what
 * @returns {(error: unknown) => void}
 */
function reportFailure(what) {
  return (error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[containers] ${what}: ${detail}`);
  };
}

// The options page writes to the same storage from another context.
browser.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") store.invalidate();
});

// A managed container deleted in Firefox's settings: forget the mapping, so
// the next use creates a fresh one.
browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
  registry
    .forget(contextualIdentity.cookieStoreId)
    .catch(reportFailure("could not forget a removed container"));
});
