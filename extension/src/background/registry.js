// The container registry: the only code that creates, renames or removes
// containers. The source check enforces that.
//
// A container is identified by its target key, never by its name. The
// registry keeps a map from key to cookieStoreId in storage and only ever
// touches containers that are in that map, so a container the user made by
// hand is never adopted, renamed or removed, even if its name matches.

/** @import { ContainerAppearance, ManagedContainer } from "../core/types.js" */
/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { parseKey } from "../core/keys.js";
import { appearanceFor, orgLabelFor, sameColour } from "../core/naming.js";

/**
 * @typedef {object} Registry
 * @property {(key: string, orgKey: string | null) => Promise<string>} getOrCreate
 *   The cookieStoreId of the container for a key, creating the container
 *   the first time. `orgKey` is the organization whose label goes in the
 *   name.
 * @property {(cookieStoreId: string) => Promise<void>} forget Drops the
 *   mapping for a container that no longer exists.
 * @property {() => Promise<void>} syncNames Brings every managed container's
 *   name, colour and icon up to date with the settings, labels and account
 *   names, except those the user renamed by hand.
 * @property {(key: string) => Promise<void>} handBack Takes over the naming
 *   of a container the user renamed by hand.
 * @property {(tabs: Pick<typeof browser.tabs, "query">) => Promise<ManagedContainer[]>} findUnused
 *   The managed containers that have no open tabs.
 * @property {(tabs: Pick<typeof browser.tabs, "query">, keys: readonly string[]) => Promise<string[]>} removeUnused
 *   Removes the managed containers with these keys, except any that has a
 *   tab open by now. Returns the keys of those removed.
 */

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Pick<typeof browser.contextualIdentities, "get" | "create" | "update" | "remove">} dependencies.identities
 * @param {() => Date} [dependencies.now]
 * @returns {Registry}
 */
