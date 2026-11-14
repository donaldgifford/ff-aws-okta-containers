// The AWS console hand-off, as functions of plain data.
//
// The access portal asks its API for a sign-in token and then sends the
// browser to the AWS sign-in address with it. These functions validate that
// exchange and build the sign-in address, so the background script can open
// it in the account's container instead.
//
// A sign-in token passes through here once, on its way into a URL. Nothing
// in this file logs or keeps one, and failures carry a reason, never a
// value from the response.

import { consoleKey } from "./keys.js";

const ACCOUNT_ID = /^\d{12}$/;
// The characters IAM allows in a role name.
const ROLE_NAME = /^[\w+=,.@-]{1,64}$/;
const FEDERATION_PATH = "/federation/console";
const SIGN_IN_HOST = /^(?:[a-z0-9-]+\.)?signin\.aws\.amazon\.com$/;
const CONSOLE_HOST = /^(?:[a-z0-9-]+\.)*aws\.amazon\.com$/;
const SHORTCUT_MARKER = "#/console";

export const CONSOLE_HOME = "https://console.aws.amazon.com/";

/**
 * Why a hand-off was abandoned, with the text shown to the user.
 */
export const HAND_OFF_FAILURES = Object.freeze({
  "bad-request": "The sign-in request was missing an account or role.",
  "empty-body": "The portal's sign-in response was empty.",
  "not-json": "The portal's sign-in response was not JSON.",
  "missing-token": "The portal's sign-in response had no sign-in token.",
  "missing-location": "The portal's sign-in response had no sign-in address.",
  "untrusted-location":
    "The portal's sign-in response pointed somewhere other than AWS sign-in.",
});

/** @typedef {keyof typeof HAND_OFF_FAILURES} HandOffFailure */

/**
 * @typedef {object} FederationRequest
 * @property {string} accountId
 * @property {string} roleName
 * @property {string} key The container key for this account and role.
 */

/**
 * @typedef {object} FederationResponse
 * @property {string} signInToken
 * @property {string} signInLocation Origin and path of the AWS sign-in
 *   address, validated.
 * @property {string | null} destination
 */

/**
 * @typedef {object} HandOff
 * @property {true} ok
 * @property {string} accountId
 * @property {string} roleName
 * @property {string} key
 * @property {string} signInUrl
 */

/**
 * @typedef {HandOff | { ok: false, reason: HandOffFailure }} HandOffPlan
 */

/**
 * Whether a request is the portal asking for a console sign-in token: the
 * federation path with both an account and a role named. The values are
 * checked later, by parseFederationRequest.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isFederationRequest(url) {
  if (!URL.canParse(url)) return false;
  const { protocol, pathname, searchParams } = new URL(url);
  return (
    protocol === "https:" &&
    pathname === FEDERATION_PATH &&
    Boolean(searchParams.get("account_id")) &&
    Boolean(searchParams.get("role_name"))
  );
}

/**
 * Reads the account and role from a portal sign-in request.
 *
 * @param {string} url The request URL.
 * @returns {FederationRequest | null} Null if this is not a sign-in request
 *   for a well-formed account and role.
 */
export function parseFederationRequest(url) {
  if (!URL.canParse(url)) return null;
  const { protocol, pathname, searchParams } = new URL(url);
  if (protocol !== "https:" || pathname !== FEDERATION_PATH) return null;

  const accountId = searchParams.get("account_id") ?? "";
  const roleName = searchParams.get("role_name") ?? "";
  if (!ACCOUNT_ID.test(accountId) || !ROLE_NAME.test(roleName)) return null;
  return { accountId, roleName, key: consoleKey(accountId, roleName) };
}

/**
 * Accepts only an https address on the AWS sign-in host or a region
 * subdomain of it, and returns it without any query or fragment.
 *
 * @param {string} location
 * @returns {string | null}
 */
export function trustedSignInLocation(location) {
  if (!URL.canParse(location)) return null;
  const url = new URL(location);
  const trusted =
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    SIGN_IN_HOST.test(url.hostname);
  return trusted ? `${url.origin}${url.pathname}` : null;
}

