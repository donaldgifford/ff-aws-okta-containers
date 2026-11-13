#!/usr/bin/env node
// Enforces the security properties from DESIGN-0001 on the extension source.
//
//   node scripts/check-source.mjs
//
// The extension makes no network requests of its own, never touches the
// cookies API, runs no dynamic code, lets only the container registry
// create, rename or remove containers, and keeps browser APIs out of the pure
// core. This script fails if the source says otherwise.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIR = fileURLToPath(new URL("../extension/src", import.meta.url));

/**
 * @typedef {object} Rule
 * @property {string} name What is forbidden, for the error message.
 * @property {RegExp} pattern Matched against source with comments removed.
 * @property {string[]} [allowedIn] Files, relative to extension/src, exempt
 *   from this rule.
 * @property {string} [onlyIn] A directory prefix, relative to extension/src;
 *   the rule applies only to files under it.
 */

/** @type {Rule[]} */
export const RULES = [
  { name: "fetch()", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", pattern: /\bWebSocket\b/ },
  { name: "sendBeacon", pattern: /\bsendBeacon\b/ },
  { name: "EventSource", pattern: /\bEventSource\b/ },
  { name: "eval()", pattern: /\beval\s*\(/ },
  { name: "new Function", pattern: /\bnew\s+Function\b/ },
  { name: "the cookies API", pattern: /\bbrowser\s*\.\s*cookies\b/ },
  {
    name: "contextualIdentities.create/update/remove outside the registry",
    pattern: /\bcontextualIdentities\s*\.\s*(create|update|remove)\b/,
    allowedIn: ["background/registry.js"],
  },
  {
    name: "a browser API in the pure core",
    pattern: /\bbrowser\s*\./,
    onlyIn: "core/",
  },
];

/**
 * Removes block and line comments so prose cannot trip a rule.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/**
 * @param {string} file Path relative to extension/src, with forward slashes.
 * @param {string} source
 * @returns {string[]} One message per violated rule.
 */
export function violations(file, source) {
  const code = stripComments(source);
  return RULES.filter(
    (rule) =>
      !rule.allowedIn?.includes(file) &&
      (rule.onlyIn === undefined || file.startsWith(rule.onlyIn)) &&
      rule.pattern.test(code),
  ).map((rule) => `${file}: uses ${rule.name}`);
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(js|html)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function main() {
  const files = await sourceFiles(SOURCE_DIR);
  const found = [];
  for (const path of files) {
    const file = relative(SOURCE_DIR, path).split("\\").join("/");
    found.push(...violations(file, await readFile(path, "utf8")));
  }
  if (found.length > 0) {
    console.error(found.join("\n"));
    console.error(`\n${found.length} source check violation(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`source checks passed for ${files.length} file(s)`);
}

if (import.meta.main) {
  await main();
}
