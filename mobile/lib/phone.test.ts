/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePhone } from "./phone.ts";

test("normalizes phone numbers to E.164", () => {
  assert.equal(normalizePhone("(415) 555-0123"), "+14155550123");
  assert.equal(normalizePhone("1 415 555 0123"), "+14155550123");
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizePhone("555-0123"), null);
  assert.equal(normalizePhone("+1"), null);
  assert.equal(normalizePhone(""), null);
});
