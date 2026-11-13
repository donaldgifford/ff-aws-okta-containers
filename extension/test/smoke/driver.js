// Test driver for the headless load test. It is appended to a temporary copy
// of the extension by run.mjs and never ships: it reports to a local port,
// which the extension itself is not allowed to do.
//
// It is listed first in the background scripts, so its error handlers are in
// place before the real background script runs.

const REPORT_URL = "__REPORT_URL__";

/** @type {string[]} */
const errors = [];

self.addEventListener("error", (event) => {
  errors.push(String(event.message ?? event));
});
self.addEventListener("unhandledrejection", (event) => {
  errors.push(`unhandled rejection: ${String(event.reason)}`);
});

/**
 * Checks that only exist once later phases add the code they exercise.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
async function extraChecks() {
  return {};
}

async function report() {
  /** @type {Record<string, unknown>} */
  const result = { loaded: true };
  try {
    const granted = await browser.permissions.getAll();
    result.origins = granted.origins ?? [];
    Object.assign(result, await extraChecks());
  } catch (error) {
    errors.push(`driver: ${String(error)}`);
  }
  result.errors = errors;
  await fetch(REPORT_URL, { method: "POST", body: JSON.stringify(result) });
}

// Give the real background script a moment to load and fail if it is going to.
setTimeout(report, 1500);
