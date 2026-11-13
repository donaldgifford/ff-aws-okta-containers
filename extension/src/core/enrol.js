// Enrolment: turning an address the user typed, or the address of the tab
// they were on, into an organization and the exact addresses Firefox will be
// asked to grant.
//
// Everything here is synchronous on purpose. Firefox only shows a permission
// prompt if it is requested straight from a click, before anything is
// awaited, so the Add button must be able to work out what to request
// without waiting for anything.

/** @import { Organization, OrganizationKind } from "./types.js" */

import { parseOktaHost, parsePortalHost } from "./classify.js";
import { oktaKey, portalKey } from "./keys.js";

const MAX_LABEL_LENGTH = 40;
const OKTA_LABEL_SUFFIX = Object.freeze(
  /** @type {Record<string, string>} */ ({
    "oktapreview.com": " (preview)",
    "okta-emea.com": " (emea)",
  }),
);

/**
 * Why an address could not be enrolled, with the text shown to the user.
 */
export const ENROL_FAILURES = Object.freeze({
  "not-recognised":
    "That is not an AWS access portal or an Okta address. Expected something like d-1234567890.awsapps.com or acme-admin.okta.com.",
  "region-required": "Choose the AWS region this portal is in.",
  "unknown-region": "That is not a region this version knows about.",
  "region-mismatch":
    "That region does not match the one in the portal's address.",
});

/** @typedef {keyof typeof ENROL_FAILURES} EnrolFailure */

/**
 * @typedef {object} RecognisedAddress
 * @property {OrganizationKind} kind
 * @property {string} key
 * @property {string} host The portal host, or the Okta tenant host without
 *   `-admin`.
 * @property {string | null} region The region, if the address carries it.
 * @property {string} suggestedLabel The org name for Okta; empty for a
 *   portal, whose label is always the user's choice.
 */

/**
 * @typedef {object} Enrolment
 * @property {true} ok
 * @property {OrganizationKind} kind
 * @property {string} key
 * @property {string} host
 * @property {string | null} region
 * @property {string[]} origins The match patterns to ask Firefox for.
 * @property {string} suggestedLabel
 */

/**
 * @typedef {Enrolment | { ok: false, reason: EnrolFailure }} EnrolmentPlan
 */

/**
 * @param {string} region
 * @returns {string} The portal API host for a region.
 */
export function apiHost(region) {
  return `portal.sso.${region}.amazonaws.com`;
}

const API_HOST = /^portal\.sso\.[a-z0-9-]+\.amazonaws\.com$/;

/**
 * @param {string} url
 * @returns {boolean} Whether the address is on a portal API host.
 */
export function isApiUrl(url) {
  return URL.canParse(url) && API_HOST.test(new URL(url).hostname);
}

/**
 * @param {string} host
 * @returns {string} The match pattern covering everything on a host.
 */
function originFor(host) {
  return `https://${host}/*`;
}

/**
 * Recognises an AWS access portal or Okta address. Accepts a full URL or a
 * bare host. For Okta, either the tenant's own address or its admin address
 * identifies the tenant.
 *
 * @param {string} address
 * @returns {RecognisedAddress | null}
 */
