// Background entry point. Firefox stops this script when it is idle and
// starts it again for the next event, so every listener must be registered
// synchronously at the top level, on every start, and nothing that matters
// may live only in memory.

import { enrolmentOffer } from "../core/enrol.js";
import { createStore } from "../storage/store.js";
import { refreshAccess } from "./access.js";
import {
  ACCOUNT_LIST_URLS,
  createAwsHandlers,
  FEDERATION_URLS,
  PORTAL_PAGE_URLS,
} from "./aws.js";
import { createNavigationListener, NAVIGATION_URLS } from "./navigation.js";
import { createNotifier } from "./notices.js";
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

const notifier = createNotifier({ store, action: browser.action });
const aws = createAwsHandlers({
  store,
  registry,
  notifier,
  tabs: browser.tabs,
  webRequest: browser.webRequest,
  reportFailure,
});
const onNavigation = createNavigationListener({
  store,
  registry,
  tabs: browser.tabs,
  reportFailure,
});

// ─── Storage ────────────────────────────────────────────────────────

// The options page writes to the same storage from another context.
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  store.invalidate();
  // The options page clears the notice once it has been seen.
  if ("notice" in changes) {
    notifier.sync().catch(reportFailure("could not update the badge"));
  }
});

// The badge does not survive a browser restart; put it back if a notice is
// still waiting, or if storage cannot be read at all.
notifier.sync().catch(reportFailure("could not update the badge"));

// ─── Requests ───────────────────────────────────────────────────────
//
// Firefox only delivers a request to these listeners if the user has
// granted the extension that address (and, for a request made by a page,
// the page's address), so the patterns here are deliberately the widest the
// manifest allows to be requested. What is acted on is decided per request,
// from the enrolled organizations.

// AWS access portals and Okta admin consoles, into their containers.
browser.webRequest.onBeforeRequest.addListener(
  onNavigation,
  { urls: [...NAVIGATION_URLS], types: ["main_frame"] },
  ["blocking"],
);

// The portal's sign-in response, which becomes a console in its container.
browser.webRequest.onBeforeRequest.addListener(
  aws.onFederationRequest,
  { urls: [...FEDERATION_URLS], types: ["xmlhttprequest"] },
  ["blocking"],
);

// The portal's account list, for account names.
browser.webRequest.onBeforeRequest.addListener(
  aws.onAccountListRequest,
  { urls: [...ACCOUNT_LIST_URLS], types: ["xmlhttprequest"] },
  ["blocking"],
);

// Shortcut tabs, to notice a portal enrolled with the wrong region.
browser.tabs.onUpdated.addListener(aws.onTabUpdated, {
  urls: [...PORTAL_PAGE_URLS],
  properties: ["url"],
});

// ─── Containers ─────────────────────────────────────────────────────

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
