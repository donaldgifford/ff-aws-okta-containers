import assert from "node:assert/strict";
import { test } from "node:test";

import { classify } from "../../src/core/classify.js";
import {
  DEFAULT_STORE,
  decideRouting,
  isEmptyTab,
} from "../../src/core/routing.js";
import { oktaTenant, PORTAL_URL, portal, settings } from "./helpers.js";

const ORGANIZATIONS = [portal(), oktaTenant()];
const OKTA_URL = "https://acme-admin.okta.com/admin/dashboard";

function facts(overrides = {}) {
  return {
    method: "GET",
    incognito: false,
    cookieStoreId: DEFAULT_STORE,
    target: classify(PORTAL_URL, ORGANIZATIONS),
    ...overrides,
  };
}

test("a GET to an enrolled portal from an ordinary tab is routed", () => {
  const decision = decideRouting(facts(), settings());

  assert.equal(decision.action, "route");
  assert.equal(decision.target.key, portal().key);
});

test("a GET to an enrolled Okta admin console is routed", () => {
  const target = classify(OKTA_URL, ORGANIZATIONS);

  const decision = decideRouting(facts({ target }), settings());

  assert.equal(decision.action, "route");
  assert.equal(decision.target.kind, "okta-admin");
});

for (const [label, overrides, reason] of [
  ["a POST", { method: "POST" }, "not-get"],
  ["a private window", { incognito: true }, "private-window"],
  [
    "a tab already in a container",
    { cookieStoreId: "firefox-container-7" },
    "in-container",
  ],
  ["an address that is not a target", { target: null }, "not-a-target"],
]) {
  test(`${label} is left alone`, () => {
    assert.deepEqual(decideRouting(facts(overrides), settings()), {
      action: "leave",
      reason,
    });
  });
}

test("a kind that is switched off is left alone", () => {
  const okta = classify(OKTA_URL, ORGANIZATIONS);

  assert.deepEqual(
    decideRouting(facts(), settings({ awsPortalsEnabled: false })),
    { action: "leave", reason: "kind-disabled" },
  );
  assert.deepEqual(
    decideRouting(
      facts({ target: okta }),
      settings({ oktaAdminEnabled: false }),
    ),
    { action: "leave", reason: "kind-disabled" },
  );
  // Each switch covers only its own kind.
  assert.equal(
    decideRouting(
      facts({ target: okta }),
      settings({ awsPortalsEnabled: false }),
    ).action,
    "route",
  );
});

test("only a tab with nothing in it counts as empty", () => {
  for (const url of [
    undefined,
    "",
    "about:blank",
    "about:newtab",
    "about:home",
  ]) {
    assert.equal(isEmptyTab(url), true, String(url));
  }
  assert.equal(isEmptyTab("https://example.com/"), false);
  assert.equal(isEmptyTab("about:preferences"), false);
});
