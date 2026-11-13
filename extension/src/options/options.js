// The options page. It reads and writes the same storage as the background
// script, and uses the same registry code to rename containers when a label
// or template changes.

import { refreshAccess } from "../background/access.js";
import { reopenInContainer } from "../background/navigation.js";
import { createRegistry } from "../background/registry.js";
import { createStore } from "../storage/store.js";
import { byId, errorMessage } from "./dom.js";
import { createNoticeBanner } from "./notice.js";
import { createOrganizationsSection } from "./organizations.js";

const store = createStore(browser.storage.local);
const registry = createRegistry({
  store,
  identities: browser.contextualIdentities,
});
const pageError = byId("page-error", HTMLElement);

const query = new URLSearchParams(location.search);

const organizations = createOrganizationsSection({
  store,
  registry,
  // Enrolment started from the toolbar button on a portal or admin console:
  // now that it is enrolled, reopen that tab in its new container.
  onEnrolled: async (organization) => {
    const tabId = Number(query.get("tab"));
    if (!query.has("tab") || !Number.isInteger(tabId)) return;
    await reopenInContainer(
      {
        store,
        registry,
        tabs: browser.tabs,
        reportFailure: (what) => (error) => {
          console.error(`[containers] ${what}: ${errorMessage(error)}`);
        },
      },
      tabId,
      organization,
    );
  },
});
const sections = [createNoticeBanner({ store }), organizations];

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
const offered = query.get("add");
if (offered) organizations.offer(offered);

// A grant may have been changed in the add-on manager since the last look.
await refreshAccess({ store, permissions: browser.permissions }).catch(
  () => {},
);
await render();
