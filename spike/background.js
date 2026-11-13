// Throwaway spike for IMPL-0001.
//
//   Phase 1: create a container on first use, reuse it, open a tab in it.
//   Phase 2: open AWS consoles and AWS access portals in their own containers.
//   Phase 3: open Okta admin consoles in a container per tenant.
//
// Logging goes to the extension console only (about:debugging > Inspect).
// It records the shape of what was seen (hosts, paths, field names) and
// never the value of a token or cookie.

"use strict";

const DEFAULT_STORE = "firefox-default";
const COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];

// Set to false to silence the request-shape log used for discovery.
const DISCOVERY_LOG = true;

function log(...args) {
  console.log("[spike]", ...args);
}

// ─── Containers ─────────────────────────────────────────────────────

// A colour that stays the same for the same name.
function colorFor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

// Returns the container with this name, creating it if it does not exist.
// The spike looks containers up by name; the real extension will keep its
// own key-to-cookieStoreId map (INV-0001).
async function getOrCreateContainer(name, icon = "circle") {
  const existing = await browser.contextualIdentities.query({ name });
  if (existing.length > 0) {
    log("reusing container", name, existing[0].cookieStoreId);
    return existing[0];
  }
  const created = await browser.contextualIdentities.create({
    name,
    color: colorFor(name),
    icon,
  });
  log("created container", name, created.cookieStoreId);
  return created;
}

// Opens url in the named container, next to the tab that triggered it.
async function openInContainer(url, name, openerTab, icon) {
  if (openerTab && openerTab.incognito) {
    // Containers do not exist in private windows.
    log("private window: not routing");
    return null;
  }
  const container = await getOrCreateContainer(name, icon);
  const tab = await browser.tabs.create({
    url,
    cookieStoreId: container.cookieStoreId,
    index: openerTab ? openerTab.index + 1 : undefined,
    windowId: openerTab ? openerTab.windowId : undefined,
  });
  log("opened tab", tab.id, "in", container.cookieStoreId);
  return tab;
}

async function tabOrNull(tabId) {
  if (tabId < 0) return null;
  try {
    return await browser.tabs.get(tabId);
  } catch {
    return null;
  }
}

// ─── Phase 1: test action ───────────────────────────────────────────

browser.action.onClicked.addListener((tab) => {
  openInContainer("https://example.com/", "spike test", tab).catch((error) => {
    log("failed:", error.message);
  });
});

// ─── Host classification (phases 2 and 3) ───────────────────────────

const OKTA_BASE_DOMAINS = ["okta.com", "oktapreview.com", "okta-emea.com"];

// AWS access portal → { name, icon } for its container, or null.
function classifyPortal(url) {
  const host = url.hostname;
  const first = host.split(".")[0];
  if (host.endsWith(".awsapps.com") && url.pathname.startsWith("/start")) {
    return { kind: "aws-portal", name: `${first} portal`, icon: "briefcase" };
  }
  // Newer forms: <id>.portal.<region>.app.aws and
  // <tenant>.account-access.<region>.app.aws
  if (/^[^.]+\.(portal|account-access)\.[a-z0-9-]+\.app\.aws$/.test(host)) {
    return { kind: "aws-portal", name: `${first} portal`, icon: "briefcase" };
  }
  return null;
}

// Okta admin console → { name, icon } for its container, or null.
// Only <org>-admin hosts match; <org>.okta.com is deliberately not routed.
function classifyOktaAdmin(url) {
  const host = url.hostname;
  for (const base of OKTA_BASE_DOMAINS) {
    if (!host.endsWith("." + base)) continue;
    const label = host.slice(0, -(base.length + 1));
    if (label.includes(".") || !label.endsWith("-admin")) return null;
    const tenant = label.slice(0, -"-admin".length);
    if (!tenant) return null;
    const suffix = base === "okta.com" ? "" : ` (${base})`;
    return { kind: "okta-admin", name: `${tenant} okta admin${suffix}`, icon: "fingerprint" };
  }
  return null;
}

// ─── Routing: move top-level navigations out of "no container" ──────
//
// Rule (INV-0001): only a GET in a tab with no container is moved. A tab
// already in any container is left alone, and so is a POST.

const BLANK_URLS = new Set(["about:blank", "about:newtab", "about:home"]);

async function routeNavigation(details) {
  if (details.method !== "GET") return {};
  if (details.incognito) return {};
  if (details.cookieStoreId && details.cookieStoreId !== DEFAULT_STORE) return {};

  const url = new URL(details.url);
  const target = classifyPortal(url) || classifyOktaAdmin(url);
  if (!target) return {};

  const tab = await tabOrNull(details.tabId);
  if (!tab || tab.incognito) return {};
  if (tab.cookieStoreId !== DEFAULT_STORE) return {};

  log("routing", target.kind, "navigation into", JSON.stringify(target.name));
  try {
    await openInContainer(details.url, target.name, tab, target.icon);
  } catch (error) {
    log("routing failed, leaving the navigation alone:", error.message);
    return {};
  }
  // Close the tab we took the navigation from if it had nothing in it.
  if (BLANK_URLS.has(tab.url)) {
    browser.tabs.remove(tab.id).catch(() => {});
  }
  return { cancel: true };
}

browser.webRequest.onBeforeRequest.addListener(
  routeNavigation,
  {
    urls: [
      "https://*.awsapps.com/start*",
      "https://*.app.aws/*",
      "https://*.okta.com/*",
      "https://*.oktapreview.com/*",
      "https://*.okta-emea.com/*",
    ],
    types: ["main_frame"],
  },
  ["blocking"],
);

// ─── Phase 2: AWS console hand-off ──────────────────────────────────
//
// The access portal asks its federation endpoint for a sign-in token, then
// navigates to the console with it. We read that response, keep it from the
// page, and open the sign-in URL in the account's container instead.

