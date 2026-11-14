import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyImport,
  EXPORT_FORMAT,
  exportSettings,
  IMPORT_FAILURES,
  parseImport,
} from "../../src/storage/backup.js";
import { defaultState, SCHEMA_VERSION } from "../../src/storage/schema.js";
import { oktaTenant, PORTAL_HOST, portal } from "../core/helpers.js";

const REGIONS = ["us-east-1", "us-west-2", "eu-west-1"];
const NOW = new Date("2026-04-04T00:00:00.000Z");

function populated() {
  const state = defaultState();
  state.settings.portalTemplate = "{org} sso";
  state.settings.oktaAdminEnabled = false;
  state.settings.colourRules = [{ match: "prod, live", colour: "red" }];
  state.organizations[portal().key] = portal();
  state.organizations[oktaTenant().key] = oktaTenant({ label: "acme idp" });
  state.accounts["111122223333"] = {
    accountId: "111122223333",
    name: "payments-prod",
    orgKey: portal().key,
    seenAt: NOW.toISOString(),
  };
  state.containers["aws:111122223333:AdminAccess"] = {
    key: "aws:111122223333:AdminAccess",
    cookieStoreId: "firefox-container-7",
    kind: "aws-console",
    orgKey: portal().key,
    managedName: "payments-prod(acme) / AdminAccess",
    userRenamed: false,
    createdAt: NOW.toISOString(),
    lastUsedAt: NOW.toISOString(),
  };
  state.notice = { message: "x", at: NOW.toISOString() };
  return state;
}

test("an export holds the settings and the organizations with their labels", () => {
  assert.deepEqual(exportSettings(populated(), NOW), {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: NOW.toISOString(),
    settings: populated().settings,
    organizations: [
      {
        kind: "okta-admin",
        host: "acme.okta.com",
        label: "acme idp",
        region: null,
      },
      {
        kind: "aws-portal",
        host: PORTAL_HOST,
        label: "acme",
        region: "us-west-2",
      },
    ],
  });
});

test("an export has no container map, account names or site access", () => {
  const exported = exportSettings(populated(), NOW);
  const text = JSON.stringify(exported);

  assert.deepEqual(Object.keys(exported).sort(), [
    "exportedAt",
    "format",
    "organizations",
    "schemaVersion",
    "settings",
  ]);
  for (const absent of [
    "firefox-container-7",
    "cookieStoreId",
    "111122223333",
    "payments-prod",
    "accessGranted",
  ]) {
    assert.equal(text.includes(absent), false, absent);
  }
});

test("an export can be imported into an empty profile", () => {
  const text = JSON.stringify(exportSettings(populated(), NOW));
  const imported = parseImport(text, REGIONS);
  assert.equal(imported.ok, true);

  const state = defaultState();
  applyImport(state, imported, NOW);

  assert.deepEqual(state.settings, populated().settings);
  assert.deepEqual(state.organizations, {
    [oktaTenant().key]: oktaTenant({
      label: "acme idp",
      accessGranted: false,
      addedAt: NOW.toISOString(),
    }),
    [portal().key]: portal({
      accessGranted: false,
      addedAt: NOW.toISOString(),
    }),
  });
  assert.deepEqual(state.containers, {});
  assert.deepEqual(state.accounts, {});
});

test("an import relabels what is enrolled and keeps its access and the rest", () => {
  const state = populated();
  const extra = portal({
    key: "aws-portal:d-0987654321.awsapps.com",
    host: "d-0987654321.awsapps.com",
    label: "kept",
  });
  state.organizations[extra.key] = extra;
  const file = exportSettings(populated(), NOW);
  file.organizations = [
    {
      kind: "aws-portal",
      host: PORTAL_HOST,
      label: "renamed",
      region: "us-west-2",
    },
  ];
  const imported = parseImport(JSON.stringify(file), REGIONS);
  assert.equal(imported.ok, true);

  applyImport(state, imported, NOW);

  assert.deepEqual(
    state.organizations[portal().key],
    portal({ label: "renamed" }),
  );
  // Not in the file: left as it was.
  assert.deepEqual(state.organizations[extra.key], extra);
  assert.equal(state.organizations[oktaTenant().key].label, "acme idp");
  // Never touched by an import.
  assert.deepEqual(state.containers, populated().containers);
  assert.deepEqual(state.accounts, populated().accounts);
});

test("an import that moves a portal to another region marks it as needing access", () => {
  const state = populated();
  const file = exportSettings(populated(), NOW);
  file.organizations = [
    {
      kind: "aws-portal",
      host: PORTAL_HOST,
      label: "acme",
      region: "eu-west-1",
    },
  ];
  const imported = parseImport(JSON.stringify(file), REGIONS);
  assert.equal(imported.ok, true);

  applyImport(state, imported, NOW);

  assert.equal(state.organizations[portal().key].region, "eu-west-1");
  assert.equal(state.organizations[portal().key].accessGranted, false);
});

