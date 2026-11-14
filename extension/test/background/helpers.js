// Builds the background script's moving parts on top of the fake browser.

import { createAwsHandlers } from "../../src/background/aws.js";
import {
  createNavigationListener,
  reopenInContainer,
} from "../../src/background/navigation.js";
import { createNotifier } from "../../src/background/notices.js";
import { createRegistry } from "../../src/background/registry.js";
import { originsFor } from "../../src/core/enrol.js";
import { defaultState } from "../../src/storage/schema.js";
import { createStore } from "../../src/storage/store.js";
import { oktaTenant, portal } from "../core/helpers.js";
import { createFakeBrowser } from "../fake-browser.js";

/**
 * @param {(state: ReturnType<typeof defaultState>) => void} [prepare]
 *   Changes the stored state before anything reads it.
 */
export function createBackground(prepare = () => {}) {
  const state = defaultState();
  state.organizations[portal().key] = portal();
  state.organizations[oktaTenant().key] = oktaTenant();
  prepare(state);

  const browser = createFakeBrowser({
    storage: state,
    origins: Object.values(state.organizations).flatMap(originsFor),
  });
  const store = createStore(browser.storage.local);
  browser.storage.onChanged.addListener(() => store.invalidate());

  /** @type {string[]} */
  const failures = [];
  const reportFailure = (what) => (error) => {
    failures.push(`${what}: ${error instanceof Error ? error.message : error}`);
  };
  /** @type {(() => void)[]} */
  const scheduled = [];
  const now = () => new Date("2026-03-03T00:00:00.000Z");

  const registry = createRegistry({
    store,
    identities: browser.contextualIdentities,
    now,
  });
  const notifier = createNotifier({ store, action: browser.action, now });
  const dependencies = { store, registry, tabs: browser.tabs, reportFailure };
  const aws = createAwsHandlers({
    ...dependencies,
    notifier,
    webRequest: browser.webRequest,
    schedule: (task) => scheduled.push(task),
    now,
  });

  return {
    browser,
    store,
    registry,
    notifier,
    aws,
    onNavigation: createNavigationListener(dependencies),
    reopen: (tabId, organization) =>
      reopenInContainer(dependencies, tabId, organization),
    failures,
    /** Runs everything that was scheduled for later, then lets it finish. */
    async runScheduled() {
      for (const task of scheduled.splice(0)) task();
      await settle();
    },
  };
}

/** Lets work that was started without being awaited finish. */
export function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}
