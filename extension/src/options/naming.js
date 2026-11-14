// The Naming section of the options page: the three name templates, checked
// as they are typed, each with a preview.

/** @import { Registry } from "../background/registry.js" */
/** @import { TargetKind } from "../core/types.js" */
/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { parseKey } from "../core/keys.js";
import {
  DEFAULT_TEMPLATES,
  orgLabelFor,
  renderTemplate,
  validateTemplate,
} from "../core/naming.js";
import { byId, errorMessage, setStatus } from "./dom.js";

/** What a preview shows when nothing real is available. */
const EXAMPLE = Object.freeze({
  org: "acme",
  account: "payments-prod",
  accountId: "111122223333",
  role: "AdminAccess",
});

/**
 * @typedef {"consoleTemplate" | "portalTemplate" | "oktaTemplate"} TemplateName
 */

/** @type {readonly { id: string, kind: TargetKind, setting: TemplateName, fallback: string }[]} */
const FIELDS = Object.freeze([
  {
    id: "template-console",
    kind: "aws-console",
    setting: "consoleTemplate",
    fallback: DEFAULT_TEMPLATES.console,
  },
  {
    id: "template-portal",
    kind: "aws-portal",
    setting: "portalTemplate",
    fallback: DEFAULT_TEMPLATES.portal,
  },
  {
    id: "template-okta",
    kind: "okta-admin",
    setting: "oktaTemplate",
    fallback: DEFAULT_TEMPLATES.okta,
  },
]);

/**
 * The values to preview a kind's template with: those of a real managed
 * container of that kind if there is one, otherwise an example.
 *
 * @param {State | null} state
 * @param {TargetKind} kind
 * @returns {import("../core/types.js").NameTokens}
 */
function previewTokens(state, kind) {
  const record = Object.values(state?.containers ?? {}).find(
    (item) => item.kind === kind,
  );
  const parsed = record ? parseKey(record.key) : null;
  if (!state || !record || !parsed) return EXAMPLE;

  const org = orgLabelFor(record.orgKey, Object.values(state.organizations));
  if (parsed.kind !== "aws-console") return { ...EXAMPLE, org };
  return {
    org,
    account: state.accounts[parsed.accountId]?.name ?? parsed.accountId,
    accountId: parsed.accountId,
    role: parsed.role,
  };
}

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @returns {{ render: (state: State) => void }}
 */
export function createNamingSection({ store, registry }) {
  const form = byId("naming-form", HTMLFormElement);
  const reset = byId("naming-reset", HTMLButtonElement);
  const status = byId("naming-status", HTMLElement);
  const fields = FIELDS.map((field) => ({
    ...field,
    input: byId(field.id, HTMLInputElement),
    preview: byId(`${field.id}-preview`, HTMLElement),
  }));

  /** @type {State | null} */
  let current = null;
  // While the user has unsaved edits, a storage change must not replace
  // what they typed.
  let dirty = false;

  /** @returns {boolean} Whether every template is valid. */
  function refreshPreviews() {
    let valid = true;
    for (const { kind, input, preview } of fields) {
      const problem = validateTemplate(kind, input.value);
      preview.classList.toggle("error", problem !== null);
      input.setAttribute("aria-invalid", String(problem !== null));
      if (problem) {
        valid = false;
        preview.textContent = problem;
      } else {
        const name = renderTemplate(input.value, previewTokens(current, kind));
        preview.textContent = `Preview: ${name}`;
      }
    }
    return valid;
  }

  for (const { input } of fields) {
    input.addEventListener("input", () => {
      dirty = true;
      setStatus(status, "");
      refreshPreviews();
    });
  }

  reset.addEventListener("click", () => {
    for (const { input, fallback } of fields) input.value = fallback;
    dirty = true;
    refreshPreviews();
    setStatus(status, "Defaults restored. Save names to apply them.");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!refreshPreviews()) {
      setStatus(status, "Fix the template marked above first.", "error");
      return;
    }
    const values = fields.map(({ setting, input }) => ({
      setting,
      value: input.value.trim(),
    }));
    setStatus(status, "Working…");
    store
      .update((state) => {
        for (const { setting, value } of values)
          state.settings[setting] = value;
      })
      .then(() => registry.syncNames())
      .then(
        () => {
          dirty = false;
          setStatus(status, "Names saved. Containers were renamed to match.");
        },
        (error) => setStatus(status, errorMessage(error), "error"),
      );
  });

  /** @param {State} state */
  function render(state) {
    current = state;
    if (!dirty) {
      for (const { input, setting } of fields) {
        input.value = state.settings[setting];
      }
    }
    refreshPreviews();
  }

  return { render };
}
