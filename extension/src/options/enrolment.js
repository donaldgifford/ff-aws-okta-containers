// What the options page does to the list of organizations, kept apart from
// the page itself so it can be tested without one.
//
// Asking Firefox for access is not here: that has to happen in the click
// handler, before anything is awaited. These functions take the answer.

/** @import { Enrolment } from "../core/enrol.js" */
/** @import { Organization } from "../core/types.js" */
/** @import { Store } from "../storage/store.js" */

import {
  apiHost,
  buildOrganization,
  originsFor,
  originsToRevoke,
} from "../core/enrol.js";

/**
 * @typedef {object} Dependencies
 * @property {Store} store
 * @property {Pick<typeof browser.permissions, "remove">} permissions
 */

/**
 * Saves an organization once Firefox has granted its addresses. Enrolling
 * one that is already enrolled updates its label and region.
 *
 * @param {Store} store
 * @param {Enrolment} enrolment
 * @param {string} label
 * @param {Date} now
 * @returns {Promise<Organization>}
 */
export async function saveOrganization(store, enrolment, label, now) {
  const organization = buildOrganization(enrolment, label, now);
  await store.update((state) => {
    const existing = state.organizations[organization.key];
    state.organizations[organization.key] = existing
      ? { ...organization, addedAt: existing.addedAt }
      : organization;
  });
  return organization;
}

/**
 * Removes an organization and gives up its addresses. A region's API
 * address is kept while another enrolled portal still uses it.
 *
 * @param {Dependencies} dependencies
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function removeOrganization({ store, permissions }, key) {
  const state = await store.load();
  const organization = state.organizations[key];
  if (!organization) return;

  const origins = originsToRevoke(
    organization,
    Object.values(state.organizations),
  );
  if (origins.length > 0) await permissions.remove({ origins });
  await store.update((draft) => {
    delete draft.organizations[key];
  });
}

/**
 * @param {Store} store
 * @param {string} key
 * @param {string} label
 * @returns {Promise<void>}
 */
export async function relabelOrganization(store, key, label) {
  await store.update((state) => {
    const organization = state.organizations[key];
    if (organization) organization.label = label.trim();
  });
}

/**
 * The address to request before moving a portal to another region.
 *
 * @param {string} region
 * @returns {string[]}
 */
export function originsForRegion(region) {
  return [`https://${apiHost(region)}/*`];
}

/**
 * Moves a portal to another region once Firefox has granted the new
 * region's API address, and gives up the old one unless another portal
 * still uses it.
 *
 * @param {Dependencies} dependencies
 * @param {string} key
 * @param {string} region
 * @returns {Promise<void>}
 */
export async function changeRegion({ store, permissions }, key, region) {
  const state = await store.load();
  const organization = state.organizations[key];
  if (organization?.kind !== "aws-portal" || organization.region === region) {
    return;
  }

  const moved = { ...organization, region };
  const others = Object.values(state.organizations).filter(
    (other) => other.key !== key,
  );
  const stillNeeded = new Set([...others, moved].flatMap(originsFor));
  const origins = originsFor(organization).filter(
    (origin) => !stillNeeded.has(origin),
  );
  if (origins.length > 0) await permissions.remove({ origins });
  await store.update((draft) => {
    const current = draft.organizations[key];
    if (current) current.region = region;
  });
}

/**
 * Records the answer to "grant access again".
 *
 * @param {Store} store
 * @param {string} key
 * @param {boolean} granted
 * @returns {Promise<void>}
 */
export async function recordAccess(store, key, granted) {
  await store.update((state) => {
    const organization = state.organizations[key];
    if (organization) organization.accessGranted = granted;
  });
}
