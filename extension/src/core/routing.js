// Decides whether a top-level navigation should be moved into a container.
//
// Only a GET, in a tab that is in no container, outside a private window, to
// an enrolled organization whose kind is switched on, is moved. Everything
// else is left exactly where it is.

/** @import { OrganizationKind, RoutingDecision, Settings, Target } from "./types.js" */

/** The cookie store of a tab that is in no container. */
export const DEFAULT_STORE = "firefox-default";

const EMPTY_TAB_URLS = new Set(["about:blank", "about:newtab", "about:home"]);

/**
 * @typedef {object} NavigationFacts
 * @property {string} method The request method.
 * @property {boolean} incognito Whether the tab is in a private window.
 * @property {string} cookieStoreId The cookie store of the tab.
 * @property {Target | null} target What the address classified as.
 */

/**
 * @param {OrganizationKind} kind
 * @param {Settings} settings
 * @returns {boolean}
 */
export function isKindEnabled(kind, settings) {
  return kind === "aws-portal"
    ? settings.awsPortalsEnabled
    : settings.oktaAdminEnabled;
}

/**
 * @param {NavigationFacts} facts
 * @param {Settings} settings
 * @returns {RoutingDecision}
 */
export function decideRouting(facts, settings) {
  // A POST body cannot be replayed from a URL, and identity-provider
  // sign-in responses arrive as POSTs that must stay in their tab.
  if (facts.method !== "GET") return { action: "leave", reason: "not-get" };
  // Containers do not exist in private windows.
  if (facts.incognito) return { action: "leave", reason: "private-window" };
  // A tab already in a container was put there on purpose, by the user or
  // by this extension. This is also what prevents a routing loop.
  if (facts.cookieStoreId !== DEFAULT_STORE) {
    return { action: "leave", reason: "in-container" };
  }
  if (!facts.target) return { action: "leave", reason: "not-a-target" };
  if (!isKindEnabled(facts.target.kind, settings)) {
    return { action: "leave", reason: "kind-disabled" };
  }
  return { action: "route", target: facts.target };
}

/**
 * Whether a tab had nothing in it, so that it can be closed once its
 * navigation has been moved to another tab.
 *
 * @param {string | undefined} url The tab's current address.
 * @returns {boolean}
 */
export function isEmptyTab(url) {
  return url === undefined || url === "" || EMPTY_TAB_URLS.has(url);
}
