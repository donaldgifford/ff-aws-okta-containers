// Reads account names out of the portal's own account list, so a console
// container can be named after the account instead of its twelve-digit ID.

const ACCOUNT_ID = /^\d{12}$/;
const MAX_NAME_LENGTH = 128;

const ACCOUNT_LIST_PATH = "/instance/appinstances";

/**
 * Whether a request is the portal fetching its account list. The portal
 * sends it as a POST, after an OPTIONS preflight that has no body to read.
 *
 * @param {string} method
 * @param {string} url
 * @returns {boolean}
 */
export function isAccountListRequest(method, url) {
  if (method === "OPTIONS" || !URL.canParse(url)) return false;
  const { protocol, pathname } = new URL(url);
  return protocol === "https:" && pathname === ACCOUNT_LIST_PATH;
}

/**
 * @typedef {object} ListedAccount
 * @property {string} accountId
 * @property {string} name
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts account IDs and names from an account-list response body. Entries
 * that are not AWS accounts, or are malformed, are skipped; a body that is
 * not the expected shape yields nothing.
 *
 * @param {string} text The response body.
 * @returns {ListedAccount[]} One entry per account ID.
 */
export function parseAccountList(text) {
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(body) || !Array.isArray(body.result)) return [];

  /** @type {Map<string, string>} */
  const names = new Map();
  for (const item of body.result) {
    if (!isRecord(item) || !isRecord(item.searchMetadata)) continue;
    const { AccountId: accountId, AccountName: accountName } =
      item.searchMetadata;
    if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) continue;
    if (typeof accountName !== "string") continue;
    const name = accountName.trim().slice(0, MAX_NAME_LENGTH);
    if (name !== "") names.set(accountId, name);
  }
  return [...names].map(([accountId, name]) => ({ accountId, name }));
}
