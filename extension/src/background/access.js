// Keeps each organization's "access granted" flag in step with what Firefox
// actually grants. A user can remove a grant in the add-on manager at any
// time; the extension notices and says so instead of failing silently.

/** @import { Store } from "../storage/store.js" */

import { originsFor } from "../core/enrol.js";

/**
 * Checks every enrolled organization's addresses against Firefox and
 * records any that changed.
 *
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Pick<typeof browser.permissions, "contains">} dependencies.permissions
 * @returns {Promise<string[]>} The keys of the organizations whose status
 *   changed.
 */
export async function refreshAccess({ store, permissions }) {
  const state = await store.load();
  /** @type {Map<string, boolean>} */
  const changed = new Map();
  for (const organization of Object.values(state.organizations)) {
    const granted = await permissions.contains({
      origins: originsFor(organization),
    });
    if (granted !== organization.accessGranted) {
      changed.set(organization.key, granted);
    }
  }
  if (changed.size === 0) return [];

  await store.update((draft) => {
    for (const [key, granted] of changed) {
      const organization = draft.organizations[key];
      if (organization) organization.accessGranted = granted;
    }
  });
  return [...changed.keys()];
}
