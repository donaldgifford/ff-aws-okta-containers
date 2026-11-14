// Target keys. A key, never a name, identifies a container.
//
//   aws:<account id>:<permission set>   an AWS console
//   aws-portal:<portal host>            an AWS access portal
//   okta-admin:<tenant host>            an Okta admin console

/**
 * @typedef {{ kind: "aws-console", accountId: string, role: string }
 *   | { kind: "aws-portal", host: string }
 *   | { kind: "okta-admin", host: string }} ParsedKey
 */

/**
 * @param {string} accountId
 * @param {string} role
 * @returns {string}
 */
export function consoleKey(accountId, role) {
  return `aws:${accountId}:${role}`;
}

/**
 * @param {string} host
 * @returns {string}
 */
export function portalKey(host) {
  return `aws-portal:${host}`;
}

/**
 * @param {string} tenantHost The tenant's host without `-admin`.
 * @returns {string}
 */
export function oktaKey(tenantHost) {
  return `okta-admin:${tenantHost}`;
}

/**
 * @param {string} key
 * @returns {ParsedKey | null}
 */
export function parseKey(key) {
  const separator = key.indexOf(":");
  if (separator < 0) return null;
  const prefix = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  if (rest === "") return null;

  switch (prefix) {
    case "aws": {
      const colon = rest.indexOf(":");
      if (colon <= 0 || colon === rest.length - 1) return null;
      return {
        kind: "aws-console",
        accountId: rest.slice(0, colon),
        role: rest.slice(colon + 1),
      };
    }
    case "aws-portal":
      return { kind: "aws-portal", host: rest };
    case "okta-admin":
      return { kind: "okta-admin", host: rest };
    default:
      return null;
  }
}