const FEDERATION_URLS = [
  "https://*.amazonaws.com/federation/console?*",
  "https://*.app.aws/federation/console?*",
];
const ACCOUNT_LIST_URLS = [
  "https://*.amazonaws.com/instance/appinstances*",
  "https://*.app.aws/instance/appinstances*",
];

// Account names learned from the portal's own account list, kept in session
// storage so they survive the background script going idle.
async function rememberAccounts(accounts) {
  const { accountNames = {} } = await browser.storage.session.get("accountNames");
  Object.assign(accountNames, accounts);
  await browser.storage.session.set({ accountNames });
}

async function accountName(accountId) {
  const { accountNames = {} } = await browser.storage.session.get("accountNames");
  return accountNames[accountId] || null;
}

// Reads a response body. With withhold=false the bytes pass through to the
// page untouched as they arrive; with withhold=true the caller gets them and
// decides whether to release them by calling the returned release().
function readResponse(requestId, withhold, onBody) {
  const filter = browser.webRequest.filterResponseData(requestId);
  const decoder = new TextDecoder("utf-8");
  const chunks = [];
  let text = "";
  filter.ondata = (event) => {
    text += decoder.decode(event.data, { stream: true });
    if (withhold) chunks.push(event.data);
    else filter.write(event.data);
  };
  filter.onstop = async () => {
    const release = () => {
      for (const chunk of chunks) filter.write(chunk);
    };
    try {
      await onBody(text, release);
    } catch (error) {
      log("response handler failed:", error.message);
      if (withhold) release();
    }
    filter.close();
  };
  filter.onerror = () => log("response filter error:", filter.error);
}

function onAccountList(details) {
  // The portal sends this as a POST, preceded by an OPTIONS preflight that
  // has no body worth reading.
  if (details.method === "OPTIONS") return {};
  readResponse(details.requestId, false, async (text) => {
    if (!text) return;
    const body = JSON.parse(text);
    const items = Array.isArray(body.result) ? body.result : [];
    const found = {};
    for (const item of items) {
      const meta = item.searchMetadata;
      if (meta && meta.AccountId && meta.AccountName) found[meta.AccountId] = meta.AccountName;
    }
    // Field names only, never values.
    log(
      "account list: top-level fields", Object.keys(body),
      "item fields", items[0] ? Object.keys(items[0]) : [],
      "metadata fields", items[0] && items[0].searchMetadata ? Object.keys(items[0].searchMetadata) : [],
      "accounts named", Object.keys(found).length,
    );
    if (Object.keys(found).length > 0) await rememberAccounts(found);
  });
  return {};
}

function onFederation(details) {
  if (details.method !== "GET") return {};
  if (details.incognito) return {};

  const requestUrl = new URL(details.url);
  const accountId = requestUrl.searchParams.get("account_id");
  const roleName = requestUrl.searchParams.get("role_name");
  if (!accountId || !roleName) return {};

  readResponse(details.requestId, true, async (text, release) => {
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON: hand it back untouched.
    }
    if (!body || !body.signInToken || !body.signInFederationLocation) {
      log("federation: no sign-in token; fields seen", body ? Object.keys(body) : "(not JSON)");
      release();
      return;
    }
    log("federation: fields", Object.keys(body), "sign-in host", new URL(body.signInFederationLocation).hostname);

    // The page that asked: used for the organization label, the issuer and
    // any destination carried in a shortcut link.
    const origin = details.originUrl || details.documentUrl || "";
    const originHost = origin ? new URL(origin).hostname : "";
    const org = originHost.split(".")[0] || "aws";
    const originQuery = new URLSearchParams(origin.includes("?") ? origin.slice(origin.indexOf("?") + 1) : "");
    const destination =
      originQuery.get("destination") || body.destination || "https://console.aws.amazon.com/";

    const name = `${org} ${(await accountName(accountId)) || accountId} / ${roleName}`;
    const signInUrl =
      body.signInFederationLocation +
      "?Action=login" +
      "&SigninToken=" + encodeURIComponent(body.signInToken) +
      "&Issuer=" + encodeURIComponent(origin) +
      "&Destination=" + encodeURIComponent(destination);

    const tab = await tabOrNull(details.tabId);
    await openInContainer(signInUrl, name, tab, "dollar");

    // The portal opens a role in a new tab at …/#/console?…; that tab now
    // has nothing to show. Leave any other tab (the portal itself) alone.
    if (tab && tab.url && tab.url.includes("#/console")) {
      browser.tabs.remove(tab.id).catch(() => {});
    } else {
      log("federation: requesting tab is not a shortcut tab; left open");
    }
  });
  return {};
}

browser.webRequest.onBeforeRequest.addListener(
  onFederation,
  { urls: FEDERATION_URLS, types: ["xmlhttprequest"] },
  ["blocking"],
);

browser.webRequest.onBeforeRequest.addListener(
  onAccountList,
  { urls: ACCOUNT_LIST_URLS, types: ["xmlhttprequest"] },
  ["blocking"],
);

// ─── Discovery log ──────────────────────────────────────────────────
//
// Records which hosts and paths the portal talks to, without query strings,
// so the request patterns can be written down for the design.

if (DISCOVERY_LOG) {
  const seen = new Set();
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = new URL(details.url);
      const key = `${details.method} ${details.type} ${url.hostname}${url.pathname}`;
      if (seen.has(key)) return;
      seen.add(key);
      log("seen:", key);
    },
    {
      urls: ["https://*.amazonaws.com/*", "https://*.awsapps.com/*", "https://*.app.aws/*"],
      types: ["xmlhttprequest", "main_frame"],
    },
  );
}

log("background script loaded");
