import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appearanceFor,
  COLOURS,
  colourFor,
  DEFAULT_COLOUR_RULES,
  DEFAULT_TEMPLATES,
  ICONS,
  orgLabelFor,
  renderTemplate,
  validateColourRule,
  validateTemplate,
} from "../../src/core/naming.js";
import { oktaTenant, portal, settings } from "./helpers.js";

const CONSOLE_KEY = "aws:111122223333:AdminAccess";
const NAMED = { orgLabel: "acme", accountName: "payments-prod" };

test("the default console name is account(org) / role", () => {
  assert.equal(
    appearanceFor(CONSOLE_KEY, NAMED, settings())?.name,
    "payments-prod(acme) / AdminAccess",
  );
});

test("the account ID stands in until the account name is known", () => {
  const context = { orgLabel: "acme", accountName: null };

  assert.equal(
    appearanceFor(CONSOLE_KEY, context, settings())?.name,
    "111122223333(acme) / AdminAccess",
  );
});

test("portals and Okta admin consoles are named from the org label", () => {
  const context = { orgLabel: "acme", accountName: null };

  assert.deepEqual(appearanceFor(portal().key, context, settings()), {
    name: "acme portal",
    color: colourFor("acme portal", portal().key, []),
    icon: ICONS["aws-portal"],
  });
  assert.equal(
    appearanceFor(oktaTenant().key, context, settings())?.name,
    "acme okta admin",
  );
  assert.equal(
    appearanceFor(oktaTenant().key, context, settings())?.icon,
    ICONS["okta-admin"],
  );
});

test("a changed template changes the name, not the key", () => {
  const custom = settings({ consoleTemplate: "{org}: {accountId} as {role}" });

  assert.equal(
    appearanceFor(CONSOLE_KEY, NAMED, custom)?.name,
    "acme: 111122223333 as AdminAccess",
  );
});

test("a malformed key has no appearance", () => {
  assert.equal(appearanceFor("nonsense", NAMED, settings()), null);
});

test("templates fill known tokens and leave unknown ones visible", () => {
  assert.equal(
    renderTemplate("{org} / {role}", { org: "a", role: "b" }),
    "a / b",
  );
  assert.equal(renderTemplate("{org} {nope}", { org: "a" }), "a {nope}");
  assert.equal(renderTemplate("  {org}   portal ", { org: "a" }), "a portal");
});

test("the default templates are valid", () => {
  assert.equal(
    validateTemplate("aws-console", DEFAULT_TEMPLATES.console),
    null,
  );
  assert.equal(validateTemplate("aws-portal", DEFAULT_TEMPLATES.portal), null);
  assert.equal(validateTemplate("okta-admin", DEFAULT_TEMPLATES.okta), null);
});

test("a template is rejected when empty, too long or using a foreign token", () => {
  assert.match(validateTemplate("aws-console", "  ") ?? "", /empty/);
  assert.match(validateTemplate("aws-console", "x".repeat(81)) ?? "", /80/);
  assert.match(validateTemplate("aws-console", "{acount}") ?? "", /\{acount\}/);
  // {role} means nothing for a portal.
  assert.match(
    validateTemplate("aws-portal", "{org} {role}") ?? "",
    /\{role\}/,
  );
});

test("the default colour rules mark prod red, staging yellow, dev green", () => {
  const rules = DEFAULT_COLOUR_RULES;

  assert.equal(colourFor("payments-prod(acme) / Admin", "k", rules), "red");
  assert.equal(colourFor("payments-PROD(acme) / Admin", "k", rules), "red");
  assert.equal(
    colourFor("payments-staging(acme) / Admin", "k", rules),
    "yellow",
  );
  assert.equal(colourFor("payments-stage(acme) / Admin", "k", rules), "yellow");
  assert.equal(colourFor("payments-dev(acme) / Admin", "k", rules), "green");
  assert.equal(colourFor("load-test(acme) / Admin", "k", rules), "green");
  assert.equal(colourFor("sandbox-7(acme) / Admin", "k", rules), "green");
});

test("the first matching colour rule wins", () => {
  const rules = [
    { match: "dev", colour: "green" },
    { match: "prod", colour: "red" },
  ];

  assert.equal(colourFor("dev-tools-prod", "k", rules), "green");
});

test("with no matching rule the colour depends only on the key", () => {
  const first = colourFor("some name", "aws:111122223333:ReadOnly", []);

  assert.ok(COLOURS.includes(first));
  assert.equal(
    colourFor("another name", "aws:111122223333:ReadOnly", []),
    first,
  );
  const colours = new Set(
    Array.from({ length: 50 }, (_, index) =>
      colourFor("name", `aws:${String(index).padStart(12, "0")}:Role`, []),
    ),
  );
  assert.ok(colours.size > 1);
});

test("a colour rule needs text and a real colour", () => {
  assert.equal(validateColourRule({ match: "prod", colour: "red" }), null);
  assert.match(
    validateColourRule({ match: " , ", colour: "red" }) ?? "",
    /text/,
  );
  assert.match(
    validateColourRule({ match: "x", colour: "beige" }) ?? "",
    /beige/,
  );
  assert.match(validateColourRule({ match: "x", colour: "" }) ?? "", /colour/);
});

test("an organization that is no longer enrolled is labelled from its address", () => {
  const organizations = [portal(), oktaTenant({ label: "acme idp" })];

  assert.equal(orgLabelFor(portal().key, organizations), "acme");
  assert.equal(orgLabelFor(oktaTenant().key, organizations), "acme idp");
  assert.equal(
    orgLabelFor("aws-portal:gone.awsapps.com", organizations),
    "gone",
  );
  assert.equal(orgLabelFor(null, organizations), "unknown");
});
