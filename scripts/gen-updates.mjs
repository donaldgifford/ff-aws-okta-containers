#!/usr/bin/env node
// Writes updates.json, the feed an installed copy reads to find a newer
// version (IMPL-0003, "The update feed").
//
//   node scripts/gen-updates.mjs <version> <signed.xpi> <updates.json>
//   node scripts/gen-updates.mjs <version> <package.zip> <updates.json> --allow-unsigned
//
// The feed names one file and pins it by hash, so the script first checks
// that the file is what the feed will say it is: the right add-on, the right
// version, and signed by Mozilla. --allow-unsigned skips only the signature
// check, so CI can exercise everything else without signing credentials.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MANIFEST = fileURLToPath(
  new URL("../extension/manifest.json", import.meta.url),
);
const FEED_SUFFIX = "/releases/latest/download/updates.json";
const PACKAGE_NAME = "ff-aws-okta-containers";

// What Mozilla adds when it signs a package.
const SIGNATURE_FILES = ["META-INF/mozilla.rsa", "META-INF/cose.sig"];

/**
 * @typedef {object} PackageFacts
 * @property {string[]} entries The paths inside the package.
 * @property {{ version?: unknown, browser_specific_settings?: { gecko?: { id?: unknown } } }} manifest
 *   The manifest.json inside the package.
 */

/**
 * @param {string} version
 * @returns {boolean} Whether the version is three plain numbers, as releases are.
 */
export function isVersion(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}

/**
 * The repository address, taken from the manifest's update_url so the feed
 * and the files it names cannot point at different places.
 *
 * @param {unknown} updateUrl
 * @returns {string}
 */
export function repositoryFrom(updateUrl) {
  if (
    typeof updateUrl !== "string" ||
    !updateUrl.startsWith("https://github.com/") ||
    !updateUrl.endsWith(FEED_SUFFIX)
  ) {
    throw new Error(
      `the manifest's update_url must be https://github.com/<owner>/<repo>${FEED_SUFFIX}`,
    );
  }
  return updateUrl.slice(0, -FEED_SUFFIX.length);
}

/**
 * @param {string} version
 * @returns {string} The file name a release carries for this version.
 */
export function packageName(version) {
  return `${PACKAGE_NAME}-${version}.xpi`;
}

/**
 * @param {string} repository
 * @param {string} version
 * @returns {string} Where the release for this version serves its file.
 */
export function updateLink(repository, version) {
  return `${repository}/releases/download/v${version}/${packageName(version)}`;
}

/**
 * @param {PackageFacts} facts
 * @param {{ id: string, version: string, allowUnsigned?: boolean }} expected
 * @returns {string | null} Why the package must not be published, or null.
 */
export function packageProblem(facts, { id, version, allowUnsigned = false }) {
  const actualId = facts.manifest.browser_specific_settings?.gecko?.id;
  if (actualId !== id) {
    return `the package is for add-on ${String(actualId)}, not ${id}`;
  }
  if (facts.manifest.version !== version) {
    return `the package is version ${String(facts.manifest.version)}, not ${version}`;
  }
  if (!allowUnsigned) {
    const missing = SIGNATURE_FILES.filter(
      (file) => !facts.entries.includes(file),
    );
    if (missing.length > 0) {
      return `the package is not signed by Mozilla (no ${missing.join(", ")})`;
    }
  }
  return null;
}

/**
 * @param {object} details
 * @param {string} details.id The add-on ID.
 * @param {string} details.version
 * @param {string} details.repository
 * @param {string} details.sha256 Hex digest of the package.
 * @param {string} details.strictMinVersion The oldest Firefox that may take it.
 * @returns {object} The contents of updates.json.
 */
export function buildUpdates({
  id,
  version,
  repository,
  sha256,
  strictMinVersion,
}) {
  if (!isVersion(version)) {
    throw new Error(`version must look like 1.2.3, got ${version}`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("sha256 must be 64 lowercase hex characters");
  }
  return {
    addons: {
      [id]: {
        updates: [
          {
            version,
            update_link: updateLink(repository, version),
            update_hash: `sha256:${sha256}`,
            applications: {
              gecko: { strict_min_version: strictMinVersion },
            },
          },
        ],
      },
    },
  };
}

/**
 * @param {string} file A zip or xpi.
 * @returns {PackageFacts}
 */
function readPackage(file) {
  const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const manifest = JSON.parse(
    execFileSync("unzip", ["-p", file, "manifest.json"], { encoding: "utf8" }),
  );
  return { entries, manifest };
}

async function main() {
  const args = process.argv.slice(2);
  const allowUnsigned = args.includes("--allow-unsigned");
  const [version, file, out] = args.filter((arg) => !arg.startsWith("--"));
  if (!version || !file || !out) {
    throw new Error(
      "usage: gen-updates.mjs <version> <package> <updates.json> [--allow-unsigned]",
    );
  }

  const { gecko } = JSON.parse(
    await readFile(MANIFEST, "utf8"),
  ).browser_specific_settings;
  const problem = packageProblem(readPackage(file), {
    id: gecko.id,
    version,
    allowUnsigned,
  });
  if (problem) {
    throw new Error(problem);
  }

  const updates = buildUpdates({
    id: gecko.id,
    version,
    repository: repositoryFrom(gecko.update_url),
    sha256: createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
    strictMinVersion: gecko.strict_min_version,
  });
  await writeFile(out, `${JSON.stringify(updates, null, 2)}\n`);
  console.log(`wrote ${out} for ${packageName(version)}`);
}

// Run only when executed directly, so tests can import the helpers above.
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
