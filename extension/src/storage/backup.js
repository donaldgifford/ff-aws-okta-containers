// Export and import of settings.
//
// An export holds the settings and the list of organizations with their
// labels. It never holds the container map (container IDs mean nothing in
// another profile), account names, or site access: after an import each
// organization has to be granted access again, through Firefox's prompt.

/** @import { Organization, OrganizationKind, Settings } from "../core/types.js" */
/** @import { State } from "./schema.js" */

import { planEnrolment, validateLabel } from "../core/enrol.js";
import { validateColourRule, validateTemplate } from "../core/naming.js";
import { normaliseSettings, SCHEMA_VERSION } from "./schema.js";

/** Marks a file as one of this extension's exports. */
export const EXPORT_FORMAT = "ff-aws-okta-containers-settings";

/**
 * Why a file could not be imported, with the text shown to the user.
 */
export const IMPORT_FAILURES = Object.freeze({
  "not-json": "That file is not JSON.",
  "not-an-export": "That file is not a settings export from this extension.",
  "newer-schema":
    "That file was exported by a newer version of this extension.",
  "invalid-settings": "That file's settings are not valid.",
  "invalid-organization": "That file lists an organization that is not valid.",
});

/** @typedef {keyof typeof IMPORT_FAILURES} ImportFailure */

/**
 * @typedef {object} ExportedOrganization
 * @property {OrganizationKind} kind
 * @property {string} host
 * @property {string} label
 * @property {string | null} region
 */

/**
 * @typedef {object} SettingsExport
 * @property {string} format
 * @property {number} schemaVersion
 * @property {string} exportedAt ISO 8601 time.
 * @property {Settings} settings
 * @property {ExportedOrganization[]} organizations
 */

/**
 * @typedef {object} ImportedOrganization
 * @property {OrganizationKind} kind
 * @property {string} key
 * @property {string} host
 * @property {string} label
 * @property {string | null} region
 */

/**
 * @typedef {{ ok: true, settings: Settings, organizations: ImportedOrganization[] }
 *   | { ok: false, reason: ImportFailure, detail?: string }} ImportResult
 */

/**
 * @param {State} state
 * @param {Date} now
 * @returns {SettingsExport}
 */
export function exportSettings(state, now) {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: structuredClone(state.settings),
    organizations: Object.values(state.organizations)
      .map(({ kind, host, label, region }) => ({ kind, host, label, region }))
      .sort((a, b) => a.host.localeCompare(b.host)),
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string | null} What is wrong with the settings, or null.
 */
function settingsProblem(value) {
  if (!isRecord(value)) return "No settings were found.";
  const templates = /** @type {const} */ ([
    ["aws-console", "consoleTemplate"],
    ["aws-portal", "portalTemplate"],
    ["okta-admin", "oktaTemplate"],
  ]);
  for (const [kind, name] of templates) {
    const template = value[name];
    if (template === undefined) continue;
    if (typeof template !== "string") return `${name} is not text.`;
    const problem = validateTemplate(kind, template);
    if (problem) return problem;
  }
  for (const name of [
    "awsConsolesEnabled",
    "awsPortalsEnabled",
    "oktaAdminEnabled",
  ]) {
    if (value[name] !== undefined && typeof value[name] !== "boolean") {
      return `${name} is not true or false.`;
    }
  }
  if (value.colourRules !== undefined) {
    if (!Array.isArray(value.colourRules)) return "colourRules is not a list.";
    for (const rule of value.colourRules) {
      if (
        !isRecord(rule) ||
        typeof rule.match !== "string" ||
        typeof rule.colour !== "string"
      ) {
        return "A colour rule is malformed.";
      }
      const problem = validateColourRule({
        match: rule.match,
        colour: rule.colour,
      });
      if (problem) return problem;
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} regions
 * @returns {ImportedOrganization | string} The organization, or what is
 *   wrong with it.
 */
function importedOrganization(value, regions) {
  if (
    !isRecord(value) ||
    typeof value.host !== "string" ||
    typeof value.label !== "string"
  ) {
    return "An organization is missing its address or label.";
  }
  const region = typeof value.region === "string" ? value.region : null;
  const plan = planEnrolment({ address: value.host, region, regions });
  if (!plan.ok || plan.kind !== value.kind) {
    return `${value.host} is not an address this extension can enrol.`;
  }
  const problem = validateLabel(value.label);
  if (problem) return `${value.host}: ${problem}`;
  return {
    kind: plan.kind,
    key: plan.key,
    host: plan.host,
    label: value.label.trim(),
    region: plan.region,
  };
}

/**
 * Reads and validates an export. Nothing is imported unless all of it is
 * valid.
 *
 * @param {string} text The file's contents.
 * @param {readonly string[]} regions The regions this version knows.
 * @returns {ImportResult}
 */
export function parseImport(text, regions) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (!isRecord(data) || data.format !== EXPORT_FORMAT) {
    return { ok: false, reason: "not-an-export" };
  }
  const version = data.schemaVersion;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return { ok: false, reason: "not-an-export" };
  }
  if (version > SCHEMA_VERSION) return { ok: false, reason: "newer-schema" };

  const problem = settingsProblem(data.settings);
  if (problem)
    return { ok: false, reason: "invalid-settings", detail: problem };

  const listed = data.organizations ?? [];
  if (!Array.isArray(listed)) {
    return { ok: false, reason: "invalid-organization" };
  }
  /** @type {Map<string, ImportedOrganization>} */
  const organizations = new Map();
  for (const entry of listed) {
    const organization = importedOrganization(entry, regions);
    if (typeof organization === "string") {
      return {
        ok: false,
        reason: "invalid-organization",
        detail: organization,
      };
    }
    organizations.set(organization.key, organization);
  }

  return {
    ok: true,
    settings: normaliseSettings(data.settings),
    organizations: [...organizations.values()],
  };
}

/**
 * Applies a validated import to the state. Settings are replaced.
 * Organizations are added or relabelled, never removed. One that is new, or
 * whose region changed, is marked as needing access: importing a file
 * cannot grant any.
 *
 * @param {State} state Changed in place.
 * @param {{ settings: Settings, organizations: ImportedOrganization[] }} imported
 * @param {Date} now
 */
export function applyImport(state, imported, now) {
  state.settings = structuredClone(imported.settings);
  for (const incoming of imported.organizations) {
    const existing = state.organizations[incoming.key];
    /** @type {Organization} */
    const organization = {
      ...incoming,
      accessGranted:
        existing?.region === incoming.region ? existing.accessGranted : false,
      addedAt: existing?.addedAt ?? now.toISOString(),
    };
    state.organizations[incoming.key] = organization;
  }
}
