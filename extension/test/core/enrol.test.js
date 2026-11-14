import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiHost,
  buildOrganization,
  ENROL_FAILURES,
  enrolmentOffer,
  isApiUrl,
  originsFor,
  originsNeeded,
  originsToRevoke,
  planEnrolment,
  recogniseAddress,
  validateLabel,
} from "../../src/core/enrol.js";
import { oktaTenant, PORTAL_HOST, PORTAL_URL, portal } from "./helpers.js";

const REGIONS = ["us-east-1", "us-west-2", "eu-west-1"];

test("enrolling a portal requests its address and its region's API address", () => {
  const plan = planEnrolment({
    address: `${PORTAL_URL}#/`,
    region: "us-west-2",
    regions: REGIONS,
  });

  assert.deepEqual(plan, {
    ok: true,
    kind: "aws-portal",
    key: `aws-portal:${PORTAL_HOST}`,
    host: PORTAL_HOST,
    region: "us-west-2",
    origins: [
      `https://${PORTAL_HOST}/*`,
      "https://portal.sso.us-west-2.amazonaws.com/*",
    ],
    suggestedLabel: "",
  });
});

test("enrolling an Okta tenant requests only its admin address", () => {
  const plan = planEnrolment({
    address: "https://acme-admin.okta.com/admin/dashboard",
    region: null,
    regions: REGIONS,
  });

  assert.deepEqual(plan, {
    ok: true,
    kind: "okta-admin",
    key: "okta-admin:acme.okta.com",
    host: "acme.okta.com",
    region: null,
    origins: ["https://acme-admin.okta.com/*"],
    suggestedLabel: "acme",
  });
});

test("the tenant's own address enrols the same tenant as its admin address", () => {
  const typed = planEnrolment({
    address: "acme.okta.com",
    region: null,
    regions: REGIONS,
  });

  assert.equal(typed.ok, true);
  assert.equal(typed.key, "okta-admin:acme.okta.com");
  assert.deepEqual(typed.origins, ["https://acme-admin.okta.com/*"]);
});

test("a bare host is accepted as an address", () => {
  assert.equal(recogniseAddress(` ${PORTAL_HOST} `)?.kind, "aws-portal");
  assert.equal(recogniseAddress("acme-admin.okta.com")?.kind, "okta-admin");
});

test("a label is suggested for Okta and left empty for a portal", () => {
  assert.equal(recogniseAddress("acme.awsapps.com")?.suggestedLabel, "");
  assert.equal(recogniseAddress(PORTAL_HOST)?.suggestedLabel, "");
  assert.equal(recogniseAddress("acme.okta.com")?.suggestedLabel, "acme");
  assert.equal(
    recogniseAddress("acme-admin.oktapreview.com")?.suggestedLabel,
    "acme (preview)",
  );
  assert.equal(
    recogniseAddress("acme.okta-emea.com")?.suggestedLabel,
    "acme (emea)",
  );
});

for (const address of [
  "",
  "   ",
  "example.com",
  "https://console.aws.amazon.com/",
  "http://acme-admin.okta.com/",
  "ftp://acme.awsapps.com/",
  "https://-admin.okta.com/",
  "about:blank",
  "not a url at all",
]) {
  test(`${JSON.stringify(address)} cannot be enrolled`, () => {
    assert.equal(recogniseAddress(address), null);
    assert.deepEqual(
      planEnrolment({ address, region: "us-west-2", regions: REGIONS }),
      { ok: false, reason: "not-recognised" },
    );
  });
}

test("a portal needs a region this version knows", () => {
  assert.deepEqual(
    planEnrolment({ address: PORTAL_HOST, region: null, regions: REGIONS }),
    { ok: false, reason: "region-required" },
  );
  assert.deepEqual(
    planEnrolment({ address: PORTAL_HOST, region: "", regions: REGIONS }),
    { ok: false, reason: "region-required" },
  );
  assert.deepEqual(
    planEnrolment({ address: PORTAL_HOST, region: "mars-1", regions: REGIONS }),
    { ok: false, reason: "unknown-region" },
  );
  for (const reason of Object.keys(ENROL_FAILURES)) {
    assert.ok(ENROL_FAILURES[reason]);
  }
});

test("an app.aws portal takes its region from its address", () => {
  const address = "ssoins-1234567890abcdef.portal.eu-west-1.app.aws";

  const plan = planEnrolment({ address, region: null, regions: REGIONS });

  assert.equal(plan.ok, true);
  assert.equal(plan.region, "eu-west-1");
  assert.deepEqual(plan.origins, [
    `https://${address}/*`,
    "https://portal.sso.eu-west-1.amazonaws.com/*",
  ]);
  assert.deepEqual(
    planEnrolment({ address, region: "us-east-1", regions: REGIONS }),
    { ok: false, reason: "region-mismatch" },
  );
});

