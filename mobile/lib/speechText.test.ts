/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { createTranscriptAccumulator } from "./speechText.ts";

test("iOS-style cumulative results", () => {
  const t = createTranscriptAccumulator();
  assert.equal(t.push("I met", false), "I met");
  assert.equal(t.push("I met Jason", false), "I met Jason");
  assert.equal(t.push("I met Jason Chen.", true), "I met Jason Chen.");
});

test("Android-style restarts after pauses keep earlier phrases", () => {
  const t = createTranscriptAccumulator();
  t.push("I met Jason", false);
  assert.equal(t.push("I met Jason Chen", true), "I met Jason Chen");
  assert.equal(t.push("he builds robots", false), "I met Jason Chen he builds robots");
  assert.equal(t.push("he builds robots.", true), "I met Jason Chen he builds robots.");
});