export function createRegistry({ store, identities, now = () => new Date() }) {
  // One piece of work at a time per key. This is the only state held in
  // memory, and losing it when the background script stops is harmless.
  /** @type {Map<string, Promise<unknown>>} */
  const busy = new Map();

  /**
   * Runs a task for a key after any task already running for it.
   *
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function inTurn(key, task) {
    const previous = busy.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => {});
    busy.set(key, settled);
    settled.then(() => {
      if (busy.get(key) === settled) busy.delete(key);
    });
    return run;
  }

  /**
   * @param {string} cookieStoreId
   * @returns {Promise<browser.contextualIdentities.ContextualIdentity | null>}
   */
  async function live(cookieStoreId) {
    try {
      return await identities.get(cookieStoreId);
    } catch {
      // Firefox rejects for a container that has been deleted.
      return null;
    }
  }

  /**
   * @param {State} state
   * @param {string} key
   * @param {string | null} orgKey
   * @returns {ContainerAppearance}
   */
  function desired(state, key, orgKey) {
    const parsed = parseKey(key);
    const accountName =
      parsed?.kind === "aws-console"
        ? (state.accounts[parsed.accountId]?.name ?? null)
        : null;
    const appearance = appearanceFor(
      key,
      {
        orgLabel: orgLabelFor(orgKey, Object.values(state.organizations)),
        accountName,
      },
      state.settings,
    );
    if (!appearance) throw new Error(`Not a container key: ${key}`);
    return appearance;
  }

  /**
   * Makes an existing managed container look the way it should, unless the
   * user has renamed it.
   *
   * @param {ManagedContainer} record
   * @param {browser.contextualIdentities.ContextualIdentity} identity
   * @param {ContainerAppearance} appearance
   * @returns {Promise<Pick<ManagedContainer, "managedName" | "userRenamed">>}
   */
  async function reconcile(record, identity, appearance) {
    // The name is not the one the extension last set: the user changed it
    // in Firefox, and it is theirs now.
    if (identity.name !== record.managedName) {
      return { managedName: record.managedName, userRenamed: true };
    }
    const upToDate =
      identity.name === appearance.name &&
      sameColour(identity.color, appearance.color) &&
      identity.icon === appearance.icon;
    if (!upToDate) await identities.update(record.cookieStoreId, appearance);
    return { managedName: appearance.name, userRenamed: false };
  }

  /**
   * @param {string} key
   * @param {string | null} orgKey
   * @returns {Promise<string>}
   */
  async function resolve(key, orgKey) {
    const state = await store.load();
    const record = state.containers[key];
    const owner = orgKey ?? record?.orgKey ?? null;
    const appearance = desired(state, key, owner);
    const timestamp = now().toISOString();

    const identity = record ? await live(record.cookieStoreId) : null;
    if (record && identity) {
      const naming = await reconcile(record, identity, appearance);
      await store.update((draft) => {
        const current = draft.containers[key];
        if (current?.cookieStoreId !== record.cookieStoreId) return;
        Object.assign(current, naming, {
          orgKey: owner,
          lastUsedAt: timestamp,
        });
      });
      return record.cookieStoreId;
    }

    // First use, or the mapped container was deleted: make a new one.
    const created = await identities.create(appearance);
    const kind = parseKey(key)?.kind ?? "aws-console";
    await store.update((draft) => {
      draft.containers[key] = {
        key,
        cookieStoreId: created.cookieStoreId,
        kind,
        orgKey: owner,
        managedName: appearance.name,
        userRenamed: false,
        createdAt: timestamp,
        lastUsedAt: timestamp,
      };
    });
    return created.cookieStoreId;
  }

  /** @type {Map<string, Promise<string>>} */
  const resolving = new Map();

  /**
   * @param {string} key
   * @param {string | null} orgKey
   * @returns {Promise<string>}
   */
  function getOrCreate(key, orgKey) {
    // Two clicks in quick succession share one answer, so they cannot
    // create two containers.
    const pending = resolving.get(key);
    if (pending) return pending;
    const run = inTurn(key, () => resolve(key, orgKey));
    resolving.set(key, run);
    const clear = () => {
      if (resolving.get(key) === run) resolving.delete(key);
    };
    run.then(clear, clear);
    return run;
  }

  /**
   * @param {string} cookieStoreId
   * @returns {Promise<void>}
   */
  async function forget(cookieStoreId) {
    const state = await store.load();
    const known = Object.values(state.containers).some(
      (record) => record.cookieStoreId === cookieStoreId,
    );
    if (!known) return;
    await store.update((draft) => {
      for (const [key, record] of Object.entries(draft.containers)) {
        if (record.cookieStoreId === cookieStoreId)
          delete draft.containers[key];
      }
    });
  }

  /**
   * @param {string} key
   * @param {boolean} takeOver Rename even if the user renamed it by hand.
   * @returns {Promise<void>}
   */
  async function sync(key, takeOver) {
    const state = await store.load();
    const record = state.containers[key];
    if (!record) return;
    const identity = await live(record.cookieStoreId);
    if (!identity) {
      await forget(record.cookieStoreId);
      return;
    }
    const appearance = desired(state, key, record.orgKey);
    const naming = takeOver
      ? await reconcile(
          { ...record, managedName: identity.name },
          identity,
          appearance,
        )
      : await reconcile(record, identity, appearance);
    if (
      naming.managedName === record.managedName &&
      naming.userRenamed === record.userRenamed
    ) {
      return;
    }
    await store.update((draft) => {
      const current = draft.containers[key];
      if (current?.cookieStoreId === record.cookieStoreId) {
        Object.assign(current, naming);
      }
    });
  }

  /** @returns {Promise<void>} */
  async function syncNames() {
    const state = await store.load();
    for (const key of Object.keys(state.containers)) {
      await inTurn(key, () => sync(key, false));
    }
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  function handBack(key) {
    return inTurn(key, () => sync(key, true));
  }

  /**
   * @param {Pick<typeof browser.tabs, "query">} tabs
   * @param {ManagedContainer} record
   * @returns {Promise<boolean>}
   */
  async function isUnused(tabs, record) {
    const open = await tabs.query({ cookieStoreId: record.cookieStoreId });
    return open.length === 0;
  }

  /**
   * @param {Pick<typeof browser.tabs, "query">} tabs
   * @returns {Promise<ManagedContainer[]>}
   */
  async function findUnused(tabs) {
    const state = await store.load();
    /** @type {ManagedContainer[]} */
    const unused = [];
    for (const record of Object.values(state.containers)) {
      if (await isUnused(tabs, record)) unused.push(record);
    }
    return unused;
  }

  /**
   * @param {Pick<typeof browser.tabs, "query">} tabs
   * @param {readonly string[]} keys
   * @returns {Promise<string[]>}
   */
  async function removeUnused(tabs, keys) {
    /** @type {string[]} */
    const removed = [];
    for (const key of keys) {
      await inTurn(key, async () => {
        // Only ever a container in the map, and only if it is still unused:
        // a tab may have been opened in it since the list was shown.
        const record = (await store.load()).containers[key];
        if (!record || !(await isUnused(tabs, record))) return;
        if (await live(record.cookieStoreId)) {
          await identities.remove(record.cookieStoreId);
        }
        await forget(record.cookieStoreId);
        removed.push(key);
      });
    }
    return removed;
  }

  return {
    getOrCreate,
    forget,
    syncNames,
    handBack,
    findUnused,
    removeUnused,
  };
}