test("every requested address is a single host, never a wildcard domain", () => {
  for (const organization of [portal(), oktaTenant()]) {
    for (const origin of originsFor(organization)) {
      assert.match(origin, /^https:\/\/[a-z0-9.-]+\/\*$/);
    }
  }
  assert.equal(apiHost("us-west-2"), "portal.sso.us-west-2.amazonaws.com");
});

test("removing the only portal in a region revokes both of its addresses", () => {
  const organizations = [portal(), oktaTenant()];

  assert.deepEqual(originsToRevoke(portal(), organizations), [
    `https://${PORTAL_HOST}/*`,
    "https://portal.sso.us-west-2.amazonaws.com/*",
  ]);
});

test("removing one of two portals that share a region keeps the region's API address", () => {
  const other = portal({
    key: "aws-portal:d-0987654321.awsapps.com",
    host: "d-0987654321.awsapps.com",
  });
  const organizations = [portal(), other];

  assert.deepEqual(originsToRevoke(portal(), organizations), [
    `https://${PORTAL_HOST}/*`,
  ]);
});

test("removing a portal in a different region revokes that region's API address", () => {
  const other = portal({
    key: "aws-portal:d-0987654321.awsapps.com",
    host: "d-0987654321.awsapps.com",
    region: "eu-west-1",
  });

  assert.deepEqual(originsToRevoke(other, [portal(), other]), [
    "https://d-0987654321.awsapps.com/*",
    "https://portal.sso.eu-west-1.amazonaws.com/*",
  ]);
});

test("removing an Okta tenant revokes its admin address", () => {
  assert.deepEqual(originsToRevoke(oktaTenant(), [portal(), oktaTenant()]), [
    "https://acme-admin.okta.com/*",
  ]);
});

test("a label is required and kept short", () => {
  assert.equal(validateLabel("acme"), null);
  assert.match(validateLabel("   ") ?? "", /required/);
  assert.match(validateLabel("x".repeat(41)) ?? "", /40/);
});

test("an enrolment becomes an organization record with its label", () => {
  const plan = planEnrolment({
    address: PORTAL_HOST,
    region: "us-west-2",
    regions: REGIONS,
  });
  assert.equal(plan.ok, true);

  assert.deepEqual(
    buildOrganization(plan, "  acme  ", new Date("2026-01-01T00:00:00.000Z")),
    portal(),
  );
});

test("the toolbar button offers to add an unenrolled portal or tenant", () => {
  const enrolled = [portal()];

  assert.equal(
    enrolmentOffer("https://d-0987654321.awsapps.com/start/#/", enrolled),
    "d-0987654321.awsapps.com",
  );
  assert.equal(
    enrolmentOffer("https://acme-admin.okta.com/admin/dashboard", enrolled),
    "acme-admin.okta.com",
  );
});

test("the toolbar button offers nothing for an enrolled or unrelated tab", () => {
  const enrolled = [portal(), oktaTenant()];

  assert.equal(enrolmentOffer(PORTAL_URL, enrolled), null);
  assert.equal(enrolmentOffer("https://acme-admin.okta.com/", enrolled), null);
  assert.equal(enrolmentOffer("https://example.com/", enrolled), null);
  assert.equal(enrolmentOffer("about:newtab", enrolled), null);
  assert.equal(enrolmentOffer(undefined, enrolled), null);
});

test("only portal API hosts count as the portal API", () => {
  assert.equal(
    isApiUrl("https://portal.sso.us-west-2.amazonaws.com/federation/console"),
    true,
  );
  for (const url of [
    "https://s3.us-west-2.amazonaws.com/federation/console",
    "https://portal.sso.us-west-2.amazonaws.com.example.com/x",
    "https://x.portal.sso.us-west-2.amazonaws.com/x",
    "not a url",
  ]) {
    assert.equal(isApiUrl(url), false, url);
  }
});

test("one request covers every organization that lacks access", () => {
  const other = portal({
    key: "aws-portal:d-0987654321.awsapps.com",
    host: "d-0987654321.awsapps.com",
    accessGranted: false,
  });
  const organizations = [
    portal({ accessGranted: false }),
    other,
    oktaTenant(),
    oktaTenant({
      key: "okta-admin:other.okta.com",
      host: "other.okta.com",
      accessGranted: false,
    }),
  ];

  assert.deepEqual(originsNeeded(organizations), [
    "https://d-0987654321.awsapps.com/*",
    `https://${PORTAL_HOST}/*`,
    "https://other-admin.okta.com/*",
    // Shared by both portals, asked for once.
    "https://portal.sso.us-west-2.amazonaws.com/*",
  ]);
  assert.deepEqual(originsNeeded([portal(), oktaTenant()]), []);
});
