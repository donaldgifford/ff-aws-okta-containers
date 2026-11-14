// Moves top-level navigations to enrolled AWS access portals and Okta admin
// consoles out of tabs that are in no container.
//
// A tab cannot change container, so "moving" means opening the address in a
// new tab in the right container and cancelling the request in the old one.
// If that cannot be done, the original request simply goes ahead.

/** @import { Organization } from "../core/types.js" */
/** @import { Store } from "../storage/store.js" */
/** @import { Registry } from "./registry.js" */

import { classify } from "../core/classify.js";
import { DEFAULT_STORE, decideRouting, isEmptyTab } from "../core/routing.js";
import { openBeside, tabOrNull } from "./tabs.js";

export const NAVIGATION_URLS = Object.freeze([
  "https://*.awsapps.com/*",
  "https://*.app.aws/*",
  "https://*.okta.com/*",
  "https://*.oktapreview.com/*",
  "https://*.okta-emea.com/*",
]);

/**
 * @typedef {object} NavigationDependencies
 * @property {Store} store
 * @property {Registry} registry
 * @property {Pick<typeof browser.tabs, "get" | "create" | "remove">} tabs
 * @property {(what: string) => (error: unknown) => void} reportFailure
 */

/**
 * Opens a tab's navigation in the right container, if it belongs in one.
 *
 * @param {NavigationDependencies} dependencies
 * @param {object} navigation
 * @param {string} navigation.url
 * @param {string} navigation.method
 * @param {browser.tabs.Tab | null} navigation.tab
 * @param {readonly Organization[]} [navigation.organizations] Consider only
 *   these organizations instead of everything enrolled.
 * @returns {Promise<boolean>} True if the address was opened in a container.
 */
async function move(
  { store, registry, tabs },
  { url, method, tab, organizations },
) {
  if (!tab) return false;
  const state = await store.load();
  const target = classify(
    url,
    organizations ?? Object.values(state.organizations),
  );
  const decision = decideRouting(
    {
      method,
      incognito: tab.incognito,
      cookieStoreId: tab.cookieStoreId ?? DEFAULT_STORE,
      target,
    },
    state.settings,
  );
  if (decision.action === "leave") return false;

  const { key } = decision.target;
  const cookieStoreId = await registry.getOrCreate(key, key);
  await openBeside(tabs, url, cookieStoreId, tab);
  return true;
}

/**
 * @param {NavigationDependencies} dependencies
 * @returns {browser.webRequest.BeforeRequestListener}
 */
export function createNavigationListener(dependencies) {
  const { tabs, reportFailure } = dependencies;

  return async function onNavigation(details) {
    // Cheap exits first: most of these never need storage or the tab.
    if (details.method !== "GET" || details.incognito) return {};

    try {
      const tab = await tabOrNull(tabs, details.tabId);
      const moved = await move(dependencies, {
        url: details.url,
        method: details.method,
        tab,
      });
      if (!moved) return {};

      // The tab the navigation was taken from had nothing in it: a new tab,
      // or one a link opened. Otherwise it stays on the page it was showing.
      if (tab?.id !== undefined && isEmptyTab(tab.url)) {
        tabs
          .remove(tab.id)
          .catch(reportFailure("could not close an empty tab"));
      }
      return { cancel: true };
    } catch (error) {
      // Could not create the container or open the tab: let the original
      // request proceed where it is.
      reportFailure("could not move a navigation into its container")(error);
      return {};
    }
  };
}

/**
 * After an organization is enrolled, reopens the tab enrolment was started
 * from in the organization's container, and closes the original.
 *
 * @param {NavigationDependencies} dependencies
 * @param {number} tabId
 * @param {Organization} organization
 * @returns {Promise<boolean>} True if the tab was reopened.
 */
export async function reopenInContainer(dependencies, tabId, organization) {
  const { tabs } = dependencies;
  const tab = await tabOrNull(tabs, tabId);
  if (!tab?.url) return false;
  const moved = await move(dependencies, {
    url: tab.url,
    method: "GET",
    tab,
    organizations: [organization],
  });
  if (moved && tab.id !== undefined) await tabs.remove(tab.id);
  return moved;
}
