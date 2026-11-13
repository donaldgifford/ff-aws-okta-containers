import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { API_HOST, PORTAL_HOST, PORTAL_URL, portal } from "../core/helpers.js";
import { createBackground, settle } from "./helpers.js";

/** @param {string} name */
function fixture(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

const VALID = fixture("federation-valid.json");
const CONSOLE_KEY = "aws:111122223333:AdminAccess";
const SHORTCUT_URL = `${PORTAL_URL}#/console?account_id=111122223333&role_name=AdminAccess`;
const PORTAL_STORE = "firefox-container-50";

/** A sign-in request as the portal makes it, from the given tab. */
function federationRequest(tab, overrides = {}) {
  return {
    requestId: "request-1",
    url: `https://${API_HOST}/federation/console?account_id=111122223333&role_name=AdminAccess`,
    method: "GET",
    type: "xmlhttprequest",
    tabId: tab.id,
    originUrl: PORTAL_URL,
    documentUrl: PORTAL_URL,
    cookieStoreId: tab.cookieStoreId,
    incognito: false,
    ...overrides,
  };
}

function accountListRequest(tab, overrides = {}) {
  return {
    requestId: "request-2",
    url: `https://${API_HOST}/instance/appinstances`,
    method: "POST",
    type: "xmlhttprequest",
    tabId: tab.id,
    originUrl: PORTAL_URL,
    documentUrl: PORTAL_URL,
    cookieStoreId: tab.cookieStoreId,
    incognito: false,
    ...overrides,
  };
}

/** The tabs the extension opened, as opposed to those the test added. */
function openedTabs(browser, ...mine) {
  const ids = new Set(mine.map((tab) => tab.id));
  return [...browser.openTabs.values()].filter((tab) => !ids.has(tab.id));
}

test("a role click opens the console in its own container and closes the shortcut tab", async () => {
  const { browser, aws, failures } = createBackground();
  const portalTab = browser.addTab({
    url: `${PORTAL_URL}#/`,
    cookieStoreId: PORTAL_STORE,
  });
  const shortcut = browser.addTab({
    url: SHORTCUT_URL,
    cookieStoreId: PORTAL_STORE,
  });

  assert.deepEqual(aws.onFederationRequest(federationRequest(shortcut)), {});
  const received = await browser.respond("request-1", VALID);
  await settle();

  // The page never sees the token.
  assert.equal(received, "");
  const [consoleTab] = openedTabs(browser, portalTab, shortcut);
  const container = browser.identities.get(consoleTab.cookieStoreId);
  assert.equal(container.name, "111122223333(acme) / AdminAccess");
  assert.equal(container.icon, "dollar");
  assert.equal(consoleTab.index, shortcut.index + 1);
  const signIn = new URL(consoleTab.url);
  assert.equal(signIn.hostname, "us-west-2.signin.aws.amazon.com");
  assert.equal(signIn.searchParams.get("Action"), "login");
  assert.equal(signIn.searchParams.get("Issuer"), PORTAL_URL);
  // The shortcut tab is closed; the portal tab is not.
  assert.equal(browser.openTabs.has(shortcut.id), false);
  assert.equal(browser.openTabs.has(portalTab.id), true);
  assert.equal(browser.stored().containers[CONSOLE_KEY].orgKey, portal().key);
  assert.equal(browser.badge.text, "");
  assert.deepEqual(failures, []);
});

test("a response that arrives in pieces is put back together", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });

  aws.onFederationRequest(federationRequest(shortcut));
  const half = Math.floor(VALID.length / 2);
  await browser.respond("request-1", VALID.slice(0, half), VALID.slice(half));
  await settle();

  assert.equal(openedTabs(browser, shortcut).length, 1);
});

test("a second click on the same role reuses the container", async () => {
  const { browser, aws } = createBackground();
  const first = browser.addTab({ url: SHORTCUT_URL });
  aws.onFederationRequest(federationRequest(first));
  await browser.respond("request-1", VALID);
  const second = browser.addTab({ url: SHORTCUT_URL });
  aws.onFederationRequest(
    federationRequest(second, { requestId: "request-9" }),
  );
  await browser.respond("request-9", VALID);
  await settle();

  const consoles = [...browser.openTabs.values()];
  assert.equal(consoles.length, 2);
  assert.equal(consoles[0].cookieStoreId, consoles[1].cookieStoreId);
  assert.equal(browser.calls.create, 1);
});

