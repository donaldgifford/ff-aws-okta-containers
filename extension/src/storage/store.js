// Reads and writes the extension's state in storage.local.
//
// The background script is stopped when idle, so nothing is kept in memory
// that cannot be read again. A read is cached behind one promise; the cache
// is dropped whenever storage changes.

/** @import { State } from "./schema.js" */

import { migrate } from "./schema.js";

/**
 * Raised when storage cannot be used: it was written by a newer version of
 * the extension, or it is not in a shape this version understands. The
 * extension then does nothing rather than guess.
 */
export class StorageError extends Error {
  /** @param {"newer-schema" | "corrupt"} reason */
  constructor(reason) {
    super(
      reason === "newer-schema"
        ? "The stored settings were written by a newer version of this extension."
        : "The stored settings could not be read.",
    );
    this.name = "StorageError";
    this.reason = reason;
  }
}

/**
 * @typedef {object} Store
 * @property {() => Promise<State>} load The current state. Treat it as
 *   read-only; change it through update().
 * @property {(change: (state: State) => void) => Promise<State>} update
 *   Applies a change to a fresh copy of the state and writes the parts that
 *   changed. Updates run one at a time.
 * @property {() => void} invalidate Drops the cached state.
 */

/**
 * @param {browser.storage.StorageArea} area
 * @returns {Store}
 */
export function createStore(area) {
  /** @type {Promise<State> | null} */
  let cached = null;
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();

  /** @returns {Promise<State>} */
  async function read() {
    const raw = await area.get(null);
    const result = migrate(raw);
    if (!result.ok) throw new StorageError(result.reason);
    if (result.changed) await area.set({ ...result.state });
    return result.state;
  }

  /** @returns {Promise<State>} */
  function load() {
    if (!cached) {
      const reading = read();
      cached = reading;
      // A failed read is not cached, so the next event tries again.
      reading.catch(() => {
        if (cached === reading) cached = null;
      });
    }
    return cached;
  }

  /**
   * @param {(state: State) => void} change
   * @returns {Promise<State>}
   */
  function update(change) {
    const run = queue.then(async () => {
      // Read again instead of trusting the cache: the options page writes to
      // the same storage from another context.
      const state = await read();
      const before = snapshot(state);
      change(state);
      const after = snapshot(state);

      /** @type {Record<string, unknown>} */
      const changed = {};
      for (const [key, value] of Object.entries(after)) {
        if (value !== before[key]) changed[key] = JSON.parse(value);
      }
      if (Object.keys(changed).length > 0) await area.set(changed);
      cached = Promise.resolve(state);
      return state;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    load,
    update,
    invalidate: () => {
      cached = null;
    },
  };
}

/**
 * @param {State} state
 * @returns {Record<string, string>} Each top-level key, serialised.
 */
function snapshot(state) {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, JSON.stringify(value)]),
  );
}
