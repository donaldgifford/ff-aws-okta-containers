import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { optionalHostPermissions } from "../../scripts/gen-manifest.mjs";

/** @param {string} relative */
async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

test("the manifest grants no site access at install", async () => {
  const manifest = await readJson("../manifest.json");

  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
});

test("optional host permissions match the region list", async () => {
  const manifest = await readJson("../manifest.json");
  const { regions } = await readJson("../regions.json");

  assert.deepEqual(
    manifest.optional_host_permissions,
    optionalHostPermissions(regions),
  );
});

test("each region gets exactly one portal API host", () => {
  const patterns = optionalHostPermissions(["us-west-2", "eu-west-1"]);

  assert.deepEqual(
    patterns.filter((pattern) => pattern.includes("portal.sso.")),
    [
      "https://portal.sso.eu-west-1.amazonaws.com/*",
      "https://portal.sso.us-west-2.amazonaws.com/*",
    ],
  );
});
