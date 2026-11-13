// The Organizations section of the options page: the list of enrolled
// portals and Okta tenants, and the form that adds one.

/** @import { Registry } from "../background/registry.js" */
/** @import { Organization } from "../core/types.js" */
/** @import { State } from "../storage/schema.js" */
/** @import { Store } from "../storage/store.js" */

import { parseOktaHost } from "../core/classify.js";
import {
  ENROL_FAILURES,
  originsFor,
  planEnrolment,
  recogniseAddress,
  validateLabel,
} from "../core/enrol.js";
import { REGIONS } from "../core/regions.js";
import { byId, errorMessage, h, setStatus } from "./dom.js";
import {
  changeRegion,
  originsForRegion,
  recordAccess,
  relabelOrganization,
  removeOrganization,
  saveOrganization,
} from "./enrolment.js";

const NOT_GRANTED = "Firefox did not grant access, so nothing was saved.";

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @param {(organization: Organization) => Promise<void>} [dependencies.onEnrolled]
 *   Called after an organization has been added.
 * @returns {{ render: (state: State) => void, offer: (address: string) => void }}
 */
export function createOrganizationsSection({ store, registry, onEnrolled }) {
  const list = byId("organizations", HTMLUListElement);
  const empty = byId("organizations-empty", HTMLElement);
  const listStatus = byId("organizations-status", HTMLElement);
  const form = byId("add-form", HTMLFormElement);
  const address = byId("add-address", HTMLInputElement);
  const label = byId("add-label", HTMLInputElement);
  const regionField = byId("add-region-field", HTMLElement);
  const region = byId("add-region", HTMLSelectElement);
  const grants = byId("add-grants", HTMLElement);
  const origins = byId("add-origins", HTMLUListElement);
  const addButton = byId("add-button", HTMLButtonElement);
  const addStatus = byId("add-status", HTMLElement);
  const permissions = browser.permissions;

  // What the list last showed, so an unrelated storage change does not
  // rebuild it under the user's hands.
  let shown = "";
  // Once the user types a label, suggestions stop replacing it.
  let labelEdited = false;

  region.append(
    h("option", { value: "" }, ["Choose a region…"]),
    ...REGIONS.map((name) => h("option", { value: name }, [name])),
  );

  /** @returns {ReturnType<typeof planEnrolment>} */
  function currentPlan() {
    return planEnrolment({
      address: address.value,
      region: region.value || null,
      regions: REGIONS,
    });
  }

  /** Updates the parts of the add form that depend on the address. */
  function refreshForm() {
    const recognised = recogniseAddress(address.value);
    regionField.hidden = !(
      recognised?.kind === "aws-portal" && recognised.region === null
    );
    if (!labelEdited) label.value = recognised?.suggestedLabel ?? "";

    const plan = currentPlan();
    grants.hidden = !plan.ok;
    origins.replaceChildren(
      ...(plan.ok ? plan.origins.map((origin) => h("li", {}, [origin])) : []),
    );
  }

  /**
   * Runs an action from a button, reporting how it went.
   *
   * @param {HTMLElement} line
   * @param {() => Promise<string>} action Resolves with what to tell the user.
   */
  function run(line, action) {
    setStatus(line, "Working…");
    action().then(
      (message) => setStatus(line, message),
      (error) => setStatus(line, errorMessage(error), "error"),
    );
  }

  address.addEventListener("input", refreshForm);
  region.addEventListener("change", refreshForm);
  label.addEventListener("input", () => {
    labelEdited = label.value !== "";
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  addButton.addEventListener("click", (event) => {
    event.preventDefault();
    const plan = currentPlan();
    if (!plan.ok) {
      setStatus(addStatus, ENROL_FAILURES[plan.reason], "error");
      return;
    }
    const problem = validateLabel(label.value);
    if (problem) {
      setStatus(addStatus, problem, "error");
      label.focus();
      return;
    }
    const chosenLabel = label.value;
    // Firefox only shows its prompt if this is called straight from the
    // click. Nothing above this line may be awaited.
    const granted = permissions.request({ origins: plan.origins });

    run(addStatus, async () => {
      if (!(await granted)) return NOT_GRANTED;
      const organization = await saveOrganization(
        store,
        plan,
        chosenLabel,
        new Date(),
      );
      await registry.syncNames();
      form.reset();
      labelEdited = false;
      refreshForm();
      await onEnrolled?.(organization);
      return `Added ${organization.label}.`;
    });
  });

  /**
   * @param {Organization} organization
   * @param {number} index
   * @returns {HTMLLIElement}
   */
  function card(organization, index) {
    const { key } = organization;
    const isPortal = organization.kind === "aws-portal";
    const shownAddress = isPortal
      ? `${organization.host} · ${organization.region ?? "no region"}`
      : (parseOktaHost(organization.host)?.adminHost ?? organization.host);

    const labelInput = h("input", {
      id: `organization-${index}-label`,
      type: "text",
      maxlength: "40",
      autocomplete: "off",
      value: organization.label,
    });
    const saveLabel = h(
      "button",
      { id: `organization-${index}-save`, type: "button" },
      ["Save label"],
    );
    saveLabel.addEventListener("click", () => {
      run(listStatus, async () => {
        const problem = validateLabel(labelInput.value);
        if (problem) throw new Error(problem);
        await relabelOrganization(store, key, labelInput.value);
        await registry.syncNames();
        return "Label saved. Its containers were renamed.";
      });
    });

    const rows = [
      h("div", { class: "inline" }, [
        h("div", {}, [
          h("label", { for: labelInput.id }, ["Label"]),
          labelInput,
        ]),
        saveLabel,
      ]),
    ];

    if (isPortal) {
      const regionSelect = h(
        "select",
        { id: `organization-${index}-region` },
        REGIONS.map((name) =>
          h("option", { value: name, selected: name === organization.region }, [
            name,
          ]),
        ),
      );
      const changeButton = h(
        "button",
        { id: `organization-${index}-change-region`, type: "button" },
        ["Change region"],
      );
      changeButton.addEventListener("click", () => {
        const chosen = regionSelect.value;
        if (chosen === organization.region) {
          setStatus(listStatus, "That is already this portal's region.");
          return;
        }
        // Straight from the click; see the Add button.
        const granted = permissions.request({
          origins: originsForRegion(chosen),
        });
        run(listStatus, async () => {
          if (!(await granted)) {
            return "Firefox did not grant access, so the region was not changed.";
          }
          await changeRegion({ store, permissions }, key, chosen);
          return `Region changed to ${chosen}.`;
        });
      });
      rows.push(
        h("div", { class: "inline" }, [
          h("div", {}, [
            h("label", { for: regionSelect.id }, ["AWS region"]),
            regionSelect,
          ]),
          changeButton,
        ]),
      );
    }

    const actions = h("div", { class: "actions" });
    if (!organization.accessGranted) {
      const grantButton = h(
        "button",
        { id: `organization-${index}-grant`, type: "button", class: "primary" },
        ["Grant access again"],
      );
      grantButton.addEventListener("click", () => {
        // Straight from the click; see the Add button.
        const granted = permissions.request({
          origins: originsFor(organization),
        });
        run(listStatus, async () => {
          const allowed = await granted;
          await recordAccess(store, key, allowed);
          return allowed ? "Access granted." : "Firefox did not grant access.";
        });
      });
      actions.append(grantButton);
    }
    const removeButton = h(
      "button",
      { id: `organization-${index}-remove`, type: "button", class: "danger" },
      ["Remove"],
    );
    removeButton.addEventListener("click", () => {
      run(listStatus, async () => {
        await removeOrganization({ store, permissions }, key);
        return `Removed ${organization.label}. Its containers were kept.`;
      });
    });
    actions.append(removeButton);

    return h("li", { class: "card" }, [
      h("div", { class: "card-head" }, [
        h("strong", {}, [organization.label]),
        h("span", { class: "tag" }, [
          isPortal ? "AWS access portal" : "Okta admin console",
        ]),
        organization.accessGranted
          ? h("span", { class: "tag ok" }, ["Access granted"])
          : h("span", { class: "tag warn" }, ["Needs access"]),
      ]),
      h("p", { class: "address" }, [shownAddress]),
      ...rows,
      actions,
    ]);
  }

  /** @param {State} state */
  function render(state) {
    const organizations = Object.values(state.organizations).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const next = JSON.stringify(organizations);
    if (next === shown) return;
    shown = next;

    // Rebuilding the list drops keyboard focus; put it back where it was.
    const focused = list.contains(document.activeElement)
      ? document.activeElement?.id
      : undefined;
    list.replaceChildren(...organizations.map(card));
    empty.hidden = organizations.length > 0;
    if (focused) {
      (document.getElementById(focused) ?? listStatus).focus();
    }
  }

  /** @param {string} offered An address to put in the add form. */
  function offer(offered) {
    address.value = offered;
    labelEdited = false;
    refreshForm();
    const recognised = recogniseAddress(offered);
    (recognised?.suggestedLabel ? addButton : label).focus();
    form.scrollIntoView({ block: "nearest" });
  }

  refreshForm();
  return { render, offer };
}
