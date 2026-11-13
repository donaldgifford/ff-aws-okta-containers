// The warning badge on the toolbar button.
//
// When something goes wrong that the user should know about, a notice is
// stored and the button shows a badge with the reason in its tooltip. The
// options page shows the notice and clears it once it has been seen.
//
// A notice is a fixed sentence chosen by the code. It never contains
// anything taken from a response.

/** @import { Notice } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

const BADGE_TEXT = "!";
const BADGE_COLOUR = "#d7264d";
const TITLE = "AWS and Okta containers";

/**
 * @typedef {object} Notifier
 * @property {(message: string) => Promise<void>} warn Stores a notice and
 *   shows the badge.
 * @property {() => Promise<void>} sync Makes the badge match the stored
 *   notice. Shows a storage problem if storage cannot be read.
 */

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Pick<typeof browser.action, "setBadgeText" | "setBadgeBackgroundColor" | "setTitle">} dependencies.action
 * @param {() => Date} [dependencies.now]
 * @returns {Notifier}
 */
export function createNotifier({ store, action, now = () => new Date() }) {
  /**
   * @param {Pick<Notice, "message"> | null} notice
   * @returns {Promise<void>}
   */
  async function show(notice) {
    await action.setBadgeText({ text: notice ? BADGE_TEXT : "" });
    if (notice) await action.setBadgeBackgroundColor({ color: BADGE_COLOUR });
    await action.setTitle({
      title: notice ? `${TITLE}: ${notice.message}` : null,
    });
  }

  /** @returns {Promise<void>} */
  async function sync() {
    try {
      const state = await store.load();
      await show(state.notice);
    } catch (error) {
      await show({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * @param {string} message
   * @returns {Promise<void>}
   */
  async function warn(message) {
    const notice = { message, at: now().toISOString() };
    try {
      await store.update((state) => {
        state.notice = notice;
      });
    } finally {
      // Even if it could not be stored, say so on the button.
      await show(notice);
    }
  }

  return { warn, sync };
}
