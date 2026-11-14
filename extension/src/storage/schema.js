// The stored data model: what is kept in storage.local, its defaults, and
// the migrations between schema versions. Nothing here touches a browser
// API; store.js does the reading and writing.
//
// Storage holds labels, templates, rules, account names and the container
// map. It never holds a token, a cookie or a credential.

/** @import { Account, ColourRule, ManagedContainer, Organization, Settings } from "../core/types.js" */

import {
  DEFAULT_COLOUR_RULES,
  DEFAULT_TEMPLATES,
  isColour,
} from "../core/naming.js";

export const SCHEMA_VERSION = 1;

/**
 * Something the user should be told, shown on the toolbar button and the
 * options page until it is dismissed or superseded.
 *
 * @typedef {object} Notice
 * @property {string} message
 * @property {string} at ISO 8601 time.
 */

/**
 * Everything the extension stores. Each property is one storage.local key.
 *
 * @typedef {object} State
 * @property {number} schemaVersion
 * @property {Settings} settings
 * @property {Record<string, Organization>} organizations By organization key.
 * @property {Record<string, Account>} accounts By account ID.
 * @property {Record<string, ManagedContainer>} containers By target key.
 * @property {Notice | null} notice
 */

/**
 * @typedef {(data: Record<string, unknown>) => Record<string, unknown>} Migration
 */

/**
 * @typedef {{ ok: true, state: State, changed: boolean }
 *   | { ok: false, reason: "newer-schema" | "corrupt" }} MigrationResult
 */

/**
 * Migrations by the version they produce: entry N turns version N-1 data
 * into version N. Version 0 is storage that has never been written.
 *
 * @type {Readonly<Record<number, Migration>>}
 */
export const MIGRATIONS = Object.freeze({
  // First version: there is nothing older to convert.
  1: (data) => data,
});

/** @returns {Settings} */
export function defaultSettings() {
  return {
    consoleTemplate: DEFAULT_TEMPLATES.console,
    portalTemplate: DEFAULT_TEMPLATES.portal,
    oktaTemplate: DEFAULT_TEMPLATES.okta,
    awsConsolesEnabled: true,
    awsPortalsEnabled: true,
    oktaAdminEnabled: true,
    colourRules: DEFAULT_COLOUR_RULES.map((rule) => ({ ...rule })),
  };
}

/** @returns {State} */
export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    organizations: {},
    accounts: {},
    containers: {},
    notice: null,
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
 * @param {Record<string, unknown>} record
 * @param {string[]} names
 * @returns {boolean} Whether every named property is a string.
 */
function hasStrings(record, names) {
  return names.every((name) => typeof record[name] === "string");
}

/**
 * @param {unknown} value
 * @returns {value is ColourRule}
 */
function isColourRule(value) {
  return (
    isRecord(value) && typeof value.match === "string" && isColour(value.colour)
  );
}

/**
 * Builds settings from stored or imported data, falling back to the default
 * for anything missing or of the wrong type.
 *
 * @param {unknown} value
 * @returns {Settings}
 */
export function normaliseSettings(value) {
  const defaults = defaultSettings();
  if (!isRecord(value)) return defaults;

  /**
   * @param {"consoleTemplate" | "portalTemplate" | "oktaTemplate"} name
   * @returns {string}
   */
  const text = (name) => {
    const stored = value[name];
    return typeof stored === "string" && stored.trim() !== ""
      ? stored
      : defaults[name];
  };
  /**
   * @param {"awsConsolesEnabled" | "awsPortalsEnabled" | "oktaAdminEnabled"} name
   * @returns {boolean}
   */
  const flag = (name) => {
    const stored = value[name];
    return typeof stored === "boolean" ? stored : defaults[name];
  };

  return {
    consoleTemplate: text("consoleTemplate"),
    portalTemplate: text("portalTemplate"),
    oktaTemplate: text("oktaTemplate"),
    awsConsolesEnabled: flag("awsConsolesEnabled"),
    awsPortalsEnabled: flag("awsPortalsEnabled"),
    oktaAdminEnabled: flag("oktaAdminEnabled"),
    colourRules: Array.isArray(value.colourRules)
      ? value.colourRules
          .filter(isColourRule)
          .map(({ match, colour }) => ({ match, colour }))
      : defaults.colourRules,
  };
}

/**
 * @param {unknown} value
 * @returns {value is Organization}
 */
function isOrganization(value) {
  return (
    isRecord(value) &&
    hasStrings(value, ["key", "host", "label", "addedAt"]) &&
    (value.kind === "aws-portal" || value.kind === "okta-admin") &&
    (typeof value.region === "string" || value.region === null) &&
    typeof value.accessGranted === "boolean"
  );
}

/**
 * @param {unknown} value
 * @returns {value is Account}
 */
function isAccount(value) {
  return (
    isRecord(value) &&
    hasStrings(value, ["accountId", "name", "orgKey", "seenAt"])
  );
}

/**
 * @param {unknown} value
 * @returns {value is ManagedContainer}
 */
function isManagedContainer(value) {
  return (
    isRecord(value) &&
    hasStrings(value, [
      "key",
      "cookieStoreId",
      "kind",
      "managedName",
      "createdAt",
      "lastUsedAt",
    ]) &&
    (typeof value.orgKey === "string" || value.orgKey === null) &&
    typeof value.userRenamed === "boolean"
  );
}

/**
 * Keeps the well-formed entries of a stored map.
 *
 * @template T
 * @param {unknown} value
 * @param {(entry: unknown) => entry is T} isValid
 * @returns {Record<string, T> | null} Null if the value is not a map at all.
 */
function normaliseMap(value, isValid) {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  /** @type {Record<string, T>} */
  const entries = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isValid(entry)) entries[key] = entry;
  }
  return entries;
}

/**
 * @param {unknown} value
 * @returns {Notice | null}
 */
function normaliseNotice(value) {
  return isRecord(value) && hasStrings(value, ["message", "at"])
    ? { message: String(value.message), at: String(value.at) }
    : null;
}

/**
 * Turns whatever is in storage into the current state.
 *
 * Data from an older version is migrated. Data from a newer version is
 * refused, untouched: this code does not know what it means.
 *
 * @param {Record<string, unknown>} raw Everything read from storage.
 * @param {object} [options] For tests.
 * @param {number} [options.version]
 * @param {Readonly<Record<number, Migration>>} [options.migrations]
 * @returns {MigrationResult}
 */
export function migrate(
  raw,
  { version = SCHEMA_VERSION, migrations = MIGRATIONS } = {},
) {
  const stored = raw.schemaVersion ?? 0;
  if (typeof stored !== "number" || !Number.isInteger(stored) || stored < 0) {
    return { ok: false, reason: "corrupt" };
  }
  if (stored > version) return { ok: false, reason: "newer-schema" };

  let data = raw;
  for (let next = stored + 1; next <= version; next += 1) {
    const step = migrations[next];
    if (!step) return { ok: false, reason: "corrupt" };
    data = step(data);
  }

  const organizations = normaliseMap(data.organizations, isOrganization);
  const accounts = normaliseMap(data.accounts, isAccount);
  const containers = normaliseMap(data.containers, isManagedContainer);
  if (!organizations || !accounts || !containers) {
    return { ok: false, reason: "corrupt" };
  }

  return {
    ok: true,
    changed: stored !== version,
    state: {
      schemaVersion: version,
      settings: normaliseSettings(data.settings),
      organizations,
      accounts,
      containers,
      notice: normaliseNotice(data.notice),
    },
  };
}
