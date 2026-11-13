// Background entry point. Firefox stops this script when it is idle and
// starts it again for the next event, so every listener must be registered
// synchronously at the top level, on every start, and nothing that matters
// may live only in memory.

import { enrolmentOffer } from "../core/enrol.js";
import { createStore } from "../storage/store.js";
import { refreshAccess } from "./access.js";
import { createRegistry } from "./registry.js";

const OPTIONS_PAGE = "src/options/options.html";

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

// ─── Enrolment ──────────────────────────────────────────────────────

/**
 * Opens the options page. If the tab the button was clicked on is a portal
 * or Okta tenant that is not enrolled yet, the add form is filled in with
 * its address.
 *
 * @param {browser.tabs.Tab} tab
 * @returns {Promise<void>}
 */
async function openOptions(tab) {
  const state = await store.load().catch(() => null);
  const offer =
    state && !tab.incognito
      ? enrolmentOffer(tab.url, Object.values(state.organizations))
      : null;
  if (offer === null) {
    await browser.runtime.openOptionsPage();
    return;
  }
  const query = new URLSearchParams({ add: offer });
  if (tab.id !== undefined) query.set("tab", String(tab.id));
  await browser.tabs.create({
    url: `${browser.runtime.getURL(OPTIONS_PAGE)}?${query}`,
    index: tab.index + 1,
    ...(tab.windowId === undefined ? {} : { windowId: tab.windowId }),
  });
}

browser.action.onClicked.addListener((tab) => {
  openOptions(tab).catch(reportFailure("could not open the options page"));
});

/** Brings each organization's access status in line with Firefox. */
function checkAccess() {
  refreshAccess({ store, permissions: browser.permissions }).catch(
    reportFailure("could not check site access"),
  );
}

// A grant can be given or taken away in the add-on manager at any time.
browser.permissions.onAdded.addListener(checkAccess);
browser.permissions.onRemoved.addListener(checkAccess);
// And it may have changed while this script was not running.
checkAccess();
