// Throwaway spike for IMPL-0001 phase 1: create a container on first use,
// reuse it afterwards, and open a tab in it.
//
// Logging goes to the extension console only (about:debugging > Inspect).
// Never log token or cookie values here.

"use strict";

const TEST_CONTAINER = "spike test";
const TEST_URL = "https://example.com/";

function log(...args) {
  console.log("[spike]", ...args);
}

// Returns the container with this name, creating it if it does not exist.
// The spike looks containers up by name; the real extension will keep its
// own key-to-cookieStoreId map (INV-0001).
async function getOrCreateContainer(name, { color = "blue", icon = "circle" } = {}) {
  const existing = await browser.contextualIdentities.query({ name });
  if (existing.length > 0) {
    log("reusing container", name, existing[0].cookieStoreId);
    return existing[0];
  }
  const created = await browser.contextualIdentities.create({ name, color, icon });
  log("created container", name, created.cookieStoreId);
  return created;
}

// Opens url in the named container, next to the tab that triggered it.
async function openInContainer(url, name, openerTab) {
  if (openerTab && openerTab.incognito) {
    // Containers do not exist in private windows.
    log("private window: not routing", url);
    return null;
  }
  const container = await getOrCreateContainer(name);
  const tab = await browser.tabs.create({
    url,
    cookieStoreId: container.cookieStoreId,
    index: openerTab ? openerTab.index + 1 : undefined,
  });
  log("opened tab", tab.id, "in", container.cookieStoreId);
  return tab;
}

// Test action: the toolbar button opens TEST_URL in the test container.
browser.action.onClicked.addListener((tab) => {
  openInContainer(TEST_URL, TEST_CONTAINER, tab).catch((error) => {
    log("failed:", error.message);
  });
});

log("background script loaded");
