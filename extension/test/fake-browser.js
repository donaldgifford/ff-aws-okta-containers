// A small in-memory stand-in for the browser APIs the extension's stateful
// code uses: contextualIdentities, storage.local, tabs and permissions. It
// keeps just enough behaviour for the tests and records nothing else.

function createEvent() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    hasListener: (listener) => listeners.has(listener),
    emit: (...args) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

/**
 * @param {object} [initial]
 * @param {Record<string, unknown>} [initial.storage] What storage.local holds.
 * @param {string[]} [initial.origins] Host permissions already granted.
 */
export function createFakeBrowser({ storage = {}, origins = [] } = {}) {
  /** @type {Map<string, { cookieStoreId: string, name: string, color: string, icon: string }>} */
  const identities = new Map();
  /** @type {Map<number, object>} */
  const openTabs = new Map();
  const stored = new Map(Object.entries(structuredClone(storage)));
  const granted = new Set(origins);
  const calls = { create: 0, update: 0, remove: 0, storageSet: 0 };
  let nextIdentity = 1;
  let nextTab = 1;

  const identityRemoved = createEvent();
  const storageChanged = createEvent();
  const permissionsAdded = createEvent();
  const permissionsRemoved = createEvent();

  const contextualIdentities = {
    async create({ name, color, icon }) {
      calls.create += 1;
      const identity = {
        cookieStoreId: `firefox-container-${nextIdentity}`,
        name,
        color,
        icon,
      };
      nextIdentity += 1;
      identities.set(identity.cookieStoreId, identity);
      return { ...identity };
    },
    async get(cookieStoreId) {
      const identity = identities.get(cookieStoreId);
      if (!identity)
        throw new Error(`Invalid contextual identity: ${cookieStoreId}`);
      return { ...identity };
    },
    async update(cookieStoreId, details) {
      calls.update += 1;
      const identity = identities.get(cookieStoreId);
      if (!identity)
        throw new Error(`Invalid contextual identity: ${cookieStoreId}`);
      Object.assign(identity, details);
      return { ...identity };
    },
    async remove(cookieStoreId) {
      calls.remove += 1;
      const identity = identities.get(cookieStoreId);
      if (!identity)
        throw new Error(`Invalid contextual identity: ${cookieStoreId}`);
      identities.delete(cookieStoreId);
      identityRemoved.emit({ contextualIdentity: { ...identity } });
      return { ...identity };
    },
    async query({ name } = {}) {
      return [...identities.values()]
        .filter((identity) => name === undefined || identity.name === name)
        .map((identity) => ({ ...identity }));
    },
    onRemoved: identityRemoved,
  };

  const local = {
    async get(keys) {
      const wanted =
        keys === null || keys === undefined
          ? [...stored.keys()]
          : [keys].flat();
      return Object.fromEntries(
        wanted
          .filter((key) => stored.has(key))
          .map((key) => [key, structuredClone(stored.get(key))]),
      );
    },
    async set(items) {
      calls.storageSet += 1;
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: stored.get(key), newValue: value };
        stored.set(key, structuredClone(value));
      }
      storageChanged.emit(changes, "local");
    },
    async remove(keys) {
      for (const key of [keys].flat()) stored.delete(key);
    },
    async clear() {
      stored.clear();
    },
  };

  const tabs = {
    async create(properties) {
      const tab = {
        id: nextTab,
        index: properties.index ?? openTabs.size,
        windowId: properties.windowId ?? 1,
        url: properties.url ?? "about:newtab",
        active: properties.active ?? true,
        incognito: false,
        cookieStoreId: properties.cookieStoreId ?? "firefox-default",
      };
      nextTab += 1;
      openTabs.set(tab.id, tab);
      return { ...tab };
    },
    async get(tabId) {
      const tab = openTabs.get(tabId);
      if (!tab) throw new Error(`Invalid tab ID: ${tabId}`);
      return { ...tab };
    },
    async query({ cookieStoreId } = {}) {
      return [...openTabs.values()]
        .filter(
          (tab) =>
            cookieStoreId === undefined || tab.cookieStoreId === cookieStoreId,
        )
        .map((tab) => ({ ...tab }));
    },
    async remove(tabIds) {
      for (const tabId of [tabIds].flat()) openTabs.delete(tabId);
    },
  };

  const permissions = {
    async contains({ origins: wanted = [] }) {
      return wanted.every((origin) => granted.has(origin));
    },
    async getAll() {
      return { origins: [...granted], permissions: [] };
    },
    async remove({ origins: unwanted = [] }) {
      for (const origin of unwanted) granted.delete(origin);
      permissionsRemoved.emit({ origins: unwanted, permissions: [] });
      return true;
    },
    onAdded: permissionsAdded,
    onRemoved: permissionsRemoved,
  };

  return {
    contextualIdentities,
    storage: { local, onChanged: storageChanged },
    tabs,
    permissions,

    // Test controls, not part of any browser API.
    calls,
    identities,
    openTabs,
    /** Everything in storage.local, as a plain object. */
    stored: () => structuredClone(Object.fromEntries(stored)),
    /** Grants host permissions, as the Firefox prompt would. */
    grant(...added) {
      for (const origin of added) granted.add(origin);
      permissionsAdded.emit({ origins: added, permissions: [] });
    },
    /** Revokes host permissions, as the add-on manager would. */
    revoke(...removed) {
      for (const origin of removed) granted.delete(origin);
      permissionsRemoved.emit({ origins: removed, permissions: [] });
    },
    /** Renames a container the way a user would in Firefox's settings. */
    renameByHand(cookieStoreId, name) {
      const identity = identities.get(cookieStoreId);
      if (identity) identity.name = name;
    },
    /** Deletes a container the way a user would in Firefox's settings. */
    deleteByHand(cookieStoreId) {
      const identity = identities.get(cookieStoreId);
      if (!identity) return;
      identities.delete(cookieStoreId);
      identityRemoved.emit({ contextualIdentity: { ...identity } });
    },
  };
}