test("a request made from the portal tab itself leaves that tab open", async () => {
  const { browser, aws } = createBackground();
  const portalTab = browser.addTab({
    url: `${PORTAL_URL}#/`,
    cookieStoreId: PORTAL_STORE,
  });

  aws.onFederationRequest(federationRequest(portalTab));
  await browser.respond("request-1", VALID);
  await settle();

  assert.equal(browser.openTabs.has(portalTab.id), true);
  assert.equal(openedTabs(browser, portalTab).length, 1);
});

for (const [label, body, reason] of [
  ["an empty response", "", /empty/],
  ["a response that is not JSON", "<html>Sign in</html>", /not JSON/],
  [
    "a response with no token",
    fixture("federation-missing-token.json"),
    /no sign-in token/,
  ],
  [
    "a response with no sign-in address",
    fixture("federation-missing-location.json"),
    /no sign-in address/,
  ],
  [
    "a sign-in address that is not AWS",
    fixture("federation-untrusted-location.json"),
    /other than AWS/,
  ],
]) {
  test(`${label} is released to the page unchanged, with a warning`, async () => {
    const { browser, aws } = createBackground();
    const shortcut = browser.addTab({ url: SHORTCUT_URL });

    aws.onFederationRequest(federationRequest(shortcut));
    const received = await browser.respond("request-1", body);
    await settle();

    assert.equal(received, body);
    assert.deepEqual(openedTabs(browser, shortcut), []);
    assert.equal(browser.openTabs.has(shortcut.id), true);
    assert.equal(browser.calls.create, 0);
    assert.equal(browser.badge.text, "!");
    assert.match(browser.badge.title, reason);
    assert.match(browser.stored().notice.message, reason);
  });
}

test("a malformed account or role is released with a warning", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  const url = `https://${API_HOST}/federation/console?account_id=12&role_name=AdminAccess`;

  aws.onFederationRequest(federationRequest(shortcut, { url }));
  const received = await browser.respond("request-1", VALID);

  assert.equal(received, VALID);
  assert.equal(browser.badge.text, "!");
});

test("a container that cannot be created releases the response, with a warning", async () => {
  const { browser, aws, failures } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  browser.contextualIdentities.create = async () => {
    throw new Error("containers are disabled");
  };

  aws.onFederationRequest(federationRequest(shortcut));
  const received = await browser.respond("request-1", VALID);

  assert.equal(received, VALID);
  assert.equal(browser.openTabs.has(shortcut.id), true);
  assert.match(browser.badge.title, /could not be opened/);
  assert.equal(failures.length, 1);
});

test("a tab that cannot be opened releases the response, with a warning", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  browser.tabs.create = async () => {
    throw new Error("no window");
  };

  aws.onFederationRequest(federationRequest(shortcut));
  const received = await browser.respond("request-1", VALID);

  assert.equal(received, VALID);
  assert.equal(browser.badge.text, "!");
});

test("a warning never contains anything from the response", async () => {
  const { browser, aws, failures } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  const body = JSON.stringify({
    signInToken: "SECRET-TOKEN-VALUE",
    signInFederationLocation: "https://attacker.example.com/federation",
  });

  aws.onFederationRequest(federationRequest(shortcut));
  await browser.respond("request-1", body);

  const kept = JSON.stringify([browser.stored(), browser.badge, failures]);
  assert.equal(kept.includes("SECRET-TOKEN-VALUE"), false);
  assert.equal(kept.includes("attacker.example.com"), false);
});

test("a successful hand-off stores no token", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });

  aws.onFederationRequest(federationRequest(shortcut));
  await browser.respond("request-1", VALID);
  await settle();

  assert.equal(
    JSON.stringify(browser.stored()).includes("EXAMPLE-TOKEN"),
    false,
  );
});

test("a portal that is not enrolled is left untouched, silently", async () => {
  const { browser, aws } = createBackground((state) => {
    delete state.organizations[portal().key];
  });
  const shortcut = browser.addTab({ url: SHORTCUT_URL });

  aws.onFederationRequest(federationRequest(shortcut));
  const received = await browser.respond("request-1", VALID);

  assert.equal(received, VALID);
  assert.equal(browser.calls.create, 0);
  assert.equal(browser.badge.text, "");
});

