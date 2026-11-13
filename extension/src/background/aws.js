// AWS consoles: the hand-off that opens each console in the container for
// its account and role, and the account names that go into container names.
//
// The portal asks its API for a sign-in token and then sends the browser to
// AWS sign-in with it. The federation listener holds that response, opens
// the sign-in address in the account's container, and keeps the response
// from the page. If anything at all goes wrong, the response is released to
// the page unchanged, so sign-in carries on as it would without the
// extension, and the toolbar button shows a warning.
//
// Nothing here logs or stores a response body or a URL built from one.

/** @import { Registry } from "./registry.js" */
/** @import { Notifier } from "./notices.js" */
/** @import { Store } from "../storage/store.js" */

import { isAccountListRequest, parseAccountList } from "../core/accounts.js";
import { findPortal } from "../core/classify.js";
import { isApiUrl } from "../core/enrol.js";
import {
  HAND_OFF_FAILURES,
  isFederationRequest,
  isShortcutTab,
  planHandOff,
} from "../core/federation.js";
import { readResponse } from "./response.js";
import { openBeside, tabOrNull } from "./tabs.js";

/** How long a shortcut tab may sit with no sign-in request seen. */
export const REGION_CHECK_MS = 5000;

export const FEDERATION_URLS = Object.freeze([
  "https://*.amazonaws.com/federation/console?*",
]);
export const ACCOUNT_LIST_URLS = Object.freeze([
  "https://*.amazonaws.com/instance/appinstances*",
]);
export const PORTAL_PAGE_URLS = Object.freeze([
  "https://*.awsapps.com/*",
  "https://*.app.aws/*",
]);

const OPENED_BY_PORTAL = "The console opened without its own container.";

/**
 * @typedef {object} AwsHandlers
 * @property {browser.webRequest.BeforeRequestListener} onFederationRequest
 * @property {browser.webRequest.BeforeRequestListener} onAccountListRequest
 * @property {browser.tabs.UpdatedListener} onTabUpdated
 */

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @param {Notifier} dependencies.notifier
 * @param {Pick<typeof browser.tabs, "get" | "create" | "remove">} dependencies.tabs
 * @param {Pick<typeof browser.webRequest, "filterResponseData">} dependencies.webRequest
 * @param {(what: string) => (error: unknown) => void} dependencies.reportFailure
 * @param {(task: () => void, ms: number) => void} [dependencies.schedule]
 * @param {() => Date} [dependencies.now]
 * @returns {AwsHandlers}
 */
