import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_COLOUR_RULES } from "../../src/core/naming.js";
import {
  defaultState,
  migrate,
  normaliseSettings,
  SCHEMA_VERSION,
} from "../../src/storage/schema.js";
import { portal } from "../core/helpers.js";

test("storage that has never been written becomes the defaults", () => {
  const result = migrate({});

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.state, defaultState());
  assert.equal(result.state.schemaVersion, SCHEMA_VERSION);
});

test("the defaults include the three default colour rules, all kinds on", () => {
  const { settings } = defaultState();

  assert.deepEqual(settings.colourRules, DEFAULT_COLOUR_RULES);
  assert.equal(settings.colourRules.length, 3);
  assert.equal(settings.awsConsolesEnabled, true);
  assert.equal(settings.awsPortalsEnabled, true);
  assert.equal(settings.oktaAdminEnabled, true);
});

test("data at the current version is returned as it is", () => {
  const state = defaultState();
  state.organizations[portal().key] = portal();
  state.settings.portalTemplate = "{org} sso";

  const result = migrate(structuredClone(state));

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.state, state);
});

test("data from a newer version is refused", () => {
  const raw = { ...defaultState(), schemaVersion: SCHEMA_VERSION + 1 };

  assert.deepEqual(migrate(raw), { ok: false, reason: "newer-schema" });
});

for (const [label, raw] of [
  ["a version that is not a number", { schemaVersion: "1" }],
  ["a negative version", { schemaVersion: -1 }],
  ["a fractional version", { schemaVersion: 0.5 }],
  ["organizations that are not a map", { schemaVersion: 1, organizations: [] }],
  ["containers that are not a map", { schemaVersion: 1, containers: "x" }],
]) {
  test(`${label} is treated as corrupt`, () => {
    assert.deepEqual(migrate(raw), { ok: false, reason: "corrupt" });
  });
}

test("migrations run in order from the stored version", () => {
  const order = [];
  const migrations = {
    1: (data) => {
      order.push(1);
      return { ...data, settings: { portalTemplate: "{org} one" } };
    },
    2: (data) => {
      order.push(2);
      return {
        ...data,
        settings: { ...data.settings, oktaTemplate: "{org} two" },
      };
    },
    3: (data) => {
      order.push(3);
      return data;
    },
  };

  const fromEmpty = migrate({}, { version: 3, migrations });
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(fromEmpty.state.schemaVersion, 3);
  assert.equal(fromEmpty.state.settings.portalTemplate, "{org} one");
  assert.equal(fromEmpty.state.settings.oktaTemplate, "{org} two");

  order.length = 0;
  const fromTwo = migrate({ schemaVersion: 2 }, { version: 3, migrations });
  assert.deepEqual(order, [3]);
  assert.equal(fromTwo.changed, true);
});

test("a missing migration step is corrupt, not skipped", () => {
  const result = migrate({}, { version: 2, migrations: { 1: (data) => data } });

  assert.deepEqual(result, { ok: false, reason: "corrupt" });
});

test("malformed records are dropped and the rest kept", () => {
  const result = migrate({
    schemaVersion: 1,
    organizations: { good: portal(), bad: { key: "x" } },
    accounts: { bad: { accountId: 5 } },
    notice: { message: 42 },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.state.organizations), ["good"]);
  assert.deepEqual(result.state.accounts, {});
  assert.equal(result.state.notice, null);
});

test("settings fall back to defaults field by field", () => {
  const settings = normaliseSettings({
    consoleTemplate: "{account} / {role}",
    portalTemplate: "   ",
    oktaAdminEnabled: false,
    awsPortalsEnabled: "yes",
    colourRules: [
      { match: "prod", colour: "purple" },
      { match: "x", colour: "beige" },
      "nonsense",
    ],
  });

  assert.equal(settings.consoleTemplate, "{account} / {role}");
  assert.equal(settings.portalTemplate, defaultState().settings.portalTemplate);
  assert.equal(settings.oktaAdminEnabled, false);
  assert.equal(settings.awsPortalsEnabled, true);
  assert.deepEqual(settings.colourRules, [{ match: "prod", colour: "purple" }]);
  assert.deepEqual(normaliseSettings(null), defaultState().settings);
});

test("an emptied colour rule list stays empty", () => {
  assert.deepEqual(normaliseSettings({ colourRules: [] }).colourRules, []);
});
