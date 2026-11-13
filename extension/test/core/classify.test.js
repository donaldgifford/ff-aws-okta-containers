import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classify,
  findPortal,
  parseOktaHost,
  parsePortalHost,
} from "../../src/core/classify.js";
import { consoleKey, parseKey } from "../../src/core/keys.js";
import { oktaTenant, PORTAL_HOST, portal } from "./helpers.js";

const ORGANIZATIONS = [portal(), oktaTenant()];

test("an enrolled portal's start page is a portal target", () => {
  const target = classify(`https://${PORTAL_HOST}/start/#/`, ORGANIZATIONS);

  assert.equal(target?.kind, "aws-portal");
  assert.equal(target?.key, `aws-portal:${PORTAL_HOST}`);
  assert.equal(target?.organization.label, "acme");
});

test("an enrolled tenant's admin console is an Okta admin target", () => {
  const target = classify(
    "https://acme-admin.okta.com/admin/dashboard",
    ORGANIZATIONS,
  );

  assert.equal(target?.kind, "okta-admin");
  assert.equal(target?.key, "okta-admin:acme.okta.com");
});

for (const [label, url] of [
  ["a portal that is not enrolled", "https://d-0987654321.awsapps.com/start/"],
  ["a tenant that is not enrolled", "https://other-admin.okta.com/"],
  ["the tenant's own sign-in host", "https://acme.okta.com/app/UserHome"],
  ["an admin host with no org name", "https://-admin.okta.com/"],
  ["a host nested under the admin host", "https://x.acme-admin.okta.com/"],
  [
    "the same org on another base domain",
    "https://acme-admin.oktapreview.com/",
  ],
  ["a portal host outside /start", `https://${PORTAL_HOST}/mail`],
  ["a path that only begins like /start", `https://${PORTAL_HOST}/startup`],
  ["plain http", `http://${PORTAL_HOST}/start/`],
  ["a look-alike host", `https://${PORTAL_HOST}.example.com/start/`],
  ["something that is not a URL", "not a url"],
  ["an unrelated site", "https://example.com/start/"],
]) {
  test(`${label} is not a target`, () => {
    assert.equal(classify(url, ORGANIZATIONS), null);
  });
}

test("the app.aws portal forms are recognised once enrolled", () => {
  const host = "ssoins-1234567890abcdef.portal.us-east-1.app.aws";
  const organizations = [
    portal({ key: `aws-portal:${host}`, host, region: "us-east-1" }),
  ];

  assert.equal(classify(`https://${host}/`, organizations)?.kind, "aws-portal");
  assert.equal(classify(`https://${host}/`, ORGANIZATIONS), null);
});

test("hosts are compared without regard to letter case", () => {
  const url = `https://${PORTAL_HOST.toUpperCase()}/start/`;

  assert.equal(classify(url, ORGANIZATIONS)?.kind, "aws-portal");
});

test("parsePortalHost reads the name and, where present, the region", () => {
  assert.deepEqual(parsePortalHost("acme.awsapps.com"), {
    host: "acme.awsapps.com",
    name: "acme",
    region: null,
  });
  assert.deepEqual(parsePortalHost("acme.account-access.eu-west-1.app.aws"), {
    host: "acme.account-access.eu-west-1.app.aws",
    name: "acme",
    region: "eu-west-1",
  });
  assert.equal(parsePortalHost("awsapps.com"), null);
  assert.equal(parsePortalHost("a.b.awsapps.com"), null);
  assert.equal(parsePortalHost("acme.other.eu-west-1.app.aws"), null);
});

test("parseOktaHost tells the admin host from the tenant host", () => {
  assert.deepEqual(parseOktaHost("acme-admin.okta-emea.com"), {
    org: "acme",
    baseDomain: "okta-emea.com",
    tenantHost: "acme.okta-emea.com",
    adminHost: "acme-admin.okta-emea.com",
    isAdmin: true,
  });
  assert.equal(parseOktaHost("acme.okta.com")?.isAdmin, false);
  assert.equal(parseOktaHost("okta.com"), null);
  assert.equal(parseOktaHost("acme.example.com"), null);
});

test("findPortal returns only enrolled portals", () => {
  assert.equal(findPortal(PORTAL_HOST, ORGANIZATIONS)?.label, "acme");
  assert.equal(findPortal("acme.okta.com", ORGANIZATIONS), null);
  assert.equal(findPortal("d-0987654321.awsapps.com", ORGANIZATIONS), null);
});

test("keys round-trip through parseKey", () => {
  assert.deepEqual(parseKey(consoleKey("111122223333", "AdminAccess")), {
    kind: "aws-console",
    accountId: "111122223333",
    role: "AdminAccess",
  });
  assert.deepEqual(parseKey(`aws-portal:${PORTAL_HOST}`), {
    kind: "aws-portal",
    host: PORTAL_HOST,
  });
  assert.deepEqual(parseKey("okta-admin:acme.okta.com"), {
    kind: "okta-admin",
    host: "acme.okta.com",
  });
  for (const key of [
    "",
    "aws:",
    "aws:111122223333",
    "aws:111122223333:",
    "x:y",
  ]) {
    assert.equal(parseKey(key), null, key);
  }
});