test("an export from a newer schema version is rejected", () => {
  const file = {
    ...exportSettings(populated(), NOW),
    schemaVersion: SCHEMA_VERSION + 1,
  };

  assert.deepEqual(parseImport(JSON.stringify(file), REGIONS), {
    ok: false,
    reason: "newer-schema",
  });
});

/** @param {(file: any) => void} change */
function broken(change) {
  const file = structuredClone(exportSettings(populated(), NOW));
  change(file);
  return JSON.stringify(file);
}

for (const [label, text, reason] of [
  ["text that is not JSON", "{nope", "not-json"],
  ["JSON that is not an object", "[]", "not-an-export"],
  [
    "some other JSON file",
    '{"name":"something-else","version":"1.0.0"}',
    "not-an-export",
  ],
  [
    "no schema version",
    broken((file) => delete file.schemaVersion),
    "not-an-export",
  ],
  [
    "a schema version of zero",
    broken((file) => {
      file.schemaVersion = 0;
    }),
    "not-an-export",
  ],
  ["no settings", broken((file) => delete file.settings), "invalid-settings"],
  [
    "a template with an unknown token",
    broken((file) => {
      file.settings.consoleTemplate = "{nope}";
    }),
    "invalid-settings",
  ],
  [
    "a portal template using a console token",
    broken((file) => {
      file.settings.portalTemplate = "{role}";
    }),
    "invalid-settings",
  ],
  [
    "a template that is not text",
    broken((file) => {
      file.settings.oktaTemplate = 5;
    }),
    "invalid-settings",
  ],
  [
    "a switch that is not true or false",
    broken((file) => {
      file.settings.awsPortalsEnabled = "yes";
    }),
    "invalid-settings",
  ],
  [
    "a colour that does not exist",
    broken((file) => {
      file.settings.colourRules = [{ match: "x", colour: "beige" }];
    }),
    "invalid-settings",
  ],
  [
    "a colour rule with no text",
    broken((file) => {
      file.settings.colourRules = [{ match: " ", colour: "red" }];
    }),
    "invalid-settings",
  ],
  [
    "colour rules that are not a list",
    broken((file) => {
      file.settings.colourRules = {};
    }),
    "invalid-settings",
  ],
  [
    "organizations that are not a list",
    broken((file) => {
      file.organizations = {};
    }),
    "invalid-organization",
  ],
  [
    "an address that cannot be enrolled",
    broken((file) => {
      file.organizations[0].host = "example.com";
    }),
    "invalid-organization",
  ],
  [
    "a kind that does not match the address",
    broken((file) => {
      file.organizations[0].kind = "aws-portal";
    }),
    "invalid-organization",
  ],
  [
    "a portal with no region",
    broken((file) => {
      file.organizations[1].region = null;
    }),
    "invalid-organization",
  ],
  [
    "a portal in an unknown region",
    broken((file) => {
      file.organizations[1].region = "mars-1";
    }),
    "invalid-organization",
  ],
  [
    "an organization with an empty label",
    broken((file) => {
      file.organizations[0].label = " ";
    }),
    "invalid-organization",
  ],
  [
    "an organization that is not an object",
    broken((file) => {
      file.organizations[0] = "acme.okta.com";
    }),
    "invalid-organization",
  ],
]) {
  test(`an import of ${label} is rejected whole`, () => {
    const result = parseImport(text, REGIONS);

    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.ok(IMPORT_FAILURES[reason]);
  });
}

test("an export with no organizations and partial settings is accepted", () => {
  const text = JSON.stringify({
    format: EXPORT_FORMAT,
    schemaVersion: 1,
    settings: { portalTemplate: "{org} sso" },
  });

  const result = parseImport(text, REGIONS);

  assert.equal(result.ok, true);
  assert.equal(result.settings.portalTemplate, "{org} sso");
  assert.equal(
    result.settings.consoleTemplate,
    defaultState().settings.consoleTemplate,
  );
  assert.deepEqual(result.organizations, []);
});

test("an organization listed twice is imported once, the later entry winning", () => {
  const text = broken((file) => {
    file.organizations = [
      {
        kind: "okta-admin",
        host: "acme.okta.com",
        label: "first",
        region: null,
      },
      {
        kind: "okta-admin",
        host: "acme-admin.okta.com",
        label: "second",
        region: null,
      },
    ];
  });

  const result = parseImport(text, REGIONS);

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.organizations.map(({ key, label }) => [key, label]),
    [["okta-admin:acme.okta.com", "second"]],
  );
});
