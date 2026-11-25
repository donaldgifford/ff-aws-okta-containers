import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildUpdates,
  isVersion,
  packageName,
  packageProblem,
  repositoryFrom,
  updateLink,
} from "../../scripts/gen-updates.mjs";

const ID = "ff-aws-okta-containers@donaldgifford";
const REPOSITORY = "https://github.com/donaldgifford/ff-aws-okta-containers";
const SHA256 = "a".repeat(64);
const SIGNED = [
  "manifest.json",
  "META-INF/cose.manifest",
  "META-INF/cose.sig",
  "META-INF/manifest.mf",
  "META-INF/mozilla.rsa",
  "META-INF/mozilla.sf",
];

/**
 * @param {string} version
 * @param {string} [id]
 */
function manifest(version, id = ID) {
  return { version, browser_specific_settings: { gecko: { id } } };
}

test("a version is three plain numbers", () => {
  for (const version of ["0.1.0", "1.2.3", "10.20.30"]) {
    assert.equal(isVersion(version), true, version);
  }
  for (const version of [
    "1.2",
    "v1.2.3",
    "1.2.3-beta",
    "01.2.3",
    "",
    "1.2.x",
  ]) {
    assert.equal(isVersion(version), false, version);
  }
});

test("the repository comes from the manifest's update address", () => {
  assert.equal(
    repositoryFrom(`${REPOSITORY}/releases/latest/download/updates.json`),
    REPOSITORY,
  );
});

test("an update address of any other shape is refused", () => {
  for (const address of [
    undefined,
    "",
    `${REPOSITORY}/releases/download/v1.0.0/updates.json`,
    "http://github.com/owner/repo/releases/latest/download/updates.json",
    "https://example.com/owner/repo/releases/latest/download/updates.json",
  ]) {
    assert.throws(() => repositoryFrom(address), /update_url must be/);
  }
});

test("the link names the file on that version's release", () => {
  assert.equal(packageName("0.2.0"), "ff-aws-okta-containers-0.2.0.xpi");
  assert.equal(
    updateLink(REPOSITORY, "0.2.0"),
    `${REPOSITORY}/releases/download/v0.2.0/ff-aws-okta-containers-0.2.0.xpi`,
  );
});

test("the feed has one entry, pinned by hash", () => {
  const updates = buildUpdates({
    id: ID,
    version: "0.2.0",
    repository: REPOSITORY,
    sha256: SHA256,
    strictMinVersion: "140.0",
  });

  assert.deepEqual(updates, {
    addons: {
      [ID]: {
        updates: [
          {
            version: "0.2.0",
            update_link: `${REPOSITORY}/releases/download/v0.2.0/ff-aws-okta-containers-0.2.0.xpi`,
            update_hash: `sha256:${SHA256}`,
            applications: { gecko: { strict_min_version: "140.0" } },
          },
        ],
      },
    },
  });
});

test("the feed is not built for a bad version or a bad hash", () => {
  const details = {
    id: ID,
    version: "0.2.0",
    repository: REPOSITORY,
    sha256: SHA256,
    strictMinVersion: "140.0",
  };

  assert.throws(
    () => buildUpdates({ ...details, version: "0.2" }),
    /must look like 1\.2\.3/,
  );
  assert.throws(
    () => buildUpdates({ ...details, sha256: "ABC" }),
    /64 lowercase hex/,
  );
  assert.throws(
    () => buildUpdates({ ...details, sha256: SHA256.toUpperCase() }),
    /64 lowercase hex/,
  );
});

test("a signed package of the right add-on and version is accepted", () => {
  const facts = { entries: SIGNED, manifest: manifest("0.2.0") };

  assert.equal(packageProblem(facts, { id: ID, version: "0.2.0" }), null);
});

test("a package for another add-on is refused", () => {
  const facts = {
    entries: SIGNED,
    manifest: manifest("0.2.0", "other@example"),
  };

  assert.match(
    String(packageProblem(facts, { id: ID, version: "0.2.0" })),
    /for add-on other@example/,
  );
});

test("a package with no add-on ID is refused", () => {
  const facts = { entries: SIGNED, manifest: { version: "0.2.0" } };

  assert.match(
    String(packageProblem(facts, { id: ID, version: "0.2.0" })),
    /for add-on undefined/,
  );
});

test("a package at another version is refused", () => {
  const facts = { entries: SIGNED, manifest: manifest("0.1.0") };

  assert.match(
    String(packageProblem(facts, { id: ID, version: "0.2.0" })),
    /is version 0\.1\.0, not 0\.2\.0/,
  );
});

test("an unsigned package is refused", () => {
  const facts = { entries: ["manifest.json"], manifest: manifest("0.2.0") };

  assert.match(
    String(packageProblem(facts, { id: ID, version: "0.2.0" })),
    /not signed by Mozilla/,
  );
});

test("a package missing one of the signature files is refused", () => {
  const entries = SIGNED.filter((entry) => entry !== "META-INF/cose.sig");
  const facts = { entries, manifest: manifest("0.2.0") };

  assert.match(
    String(packageProblem(facts, { id: ID, version: "0.2.0" })),
    /no META-INF\/cose\.sig/,
  );
});

test("allowing unsigned skips only the signature check", () => {
  const unsigned = { entries: ["manifest.json"], manifest: manifest("0.2.0") };
  const wrongVersion = {
    entries: ["manifest.json"],
    manifest: manifest("0.1.0"),
  };
  const expected = { id: ID, version: "0.2.0", allowUnsigned: true };

  assert.equal(packageProblem(unsigned, expected), null);
  assert.match(String(packageProblem(wrongVersion, expected)), /is version/);
});
