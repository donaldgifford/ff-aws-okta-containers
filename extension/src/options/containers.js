// The Managed containers section of the options page: what the extension
// created, which of them the user renamed by hand, and cleaning up those
// that are no longer used.

/** @import { Registry } from "../background/registry.js" */
/** @import { ManagedContainer } from "../core/types.js" */
/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { byId, errorMessage, h, setStatus } from "./dom.js";

const KIND_NAMES = Object.freeze({
  "aws-console": "AWS console",
  "aws-portal": "AWS access portal",
  "okta-admin": "Okta admin console",
});

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @returns {{ render: (state: State) => void }}
 */
export function createContainersSection({ registry }) {
  const list = byId("containers", HTMLUListElement);
  const empty = byId("containers-empty", HTMLElement);
  const status = byId("containers-status", HTMLElement);
  const find = byId("cleanup-find", HTMLButtonElement);
  const confirm = byId("cleanup-confirm", HTMLElement);
  const confirmHeading = byId("cleanup-heading", HTMLElement);
  const confirmList = byId("cleanup-list", HTMLUListElement);
  const confirmRemove = byId("cleanup-remove", HTMLButtonElement);
  const confirmCancel = byId("cleanup-cancel", HTMLButtonElement);

  let shown = "";
  // The containers listed for removal, by key. Only these are removed.
  /** @type {string[]} */
  let offered = [];

  /**
   * @param {() => Promise<string>} action Resolves with what to tell the user.
   */
  function run(action) {
    setStatus(status, "Working…");
    action().then(
      (message) => setStatus(status, message),
      (error) => setStatus(status, errorMessage(error), "error"),
    );
  }

  /**
   * The name a container has in Firefox right now, which differs from the
   * recorded one when the user renamed it.
   *
   * @param {ManagedContainer} record
   * @returns {Promise<string>}
   */
  async function liveName(record) {
    try {
      const identity = await browser.contextualIdentities.get(
        record.cookieStoreId,
      );
      return identity.name;
    } catch {
      return record.managedName;
    }
  }

  /**
   * @param {ManagedContainer} record
   * @param {string} name
   * @param {number} index
   * @returns {HTMLLIElement}
   */
  function card(record, name, index) {
    const head = h("div", { class: "card-head" }, [
      h("strong", {}, [name]),
      h("span", { class: "tag" }, [KIND_NAMES[record.kind]]),
    ]);
    const children = [
      head,
      h("p", { class: "address" }, [record.key]),
      h("p", { class: "detail" }, [
        "Last used ",
        h("time", { datetime: record.lastUsedAt }, [
          new Date(record.lastUsedAt).toLocaleString(),
        ]),
      ]),
    ];

    if (record.userRenamed) {
      head.append(h("span", { class: "tag warn" }, ["Renamed by hand"]));
      const handBack = h(
        "button",
        { id: `container-${index}-hand-back`, type: "button" },
        ["Let the extension name it again"],
      );
      handBack.addEventListener("click", () => {
        run(async () => {
          await registry.handBack(record.key);
          return "The extension names that container again.";
        });
      });
      children.push(h("div", { class: "actions" }, [handBack]));
    }
    return h("li", { class: "card" }, children);
  }

  function closeConfirm() {
    offered = [];
    confirm.hidden = true;
    confirmList.replaceChildren();
  }

  find.addEventListener("click", () => {
    run(async () => {
      const unused = await registry.findUnused(browser.tabs);
      if (unused.length === 0) {
        closeConfirm();
        return "Every managed container has a tab open, or there are none.";
      }
      offered = unused.map((record) => record.key);
      const names = await Promise.all(unused.map(liveName));
      confirmList.replaceChildren(...names.map((name) => h("li", {}, [name])));
      confirm.hidden = false;
      confirmHeading.focus();
      return `${unused.length} with no open tabs. Nothing has been removed yet.`;
    });
  });

  confirmCancel.addEventListener("click", () => {
    closeConfirm();
    setStatus(status, "Nothing was removed.");
    find.focus();
  });

  confirmRemove.addEventListener("click", () => {
    const keys = offered;
    run(async () => {
      const removed = await registry.removeUnused(browser.tabs, keys);
      closeConfirm();
      find.focus();
      const kept = keys.length - removed.length;
      return kept === 0
        ? `Removed ${removed.length}.`
        : `Removed ${removed.length}. ${kept} had a tab opened in the meantime and were kept.`;
    });
  });

  /** @param {State} state */
  function render(state) {
    const records = Object.values(state.containers).sort((a, b) =>
      b.lastUsedAt.localeCompare(a.lastUsedAt),
    );
    const next = JSON.stringify(records);
    if (next === shown) return;
    shown = next;

    Promise.all(records.map(liveName)).then((names) => {
      // A newer render may have started while the names were being read.
      if (next !== shown) return;
      const focused = list.contains(document.activeElement)
        ? document.activeElement?.id
        : undefined;
      list.replaceChildren(
        ...records.map((record, index) =>
          card(record, names[index] ?? record.managedName, index),
        ),
      );
      empty.hidden = records.length > 0;
      find.disabled = records.length === 0;
      if (focused) (document.getElementById(focused) ?? status).focus();
    });
  }

  return { render };
}