export function createAwsHandlers({
  store,
  registry,
  notifier,
  tabs,
  webRequest,
  reportFailure,
  schedule = (task, ms) => {
    setTimeout(task, ms);
  },
  now = () => new Date(),
}) {
  // Tabs a sign-in request was recently seen from. Only used for the
  // wrong-region check, and harmless to lose.
  /** @type {Set<number>} */
  const signInSeen = new Set();

  /**
   * The enrolled portal a request came from, if any.
   *
   * @param {browser.webRequest.RequestDetails} details
   * @returns {Promise<{ portal: import("../core/types.js").Organization, issuer: string, state: import("../storage/schema.js").State } | null>}
   */
  async function requestingPortal(details) {
    const issuer = details.originUrl ?? details.documentUrl ?? "";
    if (!URL.canParse(issuer)) return null;
    const state = await store.load();
    const portal = findPortal(
      new URL(issuer).hostname,
      Object.values(state.organizations),
    );
    return portal ? { portal, issuer, state } : null;
  }

  /**
   * @param {browser.webRequest.RequestDetails} details
   * @param {string} body The sign-in response. Contains a token.
   * @returns {Promise<boolean>} True if the console was opened in its
   *   container and the response must be kept from the page.
   */
  async function handOff(details, body) {
    const source = await requestingPortal(details);
    // A portal that is not enrolled, or consoles switched off: not ours.
    if (!source?.state.settings.awsConsolesEnabled) return false;

    const tab = await tabOrNull(tabs, details.tabId);
    if (tab?.incognito) return false;

    const plan = planHandOff({
      requestUrl: details.url,
      responseBody: body,
      issuer: source.issuer,
      tabUrl: tab?.url,
    });
    if (!plan.ok) {
      await notifier.warn(
        `${HAND_OFF_FAILURES[plan.reason]} ${OPENED_BY_PORTAL}`,
      );
      return false;
    }

    try {
      const cookieStoreId = await registry.getOrCreate(
        plan.key,
        source.portal.key,
      );
      await openBeside(tabs, plan.signInUrl, cookieStoreId, tab);
    } catch (error) {
      reportFailure("could not open a console in its container")(error);
      await notifier.warn(
        `The container for this account could not be opened. ${OPENED_BY_PORTAL}`,
      );
      return false;
    }

    // The portal opens a role in a new tab at …/#/console?…, which now has
    // nothing to show. Any other tab, such as the portal itself, stays.
    if (tab?.id !== undefined && isShortcutTab(tab.url)) {
      tabs
        .remove(tab.id)
        .catch(reportFailure("could not close a shortcut tab"));
    }
    return true;
  }

  /** @type {browser.webRequest.BeforeRequestListener} */
  function onFederationRequest(details) {
    if (details.method !== "GET" || details.incognito) return {};
    if (!isApiUrl(details.url) || !isFederationRequest(details.url)) return {};

    signInSeen.add(details.tabId);
    // The filter has to be attached before this listener returns. Whether
    // the request is one to act on is decided once the body has arrived;
    // until then the page is kept waiting, and if in doubt it gets the
    // response exactly as the portal sent it.
    readResponse(webRequest.filterResponseData(details.requestId), {
      hold: true,
      onComplete: (body) => handOff(details, body),
      onError: (error) => {
        reportFailure("the console hand-off failed")(error);
        notifier
          .warn(`The console hand-off failed. ${OPENED_BY_PORTAL}`)
          .catch(reportFailure("could not record a warning"));
      },
    });
    return {};
  }

  /**
   * @param {browser.webRequest.RequestDetails} details
   * @param {string} body
   * @returns {Promise<void>}
   */
  async function saveAccounts(details, body) {
    const listed = parseAccountList(body);
    if (listed.length === 0) return;
    const source = await requestingPortal(details);
    if (!source?.state.settings.awsConsolesEnabled) return;

    const { portal, state } = source;
    const fresh = listed.filter(({ accountId, name }) => {
      const known = state.accounts[accountId];
      return known?.name !== name || known.orgKey !== portal.key;
    });
    if (fresh.length === 0) return;

    const seenAt = now().toISOString();
    await store.update((draft) => {
      for (const { accountId, name } of fresh) {
        draft.accounts[accountId] = {
          accountId,
          name,
          orgKey: portal.key,
          seenAt,
        };
      }
    });
    // A console opened before its account's name was known is named with
    // the account ID; rename it now.
    await registry.syncNames();
  }

  /** @type {browser.webRequest.BeforeRequestListener} */
  function onAccountListRequest(details) {
    if (details.incognito || !isApiUrl(details.url)) return {};
    if (!isAccountListRequest(details.method, details.url)) return {};

    readResponse(webRequest.filterResponseData(details.requestId), {
      hold: false,
      onComplete: async (body) => {
        await saveAccounts(details, body);
        return false;
      },
      onError: reportFailure("could not read the account list"),
    });
    return {};
  }

  /**
   * Warns if a shortcut tab is still waiting and no sign-in request was
   * seen from it: the usual cause is a portal enrolled with the wrong
   * region, whose API the extension therefore cannot see.
   *
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  async function checkRegion(tabId) {
    if (signInSeen.delete(tabId)) return;
    const tab = await tabOrNull(tabs, tabId);
    if (!tab?.url || tab.incognito || !isShortcutTab(tab.url)) return;

    const state = await store.load();
    if (!state.settings.awsConsolesEnabled) return;
    const portal = findPortal(
      new URL(tab.url).hostname,
      Object.values(state.organizations),
    );
    if (!portal?.accessGranted) return;
    await notifier.warn(
      `No sign-in request was seen from ${portal.label}. Its region (${portal.region ?? "none"}) may be wrong; it can be changed on the options page.`,
    );
  }

  /** @type {browser.tabs.UpdatedListener} */
  function onTabUpdated(tabId, changeInfo, tab) {
    if (tab.incognito || !isShortcutTab(changeInfo.url)) return;
    schedule(() => {
      checkRegion(tabId).catch(reportFailure("could not check a shortcut tab"));
    }, REGION_CHECK_MS);
  }

  return { onFederationRequest, onAccountListRequest, onTabUpdated };
}
