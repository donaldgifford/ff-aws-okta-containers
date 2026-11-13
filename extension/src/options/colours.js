// The Colours section of the options page: the ordered list of rules that
// map text in a container's name to a colour.

/** @import { Registry } from "../background/registry.js" */
/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import {
  COLOURS,
  DEFAULT_COLOUR_RULES,
  isColour,
  validateColourRule,
} from "../core/naming.js";
import { byId, errorMessage, h, setStatus } from "./dom.js";

/** The colours Firefox draws its containers in, for the swatches. */
const SWATCHES = Object.freeze(
  /** @type {Record<string, string>} */ ({
    blue: "#37adff",
    turquoise: "#00c79a",
    green: "#51cd00",
    yellow: "#ffcb00",
    orange: "#ff9f00",
    red: "#ff613d",
    pink: "#ff4bda",
    purple: "#af51f5",
  }),
);

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @returns {{ render: (state: State) => void }}
 */
export function createColoursSection({ store, registry }) {
  const form = byId("colours-form", HTMLFormElement);
  const list = byId("colour-rules", HTMLOListElement);
  const empty = byId("colour-rules-empty", HTMLElement);
  const add = byId("colours-add", HTMLButtonElement);
  const reset = byId("colours-reset", HTMLButtonElement);
  const status = byId("colours-status", HTMLElement);

  // The rules as edited, which become the settings on Save.
  /** @type {{ match: string, colour: string }[]} */
  let draft = [];
  let dirty = false;

  /** @param {string} [focusId] An element to focus once the list is rebuilt. */
  function redraw(focusId) {
    list.replaceChildren(...draft.map(row));
    empty.hidden = draft.length > 0;
    if (focusId) (document.getElementById(focusId) ?? add).focus();
  }

  /** Marks the rules as edited. */
  function edited() {
    dirty = true;
    setStatus(status, "");
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  function move(from, to) {
    const [rule] = draft.splice(from, 1);
    if (!rule) return;
    draft.splice(to, 0, rule);
    edited();
    // Keep focus on the same button of the rule that moved, or on its
    // opposite when it has reached an end and that button is now disabled.
    const direction = to < from ? "up" : "down";
    const atEnd = to === 0 || to === draft.length - 1;
    const other = direction === "up" ? "down" : "up";
    redraw(`colour-rule-${to}-${atEnd ? other : direction}`);
  }

  /**
   * @param {{ match: string, colour: string }} rule
   * @param {number} index
   * @returns {HTMLLIElement}
   */
  function row(rule, index) {
    const position = index + 1;
    const swatch = h("span", { class: "swatch", "aria-hidden": "true" });
    const paint = () => {
      swatch.style.backgroundColor = SWATCHES[rule.colour] ?? "transparent";
    };
    paint();

    const match = h("input", {
      id: `colour-rule-${index}-match`,
      type: "text",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "prod, live",
      "aria-label": `Rule ${position}: text to look for`,
      value: rule.match,
    });
    match.addEventListener("input", () => {
      rule.match = match.value;
      edited();
    });

    const colour = h(
      "select",
      {
        id: `colour-rule-${index}-colour`,
        "aria-label": `Rule ${position}: colour`,
      },
      COLOURS.map((name) =>
        h("option", { value: name, selected: name === rule.colour }, [name]),
      ),
    );
    colour.addEventListener("change", () => {
      rule.colour = colour.value;
      paint();
      edited();
    });

    const up = h(
      "button",
      {
        id: `colour-rule-${index}-up`,
        type: "button",
        "aria-label": `Move rule ${position} up`,
        disabled: index === 0,
      },
      ["Up"],
    );
    up.addEventListener("click", () => move(index, index - 1));

    const down = h(
      "button",
      {
        id: `colour-rule-${index}-down`,
        type: "button",
        "aria-label": `Move rule ${position} down`,
        disabled: index === draft.length - 1,
      },
      ["Down"],
    );
    down.addEventListener("click", () => move(index, index + 1));

    const remove = h(
      "button",
      {
        id: `colour-rule-${index}-remove`,
        type: "button",
        class: "danger",
        "aria-label": `Remove rule ${position}`,
      },
      ["Remove"],
    );
    remove.addEventListener("click", () => {
      draft.splice(index, 1);
      edited();
      const next = Math.min(index, draft.length - 1);
      redraw(next >= 0 ? `colour-rule-${next}-remove` : undefined);
    });

    return h("li", { class: "rule" }, [
      swatch,
      match,
      colour,
      up,
      down,
      remove,
    ]);
  }

  add.addEventListener("click", () => {
    draft.push({ match: "", colour: "blue" });
    edited();
    redraw(`colour-rule-${draft.length - 1}-match`);
  });

  reset.addEventListener("click", () => {
    draft = DEFAULT_COLOUR_RULES.map((rule) => ({ ...rule }));
    dirty = true;
    redraw();
    setStatus(status, "Defaults restored. Save colours to apply them.");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    for (const [index, rule] of draft.entries()) {
      const problem = validateColourRule(rule);
      if (problem) {
        setStatus(status, `Rule ${index + 1}: ${problem}`, "error");
        document.getElementById(`colour-rule-${index}-match`)?.focus();
        return;
      }
    }
    const rules = draft.flatMap(({ match, colour }) =>
      isColour(colour) ? [{ match: match.trim(), colour }] : [],
    );
    setStatus(status, "Working…");
    store
      .update((state) => {
        state.settings.colourRules = rules;
      })
      .then(() => registry.syncNames())
      .then(
        () => {
          dirty = false;
          setStatus(status, "Colours saved. Containers were recoloured.");
        },
        (error) => setStatus(status, errorMessage(error), "error"),
      );
  });

  /** @param {State} state */
  function render(state) {
    if (dirty) return;
    const stored = state.settings.colourRules.map((rule) => ({ ...rule }));
    if (
      JSON.stringify(stored) === JSON.stringify(draft) &&
      list.children.length > 0
    ) {
      return;
    }
    draft = stored;
    redraw();
  }

  return { render };
}
