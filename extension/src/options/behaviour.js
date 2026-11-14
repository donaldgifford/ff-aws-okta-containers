// The Behaviour section of the options page: one switch per kind of thing
// the extension handles.

/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { byId, errorMessage, setStatus } from "./dom.js";

/** @type {readonly { id: string, setting: "awsConsolesEnabled" | "awsPortalsEnabled" | "oktaAdminEnabled", name: string }[]} */
const SWITCHES = Object.freeze([
  {
    id: "switch-consoles",
    setting: "awsConsolesEnabled",
    name: "AWS consoles",
  },
  {
    id: "switch-portals",
    setting: "awsPortalsEnabled",
    name: "AWS access portals",
  },
  {
    id: "switch-okta",
    setting: "oktaAdminEnabled",
    name: "Okta admin consoles",
  },
]);

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @returns {{ render: (state: State) => void }}
 */
export function createBehaviourSection({ store }) {
  const status = byId("behaviour-status", HTMLElement);
  const switches = SWITCHES.map((item) => ({
    ...item,
    input: byId(item.id, HTMLInputElement),
  }));

  for (const { input, setting, name } of switches) {
    input.addEventListener("change", () => {
      const enabled = input.checked;
      store
        .update((state) => {
          state.settings[setting] = enabled;
        })
        .then(
          () =>
            setStatus(status, `${name} switched ${enabled ? "on" : "off"}.`),
          (error) => setStatus(status, errorMessage(error), "error"),
        );
    });
  }

  /** @param {State} state */
  function render(state) {
    for (const { input, setting } of switches) {
      input.checked = state.settings[setting];
    }
  }

  return { render };
}
