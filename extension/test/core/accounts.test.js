import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseAccountList } from "../../src/core/accounts.js";

const ACCOUNT_LIST = readFileSync(
  new URL("../fixtures/account-list.json", import.meta.url),
  "utf8",
);

// The portal sends the account list as the response to a POST. Nothing here
// depends on the method: the listener that calls this skips only OPTIONS.
test("account IDs and names are read from the account list", () => {
  assert.deepEqual(parseAccountList(ACCOUNT_LIST), [
    { accountId: "111122223333", name: "payments-prod" },
    { accountId: "444455556666", name: "payments-dev" },
  ]);
});

test("a later entry for the same account replaces the earlier one", () => {
  const body = JSON.stringify({
    result: [
      { searchMetadata: { AccountId: "111122223333", AccountName: "old" } },
      { searchMetadata: { AccountId: "111122223333", AccountName: "new" } },
    ],
  });

  assert.deepEqual(parseAccountList(body), [
    { accountId: "111122223333", name: "new" },
  ]);
});

test("very long names are cut short", () => {
  const body = JSON.stringify({
    result: [
      {
        searchMetadata: {
          AccountId: "111122223333",
          AccountName: "x".repeat(500),
        },
      },
    ],
  });

  assert.equal(parseAccountList(body)[0]?.name.length, 128);
});

for (const [label, body] of [
  ["an empty body", ""],
  ["a body that is not JSON", "<html></html>"],
  ["a body with no result list", '{"items":[]}'],
  ["a result that is not a list", '{"result":{}}'],
  ["a JSON null", "null"],
  ["a list of things that are not objects", '{"result":[1,"a",null,[]]}'],
]) {
  test(`${label} yields no accounts`, () => {
    assert.deepEqual(parseAccountList(body), []);
  });
}