/**
 * @param {unknown} value
 * @returns {string | null} The value, if it is an https AWS console address.
 */
function consoleDestination(value) {
  if (typeof value !== "string" || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" && CONSOLE_HOST.test(url.hostname)
    ? value
    : null;
}

/**
 * @param {string} text The response body.
 * @returns {({ ok: true } & FederationResponse) | { ok: false, reason: HandOffFailure }}
 */
export function parseFederationResponse(text) {
  if (text.trim() === "") return { ok: false, reason: "empty-body" };

  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "not-json" };
  }

  const { signInToken, signInFederationLocation, destination } =
    /** @type {Record<string, unknown>} */ (body);
  if (typeof signInToken !== "string" || signInToken === "") {
    return { ok: false, reason: "missing-token" };
  }
  if (
    typeof signInFederationLocation !== "string" ||
    signInFederationLocation === ""
  ) {
    return { ok: false, reason: "missing-location" };
  }
  const signInLocation = trustedSignInLocation(signInFederationLocation);
  if (!signInLocation) return { ok: false, reason: "untrusted-location" };

  return {
    ok: true,
    signInToken,
    signInLocation,
    destination: consoleDestination(destination),
  };
}

/**
 * Whether a tab is one the portal opened only to start a console session:
 * its address is the portal's shortcut page, `…/start/#/console?…`.
 *
 * @param {string | undefined} tabUrl
 * @returns {boolean}
 */
export function isShortcutTab(tabUrl) {
  return tabUrl?.includes(SHORTCUT_MARKER) ?? false;
}

/**
 * The destination carried by a shortcut link, if the tab is on one.
 *
 * @param {string | undefined} tabUrl
 * @returns {string | null}
 */
export function shortcutDestination(tabUrl) {
  if (!tabUrl || !isShortcutTab(tabUrl)) return null;
  const fragment = tabUrl.slice(tabUrl.indexOf(SHORTCUT_MARKER));
  const query = fragment.indexOf("?");
  if (query < 0) return null;
  const params = new URLSearchParams(fragment.slice(query + 1));
  return consoleDestination(params.get("destination"));
}

/**
 * The shortcut link's destination if it has one, otherwise the response's,
 * otherwise the console home page.
 *
 * @param {string | undefined} tabUrl
 * @param {string | null} responseDestination
 * @returns {string}
 */
export function chooseDestination(tabUrl, responseDestination) {
  return shortcutDestination(tabUrl) ?? responseDestination ?? CONSOLE_HOME;
}

/**
 * @param {object} parts
 * @param {string} parts.signInLocation
 * @param {string} parts.signInToken
 * @param {string} parts.issuer The portal page that asked for the token.
 * @param {string} parts.destination
 * @returns {string}
 */
export function buildSignInUrl({
  signInLocation,
  signInToken,
  issuer,
  destination,
}) {
  const query = [
    "Action=login",
    `SigninToken=${encodeURIComponent(signInToken)}`,
    `Issuer=${encodeURIComponent(issuer)}`,
    `Destination=${encodeURIComponent(destination)}`,
  ].join("&");
  return `${signInLocation}?${query}`;
}

/**
 * Turns one sign-in exchange into the address to open in the account's
 * container, or a reason to hand the response back to the page untouched.
 *
 * @param {object} exchange
 * @param {string} exchange.requestUrl The portal API request.
 * @param {string} exchange.responseBody The portal API response.
 * @param {string} exchange.issuer The portal page that made the request.
 * @param {string | undefined} exchange.tabUrl The address of the tab the
 *   request came from.
 * @returns {HandOffPlan}
 */
export function planHandOff({ requestUrl, responseBody, issuer, tabUrl }) {
  const request = parseFederationRequest(requestUrl);
  if (!request) return { ok: false, reason: "bad-request" };

  const response = parseFederationResponse(responseBody);
  if (!response.ok) return response;

  return {
    ok: true,
    accountId: request.accountId,
    roleName: request.roleName,
    key: request.key,
    signInUrl: buildSignInUrl({
      signInLocation: response.signInLocation,
      signInToken: response.signInToken,
      issuer,
      destination: chooseDestination(tabUrl, response.destination),
    }),
  };
}
