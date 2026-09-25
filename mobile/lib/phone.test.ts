/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { phoneKey } from "./phone.ts";

test("phone numbers compare by digits", () => {
  assert.equal(phoneKey("+1 (415) 555-0123"), "4155550123");
  assert.equal(phoneKey("415.555.0123"), "4155550123");
  assert.equal(phoneKey("+44 20 7946 0958"), "2079460958");
  assert.equal(phoneKey("12345"), null);
  assert.equal(phoneKey(null), null);
});
