// Works out whether an address belongs to an enrolled AWS access portal or
// Okta admin console. AWS consoles are not classified here: they are
// identified from the portal's sign-in request (see federation.js).

/** @import { Organization, Target } from "./types.js" */

import { oktaKey, portalKey } from "./keys.js";

export const OKTA_BASE_DOMAINS = Object.freeze([
  "okta.com",
  "oktapreview.com",
  "okta-emea.com",
]);

const ADMIN_SUFFIX = "-admin";
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const AWSAPPS_SUFFIX = ".awsapps.com";
// <id>.portal.<region>.app.aws and <tenant>.account-access.<region>.app.aws.
// Recognised, but not yet tested against a real portal.
const APP_AWS_PORTAL =
  /^[a-z0-9-]+\.(?:portal|account-access)\.([a-z0-9-]+)\.app\.aws$/;

/**
 * @typedef {object} PortalHost
 * @property {string} host
 * @property {string} name The first label: a directory ID or an alias.
 * @property {string | null} region The region, when the host carries it.
 */

/**
 * @typedef {object} OktaHost
 * @property {string} org The org name, without `-admin`.
 * @property {string} baseDomain
 * @property {string} tenantHost `<org>.<base domain>`
 * @property {string} adminHost `<org>-admin.<base domain>`
 * @property {boolean} isAdmin Whether the host given was the admin host.
 */

/**
 * @param {string} hostname
 * @returns {PortalHost | null}
 */
export function parsePortalHost(hostname) {
  const host = hostname.toLowerCase();
  if (host.endsWith(AWSAPPS_SUFFIX)) {
    const name = host.slice(0, -AWSAPPS_SUFFIX.length);
    return HOST_LABEL.test(name) ? { host, name, region: null } : null;
  }
  const match = APP_AWS_PORTAL.exec(host);
  if (match?.[1]) {
    return { host, name: host.slice(0, host.indexOf(".")), region: match[1] };
  }
  return null;
}

/**
 * Recognises `<org>.<base>` and `<org>-admin.<base>` under an Okta base
 * domain. Anything with more than one label in front of the base domain, or
 * with no org name, is not an Okta tenant.
 *
 * @param {string} hostname
 * @returns {OktaHost | null}
 */
export function parseOktaHost(hostname) {
  const host = hostname.toLowerCase();
  for (const baseDomain of OKTA_BASE_DOMAINS) {
    if (!host.endsWith(`.${baseDomain}`)) continue;
    const label = host.slice(0, -(baseDomain.length + 1));
    const isAdmin = label.endsWith(ADMIN_SUFFIX);
    const org = isAdmin ? label.slice(0, -ADMIN_SUFFIX.length) : label;
    if (!HOST_LABEL.test(org)) return null;
    return {
      org,
      baseDomain,
      tenantHost: `${org}.${baseDomain}`,
      adminHost: `${org}${ADMIN_SUFFIX}.${baseDomain}`,
      isAdmin,
    };
  }
  return null;
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isStartPath(pathname) {
  return pathname === "/start" || pathname.startsWith("/start/");
}

/**
 * @param {string} key
 * @param {readonly Organization[]} organizations
 * @returns {Target | null}
 */
function targetFor(key, organizations) {
  const organization = organizations.find((item) => item.key === key);
  return organization ? { kind: organization.kind, key, organization } : null;
}

/**
 * The enrolled portal served from this host, if any.
 *
 * @param {string} hostname
 * @param {readonly Organization[]} organizations
 * @returns {Organization | null}
 */
export function findPortal(hostname, organizations) {
  const key = portalKey(hostname.toLowerCase());
  const found = organizations.find((item) => item.key === key);
  return found?.kind === "aws-portal" ? found : null;
}

/**
 * Classifies a top-level address. Only enrolled organizations match; a
 * portal or tenant that has not been enrolled is invisible.
 *
 * @param {string} url
 * @param {readonly Organization[]} organizations
 * @returns {Target | null}
 */
export function classify(url, organizations) {
  if (!URL.canParse(url)) return null;
  const { protocol, hostname, pathname } = new URL(url);
  if (protocol !== "https:") return null;

  const portal = parsePortalHost(hostname);
  if (portal) {
    // An awsapps.com host serves other applications too; the portal is the
    // part under /start.
    if (portal.region === null && !isStartPath(pathname)) return null;
    return targetFor(portalKey(portal.host), organizations);
  }

  const okta = parseOktaHost(hostname);
  if (okta?.isAdmin) {
    return targetFor(oktaKey(okta.tenantHost), organizations);
  }
  return null;
}