test("with AWS consoles switched off the response is left untouched, silently", async () => {
  const { browser, aws } = createBackground((state) => {
    state.settings.awsConsolesEnabled = false;
  });
  const shortcut = browser.addTab({ url: SHORTCUT_URL });

  aws.onFederationRequest(federationRequest(shortcut));
  const received = await browser.respond("request-1", VALID);

  assert.equal(received, VALID);
  assert.equal(browser.calls.create, 0);
  assert.equal(browser.badge.text, "");
});

for (const [label, overrides] of [
  ["a preflight", { method: "OPTIONS" }],
  ["a private window", { incognito: true }],
  [
    "a request with no role",
    { url: `https://${API_HOST}/federation/console?account_id=111122223333` },
  ],
  ["another path on the API host", { url: `https://${API_HOST}/token/whoAmI` }],
  [
    "a host that is not the portal API",
    {
      url: "https://s3.us-west-2.amazonaws.com/federation/console?account_id=111122223333&role_name=AdminAccess",
    },
  ],
]) {
  test(`${label} gets no response filter at all`, () => {
    const { browser, aws } = createBackground();
    const tab = browser.addTab({ url: SHORTCUT_URL });

    assert.deepEqual(
      aws.onFederationRequest(federationRequest(tab, overrides)),
      {},
    );
    assert.equal(browser.filters.size, 0);
  });
}

test("a very large response is given back to the page and left alone", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  const chunk = "x".repeat(600 * 1024);

  aws.onFederationRequest(federationRequest(shortcut));
  const received = await browser.respond("request-1", chunk, chunk, chunk);

  assert.equal(received.length, chunk.length * 3);
  assert.equal(browser.filters.get("request-1").disconnected, true);
  assert.equal(browser.calls.create, 0);
});

test("the account list passes through untouched and its names are saved", async () => {
  const { browser, aws } = createBackground();
  const portalTab = browser.addTab({ url: `${PORTAL_URL}#/` });
  const body = fixture("account-list.json");

  assert.deepEqual(aws.onAccountListRequest(accountListRequest(portalTab)), {});
  const received = await browser.respond(
    "request-2",
    body.slice(0, 100),
    body.slice(100),
  );
  await settle();

  assert.equal(received, body);
  assert.deepEqual(browser.stored().accounts, {
    111122223333: {
      accountId: "111122223333",
      name: "payments-prod",
      orgKey: portal().key,
      seenAt: "2026-03-03T00:00:00.000Z",
    },
    444455556666: {
      accountId: "444455556666",
      name: "payments-dev",
      orgKey: portal().key,
      seenAt: "2026-03-03T00:00:00.000Z",
    },
  });
});

test("a console named with its account ID is renamed when the name arrives", async () => {
  const { browser, aws } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  aws.onFederationRequest(federationRequest(shortcut));
  await browser.respond("request-1", VALID);
  await settle();
  const { cookieStoreId } = browser.stored().containers[CONSOLE_KEY];
  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "111122223333(acme) / AdminAccess",
  );

  const portalTab = browser.addTab({ url: `${PORTAL_URL}#/` });
  aws.onAccountListRequest(accountListRequest(portalTab));
  await browser.respond("request-2", fixture("account-list.json"));
  await settle();

  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "payments-prod(acme) / AdminAccess",
  );
  assert.equal(browser.identities.get(cookieStoreId).color, "red");
  assert.equal(browser.calls.create, 1);
});

test("a console opened once the name is known is named with it from the start", async () => {
  const { browser, aws } = createBackground();
  const portalTab = browser.addTab({ url: `${PORTAL_URL}#/` });
  aws.onAccountListRequest(accountListRequest(portalTab));
  await browser.respond("request-2", fixture("account-list.json"));
  await settle();

  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  aws.onFederationRequest(federationRequest(shortcut));
  await browser.respond("request-1", VALID);
  await settle();

  const { cookieStoreId } = browser.stored().containers[CONSOLE_KEY];
  assert.equal(
    browser.identities.get(cookieStoreId).name,
    "payments-prod(acme) / AdminAccess",
  );
});

