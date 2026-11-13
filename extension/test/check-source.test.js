import assert from "node:assert/strict";
import { test } from "node:test";

import { stripComments, violations } from "../../scripts/check-source.mjs";

test("clean source has no violations", () => {
  const source = 'const name = "fetch";\nconsole.info(name);\n';

  assert.deepEqual(violations("core/naming.js", source), []);
});

for (const [label, source] of [
  ["a network call", "await fetch(url);"],
  ["an XHR", "new XMLHttpRequest();"],
  ["a socket", "new WebSocket(url);"],
  ["a beacon", "navigator.sendBeacon(url);"],
  ["dynamic code", "eval(text);"],
  ["a function constructor", "new Function(text);"],
  ["the cookies API", "await browser.cookies.getAll({});"],
]) {
  test(`${label} is reported`, () => {
    assert.equal(violations("background/index.js", source).length, 1);
  });
}

test("only the registry may create containers", () => {
  const source = "await browser.contextualIdentities.create(details);";

  assert.equal(violations("background/index.js", source).length, 1);
  assert.deepEqual(violations("background/registry.js", source), []);
});

test("the pure core may not touch a browser API", () => {
  const source = "await browser.tabs.get(tabId);";

  assert.equal(violations("core/routing.js", source).length, 1);
  assert.deepEqual(violations("background/index.js", source), []);
});

test("comments are ignored but URLs in strings survive", () => {
  const source = [
    "// never call fetch(url) here",
    "/* eval(x) is forbidden */",
    'const page = "https://example.com/path";',
  ].join("\n");

  assert.deepEqual(violations("core/naming.js", source), []);
  assert.match(stripComments(source), /https:\/\/example\.com\/path/);
});
