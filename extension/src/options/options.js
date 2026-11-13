// The options page. It reads and writes the same storage as the background
// script, and uses the same registry code to rename containers when a label
// or template changes.

import { refreshAccess } from "../background/access.js";
import { createRegistry } from "../background/registry.js";
import { createStore } from "../storage/store.js";
import { byId, errorMessage } from "./dom.js";
import { createOrganizationsSection } from "./organizations.js";

const store = createStore(browser.storage.local);
const registry = createRegistry({
  store,
  identities: browser.contextualIdentities,
});
const pageError = byId("page-error", HTMLElement);

const organizations = createOrganizationsSection({ store, registry });
const sections = [organizations];

async function render() {
  try {
    const state = await store.load();
    pageError.hidden = true;
    for (const section of sections) section.render(state);
  } catch (error) {
    pageError.textContent = `${errorMessage(error)} Nothing here can be changed until that is fixed.`;
    pageError.hidden = false;
  }
}

browser.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "local") return;
  store.invalidate();
  render();
});

// The toolbar button opens this page with the address of the tab it was
// clicked on, when that tab is a portal or tenant that is not enrolled yet.
const offered = new URLSearchParams(location.search).get("add");
if (offered) organizations.offer(offered);

// A grant may have been changed in the add-on manager since the last look.
await refreshAccess({ store, permissions: browser.permissions }).catch(
  () => {},
);
await render();
