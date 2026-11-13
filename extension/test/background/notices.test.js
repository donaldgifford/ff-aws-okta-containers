import assert from "node:assert/strict";
import { test } from "node:test";

import { createBackground } from "./helpers.js";

test("a warning is stored and shown on the toolbar button", async () => {
  const { browser, notifier } = createBackground();

  await notifier.warn("Something went wrong.");

  assert.deepEqual(browser.stored().notice, {
    message: "Something went wrong.",
    at: "2026-03-03T00:00:00.000Z",
  });
  assert.equal(browser.badge.text, "!");
  assert.equal(
    browser.badge.title,
    "AWS and Okta containers: Something went wrong.",
  );
});

test("the badge is cleared once the notice has been cleared", async () => {
  const { browser, store, notifier } = createBackground();
  await notifier.warn("Something went wrong.");

  // What the options page does once the notice has been seen.
  await store.update((state) => {
    state.notice = null;
  });
  await notifier.sync();

  assert.equal(browser.badge.text, "");
  assert.equal(browser.badge.title, null);
});

test("a waiting notice is put back on the badge at startup", async () => {
  const { browser, notifier } = createBackground((state) => {
    state.notice = {
      message: "Still waiting.",
      at: "2026-01-01T00:00:00.000Z",
    };
  });

  await notifier.sync();

  assert.equal(browser.badge.text, "!");
  assert.match(browser.badge.title, /Still waiting/);
});

test("storage from a newer version shows an error on the toolbar button", async () => {
  const { browser, notifier } = createBackground((state) => {
    state.schemaVersion = 99;
  });

  await notifier.sync();

  assert.equal(browser.badge.text, "!");
  assert.match(browser.badge.title, /newer version/);
});

test("a warning that cannot be stored is still shown", async () => {
  const { browser, notifier } = createBackground((state) => {
    state.schemaVersion = 99;
  });

  await assert.rejects(notifier.warn("Something went wrong."));

  assert.equal(browser.badge.text, "!");
  assert.match(browser.badge.title, /Something went wrong/);
});