test("an unchanged account list writes nothing", async () => {
  const { browser, aws } = createBackground();
  const portalTab = browser.addTab({ url: `${PORTAL_URL}#/` });
  aws.onAccountListRequest(accountListRequest(portalTab));
  await browser.respond("request-2", fixture("account-list.json"));
  await settle();
  const writes = browser.calls.storageSet;

  aws.onAccountListRequest(
    accountListRequest(portalTab, { requestId: "request-3" }),
  );
  await browser.respond("request-3", fixture("account-list.json"));
  await settle();

  assert.equal(browser.calls.storageSet, writes);
});

for (const [label, overrides] of [
  ["the preflight", { method: "OPTIONS" }],
  ["a private window", { incognito: true }],
  ["another path", { url: `https://${API_HOST}/instance/other` }],
]) {
  test(`the account list listener ignores ${label}`, () => {
    const { browser, aws } = createBackground();
    const tab = browser.addTab({ url: PORTAL_URL });

    assert.deepEqual(
      aws.onAccountListRequest(accountListRequest(tab, overrides)),
      {},
    );
    assert.equal(browser.filters.size, 0);
  });
}

test("an account list that cannot be read still reaches the page", async () => {
  const { browser, aws } = createBackground();
  const portalTab = browser.addTab({ url: PORTAL_URL });

  aws.onAccountListRequest(accountListRequest(portalTab));
  const received = await browser.respond("request-2", "not json at all");

  assert.equal(received, "not json at all");
  assert.deepEqual(browser.stored().accounts, {});
});

test("a shortcut tab with no sign-in request warns that the region may be wrong", async () => {
  const { browser, aws, runScheduled } = createBackground();
  const shortcut = browser.addTab({
    url: SHORTCUT_URL,
    cookieStoreId: PORTAL_STORE,
  });

  aws.onTabUpdated(shortcut.id, { url: SHORTCUT_URL }, shortcut);
  await runScheduled();

  assert.equal(browser.badge.text, "!");
  assert.match(browser.badge.title, /acme.*region \(us-west-2\) may be wrong/);
});

test("a shortcut tab whose sign-in request was seen raises no region warning", async () => {
  const { browser, aws, runScheduled } = createBackground();
  const shortcut = browser.addTab({ url: SHORTCUT_URL });
  // Force the hand-off to fail, so the tab is still there when checked.
  aws.onTabUpdated(shortcut.id, { url: SHORTCUT_URL }, shortcut);
  aws.onFederationRequest(federationRequest(shortcut));
  await browser.respond("request-1", "");
  const afterFailure = browser.stored().notice.message;

  await runScheduled();

  assert.equal(browser.stored().notice.message, afterFailure);
  assert.doesNotMatch(afterFailure, /region/);
});

for (const [label, prepare, tabOverrides, change] of [
  [
    "a tab that has moved on",
    () => {},
    { url: "https://console.aws.amazon.com/" },
    SHORTCUT_URL,
  ],
  [
    "a tab that is not a shortcut",
    () => {},
    { url: `${PORTAL_URL}#/` },
    `${PORTAL_URL}#/`,
  ],
  [
    "a portal that is not enrolled",
    (state) => delete state.organizations[portal().key],
    {},
    SHORTCUT_URL,
  ],
  [
    "AWS consoles switched off",
    (state) => {
      state.settings.awsConsolesEnabled = false;
    },
    {},
    SHORTCUT_URL,
  ],
  [
    "a portal already marked as needing access",
    (state) => {
      state.organizations[portal().key].accessGranted = false;
    },
    {},
    SHORTCUT_URL,
  ],
]) {
  test(`${label} raises no region warning`, async () => {
    const { browser, aws, runScheduled } = createBackground(prepare);
    const tab = browser.addTab({ url: SHORTCUT_URL, ...tabOverrides });

    aws.onTabUpdated(tab.id, { url: change }, tab);
    await runScheduled();

    assert.equal(browser.badge.text, "");
    assert.equal(browser.stored().notice, null);
  });
}

test("the portal host in these tests is the enrolled one", () => {
  assert.equal(new URL(PORTAL_URL).hostname, PORTAL_HOST);
});
