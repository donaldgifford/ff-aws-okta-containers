import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildSignInUrl,
  CONSOLE_HOME,
  chooseDestination,
  HAND_OFF_FAILURES,
  isShortcutTab,
  parseFederationRequest,
  parseFederationResponse,
  planHandOff,
  shortcutDestination,
  trustedSignInLocation,
} from "../../src/core/federation.js";
import { API_HOST, PORTAL_URL } from "./helpers.js";

/** @param {string} name */
function fixture(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

const REQUEST_URL = `https://${API_HOST}/federation/console?account_id=111122223333&role_name=AdminAccess`;
const SHORTCUT_TAB = `${PORTAL_URL}#/console?account_id=111122223333&role_name=AdminAccess`;

test("a sign-in request yields the account, role and container key", () => {
  assert.deepEqual(parseFederationRequest(REQUEST_URL), {
    accountId: "111122223333",
    roleName: "AdminAccess",
    key: "aws:111122223333:AdminAccess",
  });
});

for (const [label, query] of [
  ["no account", "role_name=AdminAccess"],
  ["no role", "account_id=111122223333"],
  ["a short account ID", "account_id=1111&role_name=AdminAccess"],
  ["a non-numeric account ID", "account_id=11112222333a&role_name=AdminAccess"],
  ["a role with a slash", "account_id=111122223333&role_name=a%2Fb"],
  ["a role with a space", "account_id=111122223333&role_name=a%20b"],
  ["an empty role", "account_id=111122223333&role_name="],
]) {
  test(`a sign-in request with ${label} is rejected`, () => {
    const url = `https://${API_HOST}/federation/console?${query}`;

    assert.equal(parseFederationRequest(url), null);
  });
}

test("a request to another path is not a sign-in request", () => {
  const url = `https://${API_HOST}/instance/appinstances?account_id=111122223333&role_name=AdminAccess`;

  assert.equal(parseFederationRequest(url), null);
});

test("a valid response is accepted", () => {
  assert.deepEqual(parseFederationResponse(fixture("federation-valid.json")), {
    ok: true,
    signInToken: "EXAMPLE-TOKEN/not+a=real&token",
    signInLocation: "https://us-west-2.signin.aws.amazon.com/federation",
    destination: "https://console.aws.amazon.com/",
  });
});

test("a response with extra fields is accepted", () => {
  const response = parseFederationResponse(
    fixture("federation-extra-fields.json"),
  );

  assert.equal(response.ok, true);
  assert.equal(
    response.signInLocation,
    "https://signin.aws.amazon.com/federation",
  );
});

for (const [label, body, reason] of [
  ["an empty body", "", "empty-body"],
  ["a blank body", "  \n", "empty-body"],
  ["a body that is not JSON", "<html>Sign in</html>", "not-json"],
  ["a JSON array", "[]", "not-json"],
  ["a JSON string", '"token"', "not-json"],
  ["no token", fixture("federation-missing-token.json"), "missing-token"],
  [
    "an empty token",
    '{"signInToken":"","signInFederationLocation":"https://signin.aws.amazon.com/federation"}',
    "missing-token",
  ],
  [
    "a token that is not a string",
    '{"signInToken":42,"signInFederationLocation":"https://signin.aws.amazon.com/federation"}',
    "missing-token",
  ],
  [
    "no sign-in address",
    fixture("federation-missing-location.json"),
    "missing-location",
  ],
  [
    "a sign-in address that is not AWS",
    fixture("federation-untrusted-location.json"),
    "untrusted-location",
  ],
]) {
  test(`a response with ${label} is rejected`, () => {
    assert.deepEqual(parseFederationResponse(body), { ok: false, reason });
    assert.ok(HAND_OFF_FAILURES[reason]);
  });
}

test("only https AWS sign-in hosts are trusted", () => {
  for (const location of [
    "https://signin.aws.amazon.com/federation",
    "https://us-west-2.signin.aws.amazon.com/federation",
    "https://eu-central-1.signin.aws.amazon.com/federation?x=1#y",
  ]) {
    assert.equal(
      trustedSignInLocation(location),
      `https://${new URL(location).hostname}/federation`,
    );
  }
  for (const location of [
    "http://signin.aws.amazon.com/federation",
    "https://signin.aws.amazon.com.example.com/federation",
    "https://example.com/signin.aws.amazon.com/federation",
    "https://evilsignin.aws.amazon.com/federation",
    "https://a.b.signin.aws.amazon.com/federation",
    "https://signin.aws.amazon.com:8443/federation",
    "https://user:pass@signin.aws.amazon.com/federation",
    "https://console.aws.amazon.com/federation",
    "javascript:alert(1)",
    "not a url",
    "",
  ]) {
    assert.equal(trustedSignInLocation(location), null, location);
  }
});

test("the sign-in address carries every value URL-encoded", () => {
  const url = buildSignInUrl({
    signInLocation: "https://us-west-2.signin.aws.amazon.com/federation",
    signInToken: "a/b+c=d&e",
    issuer: PORTAL_URL,
    destination: "https://console.aws.amazon.com/ec2/home?region=us-west-2#x",
  });

  assert.equal(
    url,
    "https://us-west-2.signin.aws.amazon.com/federation?Action=login" +
      "&SigninToken=a%2Fb%2Bc%3Dd%26e" +
      "&Issuer=https%3A%2F%2Fd-1234567890.awsapps.com%2Fstart%2F" +
      "&Destination=https%3A%2F%2Fconsole.aws.amazon.com%2Fec2%2Fhome%3Fregion%3Dus-west-2%23x",
  );
  const params = new URL(url).searchParams;
  assert.equal(params.get("SigninToken"), "a/b+c=d&e");
  assert.equal(params.get("Issuer"), PORTAL_URL);
});

test("a shortcut tab is recognised by its address", () => {
  assert.equal(isShortcutTab(SHORTCUT_TAB), true);
  assert.equal(isShortcutTab(`${PORTAL_URL}#/`), false);
  assert.equal(isShortcutTab(PORTAL_URL), false);
  assert.equal(isShortcutTab(undefined), false);
});

test("the destination comes from the shortcut link, then the response, then the console home", () => {
  const linked = "https://us-east-1.console.aws.amazon.com/s3/home";
  const withDestination = `${SHORTCUT_TAB}&destination=${encodeURIComponent(linked)}`;
  const fromResponse = "https://console.aws.amazon.com/billing/home";

  assert.equal(shortcutDestination(withDestination), linked);
  assert.equal(chooseDestination(withDestination, fromResponse), linked);
  assert.equal(chooseDestination(SHORTCUT_TAB, fromResponse), fromResponse);
  assert.equal(chooseDestination(PORTAL_URL, null), CONSOLE_HOME);
  assert.equal(chooseDestination(undefined, null), CONSOLE_HOME);
});

test("a destination that is not an AWS console address is ignored", () => {
  const elsewhere = `${SHORTCUT_TAB}&destination=${encodeURIComponent("https://example.com/")}`;
  const body = JSON.stringify({
    signInToken: "EXAMPLE-TOKEN",
    signInFederationLocation: "https://signin.aws.amazon.com/federation",
    destination: "http://console.aws.amazon.com/",
  });

  assert.equal(shortcutDestination(elsewhere), null);
  assert.equal(parseFederationResponse(body).destination, null);
});

test("a whole exchange becomes a sign-in address for the account's container", () => {
  const plan = planHandOff({
    requestUrl: REQUEST_URL,
    responseBody: fixture("federation-valid.json"),
    issuer: PORTAL_URL,
    tabUrl: SHORTCUT_TAB,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.key, "aws:111122223333:AdminAccess");
  assert.equal(plan.accountId, "111122223333");
  assert.equal(plan.roleName, "AdminAccess");
  const url = new URL(plan.signInUrl);
  assert.equal(url.hostname, "us-west-2.signin.aws.amazon.com");
  assert.equal(url.searchParams.get("Action"), "login");
  assert.equal(
    url.searchParams.get("SigninToken"),
    "EXAMPLE-TOKEN/not+a=real&token",
  );
  assert.equal(
    url.searchParams.get("Destination"),
    "https://console.aws.amazon.com/",
  );
});

test("a failed exchange carries a reason and nothing from the response", () => {
  const plan = planHandOff({
    requestUrl: REQUEST_URL,
    responseBody: fixture("federation-untrusted-location.json"),
    issuer: PORTAL_URL,
    tabUrl: SHORTCUT_TAB,
  });

  assert.deepEqual(plan, { ok: false, reason: "untrusted-location" });
});

test("an exchange for a malformed request is refused", () => {
  const plan = planHandOff({
    requestUrl: `https://${API_HOST}/federation/console?account_id=1&role_name=x`,
    responseBody: fixture("federation-valid.json"),
    issuer: PORTAL_URL,
    tabUrl: undefined,
  });

  assert.deepEqual(plan, { ok: false, reason: "bad-request" });
});
