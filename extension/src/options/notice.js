// Shows the notice behind the toolbar button's warning badge, and clears it
// once it has been seen.

/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { byId } from "./dom.js";

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @returns {{ render: (state: State) => void }}
 */
export function createNoticeBanner({ store }) {
  const banner = byId("notice", HTMLElement);
  const text = byId("notice-text", HTMLElement);
  const time = byId("notice-time", HTMLTimeElement);
  // The stored notice is cleared as soon as it has been seen, which clears
  // the badge. The banner stays until the page is closed or reloaded.
  /** @type {string | null} */
  let pending = null;

  /** Clears the stored notice if the page is actually being looked at. */
  function acknowledge() {
    if (pending === null || document.visibilityState !== "visible") return;
    const seen = pending;
    pending = null;
    store
      .update((state) => {
        if (state.notice?.at === seen) state.notice = null;
      })
      .catch(() => {
        // Storage problems are shown by the page-level error.
      });
  }

  document.addEventListener("visibilitychange", acknowledge);

  /** @param {State} state */
  function render(state) {
    const { notice } = state;
    if (!notice) return;
    text.textContent = notice.message;
    time.dateTime = notice.at;
    time.textContent = new Date(notice.at).toLocaleString();
    banner.hidden = false;
    pending = notice.at;
    acknowledge();
  }

  return { render };
}
