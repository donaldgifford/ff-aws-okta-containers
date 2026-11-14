#!/usr/bin/env node
// Headless load test. Copies the extension to a temporary directory, adds the
// test driver, loads it in headless Firefox with web-ext, and checks what the
// driver reports.
//
//   node extension/test/smoke/run.mjs
//
// Needs web-ext and Firefox on PATH. Run locally; it is not part of CI.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_DIR = fileURLToPath(new URL("../..", import.meta.url));
const DRIVER = fileURLToPath(new URL("./driver.js", import.meta.url));
const TIMEOUT_MS = 90_000;

/**
 * Starts a local server and resolves with the first report posted to it.
 *
 * @returns {Promise<{ url: string, report: Promise<Record<string, unknown>>, close: () => void }>}
 */
async function startReportServer() {
  /** @type {(value: Record<string, unknown>) => void} */
  let resolveReport = () => {};
  const report = new Promise((resolve) => {
    resolveReport = resolve;
  });
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST");
    response.setHeader("Access-Control-Allow-Headers", "*");
    if (request.method !== "POST") {
      response.writeHead(204).end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.writeHead(200).end();
      resolveReport(JSON.parse(body));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/report`,
    report,
    close: () => server.close(),
  };
}

/**
 * Copies the extension without its tests and wires in the driver.
 *
 * @param {string} reportUrl
 * @returns {Promise<string>} The temporary extension directory.
 */
async function prepareCopy(reportUrl) {
  const dir = await mkdtemp(join(tmpdir(), "containers-smoke-"));
  await cp(EXTENSION_DIR, dir, {
    recursive: true,
    filter: (source) => !source.startsWith(join(EXTENSION_DIR, "test")),
  });
  const driver = await readFile(DRIVER, "utf8");
  await writeFile(
    join(dir, "smoke-driver.js"),
    driver.replace("__REPORT_URL__", reportUrl),
  );
  const manifestPath = join(dir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.background.scripts = [
    "smoke-driver.js",
    ...manifest.background.scripts,
  ];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`no report after ${ms} ms`)),
        ms,
      ).unref();
    }),
  ]);
}

async function main() {
  const server = await startReportServer();
  const dir = await prepareCopy(server.url);
  // A process group of its own, so Firefox is stopped along with web-ext.
  const firefox = spawn(
    "web-ext",
    ["run", "--source-dir", dir, "--no-reload", "--no-input"],
    {
      env: { ...process.env, MOZ_HEADLESS: "1" },
      stdio: "ignore",
      detached: true,
    },
  );

  try {
    const result = await withTimeout(server.report, TIMEOUT_MS);
    console.log(JSON.stringify(result, null, 2));

    assert.equal(result.loaded, true, "the extension did not load");
    assert.deepEqual(
      result.errors,
      [],
      "the background script reported errors",
    );
    assert.deepEqual(result.origins, [], "site access was granted at install");
    for (const [name, value] of Object.entries(result.checks ?? {})) {
      assert.equal(value, true, `check failed: ${name}`);
    }
    console.log("smoke test passed");
  } finally {
    if (firefox.pid) {
      try {
        process.kill(-firefox.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
