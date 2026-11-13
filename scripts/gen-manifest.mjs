#!/usr/bin/env node
// Writes the optional_host_permissions list in extension/manifest.json from
// extension/regions.json.
//
//   node scripts/gen-manifest.mjs          rewrite the manifest
//   node scripts/gen-manifest.mjs --check  fail if the manifest is out of date
//
// Match patterns cannot put a wildcard in the middle of a host, so the portal
// API host is listed once per region (DESIGN-0001, "Manifest and permissions").

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MANIFEST = fileURLToPath(
  new URL("../extension/manifest.json", import.meta.url),
);
const REGIONS = fileURLToPath(
  new URL("../extension/regions.json", import.meta.url),
);

// Hosts that may be requested at enrolment. None are granted at install.
const PORTAL_PAGE_PATTERNS = ["https://*.awsapps.com/*", "https://*.app.aws/*"];
const OKTA_PATTERNS = [
  "https://*.okta.com/*",
  "https://*.oktapreview.com/*",
  "https://*.okta-emea.com/*",
];

/**
 * @param {string[]} regions
 * @returns {string[]}
 */
export function optionalHostPermissions(regions) {
  const api = [...regions]
    .sort()
    .map((region) => `https://portal.sso.${region}.amazonaws.com/*`);
  return [...PORTAL_PAGE_PATTERNS, ...api, ...OKTA_PATTERNS];
}

async function main() {
  const check = process.argv.includes("--check");
  const { regions } = JSON.parse(await readFile(REGIONS, "utf8"));
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const wanted = optionalHostPermissions(regions);

  const current = JSON.stringify(manifest.optional_host_permissions ?? []);
  if (current === JSON.stringify(wanted)) {
    console.log("manifest optional_host_permissions are up to date");
    return;
  }
  if (check) {
    console.error(
      "extension/manifest.json is out of date with extension/regions.json.\n" +
        "Run: node scripts/gen-manifest.mjs",
    );
    process.exitCode = 1;
    return;
  }
  manifest.optional_host_permissions = wanted;
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${wanted.length} optional host permissions`);
}

await main();