export function recogniseAddress(address) {
  const trimmed = address.trim();
  if (trimmed === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  if (!URL.canParse(withScheme)) return null;
  const { protocol, hostname } = new URL(withScheme);
  if (protocol !== "https:") return null;

  const portal = parsePortalHost(hostname);
  if (portal) {
    return {
      kind: "aws-portal",
      key: portalKey(portal.host),
      host: portal.host,
      region: portal.region,
      // A portal's label is always the user's choice.
      suggestedLabel: "",
    };
  }

  const okta = parseOktaHost(hostname);
  if (okta) {
    return {
      kind: "okta-admin",
      key: oktaKey(okta.tenantHost),
      host: okta.tenantHost,
      region: null,
      suggestedLabel: `${okta.org}${OKTA_LABEL_SUFFIX[okta.baseDomain] ?? ""}`,
    };
  }
  return null;
}

/**
 * The addresses an organization needs: a portal's own address and its
 * region's API address, or an Okta tenant's admin address.
 *
 * @param {Pick<Organization, "kind" | "host" | "region">} organization
 * @returns {string[]}
 */
export function originsFor(organization) {
  if (organization.kind === "okta-admin") {
    const okta = parseOktaHost(organization.host);
    return okta ? [originFor(okta.adminHost)] : [];
  }
  const origins = [originFor(organization.host)];
  if (organization.region !== null) {
    origins.push(originFor(apiHost(organization.region)));
  }
  return origins;
}

/**
 * Works out what enrolling an address means: which organization it is and
 * exactly which addresses to request.
 *
 * @param {object} input
 * @param {string} input.address A URL or host, typed or taken from a tab.
 * @param {string | null} input.region The region chosen for a portal.
 * @param {readonly string[]} input.regions The regions this version knows.
 * @returns {EnrolmentPlan}
 */
export function planEnrolment({ address, region, regions }) {
  const recognised = recogniseAddress(address);
  if (!recognised) return { ok: false, reason: "not-recognised" };

  if (recognised.kind === "okta-admin") {
    return { ok: true, ...recognised, origins: originsFor(recognised) };
  }

  const chosen = region || recognised.region;
  if (!chosen) return { ok: false, reason: "region-required" };
  if (!regions.includes(chosen)) return { ok: false, reason: "unknown-region" };
  if (recognised.region !== null && recognised.region !== chosen) {
    return { ok: false, reason: "region-mismatch" };
  }
  const portal = { ...recognised, region: chosen };
  return { ok: true, ...portal, origins: originsFor(portal) };
}

/**
 * The addresses to give up when an organization is removed. A region's API
 * address is kept while another enrolled portal still uses that region.
 *
 * @param {Organization} organization The one being removed.
 * @param {readonly Organization[]} organizations Everything enrolled.
 * @returns {string[]}
 */
export function originsToRevoke(organization, organizations) {
  const stillNeeded = new Set(
    organizations
      .filter((other) => other.key !== organization.key)
      .flatMap((other) => originsFor(other)),
  );
  return originsFor(organization).filter((origin) => !stillNeeded.has(origin));
}

/**
 * Decides what the toolbar button should offer for the tab it was clicked
 * on: the address to put in the add form, if the tab is on a portal or Okta
 * tenant that is not enrolled yet.
 *
 * @param {string | undefined} tabUrl
 * @param {readonly Organization[]} organizations
 * @returns {string | null} The host to offer, or null to offer nothing.
 */
export function enrolmentOffer(tabUrl, organizations) {
  if (!tabUrl) return null;
  const recognised = recogniseAddress(tabUrl);
  if (!recognised) return null;
  if (organizations.some((item) => item.key === recognised.key)) return null;
  return new URL(tabUrl).hostname;
}

/**
 * Every address to ask for in one prompt so that all the organizations
 * lacking access have it again.
 *
 * @param {readonly Organization[]} organizations
 * @returns {string[]} Empty if nothing needs access.
 */
export function originsNeeded(organizations) {
  const waiting = organizations.filter((item) => !item.accessGranted);
  return [...new Set(waiting.flatMap(originsFor))].sort();
}

/**
 * @param {string} label
 * @returns {string | null} What is wrong with the label, or null.
 */
export function validateLabel(label) {
  const trimmed = label.trim();
  if (trimmed === "") return "A label is required.";
  if (trimmed.length > MAX_LABEL_LENGTH) {
    return `A label can be at most ${MAX_LABEL_LENGTH} characters.`;
  }
  return null;
}

/**
 * @param {Enrolment} enrolment
 * @param {string} label
 * @param {Date} now
 * @returns {Organization}
 */
export function buildOrganization(enrolment, label, now) {
  return {
    key: enrolment.key,
    kind: enrolment.kind,
    host: enrolment.host,
    label: label.trim(),
    region: enrolment.region,
    accessGranted: true,
    addedAt: now.toISOString(),
  };
}
