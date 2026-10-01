import assert from "node:assert/strict";
import test from "node:test";
import { getScanApiErrorMessage } from "../lib/scanApiError";

test("scan API errors expose a concise safe server message", () => {
  const error = Object.assign(new Error("HTTP 400 Bad Request"), {
    data: { error: { code: "INVALID_REQUEST", message: "Choose a valid PDF receipt." } },
  });

  assert.equal(getScanApiErrorMessage(error), "Choose a valid PDF receipt.");
});

test("scan API error messages are trimmed and bounded", () => {
  const error = Object.assign(new Error("HTTP 400 Bad Request"), {
    data: { error: { message: ` ${"x".repeat(300)} ` } },
  });

  assert.equal(getScanApiErrorMessage(error)?.length, 238);
  assert.equal(getScanApiErrorMessage(error)?.endsWith("…"), true);
});

test("scan API errors without a structured message have no extracted detail", () => {
  assert.equal(getScanApiErrorMessage(new Error("HTTP 400 Bad Request")), undefined);
  assert.equal(getScanApiErrorMessage({ data: { error: { message: 123 } } }), undefined);
});