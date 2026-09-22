import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before, beforeEach } from "node:test";
import app from "../src/app";
import { resetScanRateLimiter } from "../src/middleware/scanSecurity";

const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;

beforeEach(() => resetScanRateLimiter());
after(() => server.close());

async function request(body: unknown, installationId?: string) {
  return fetch(`${baseUrl}/scan/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(installationId ? { "x-kitchen-installation": installationId } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("scan requires an installation-scoped identity", async () => {
  const response = await request({ photos: [] });
  assert.equal(response.status, 401);
  const payload = await response.json() as { error: { code: string; message: string; requestId: string } };
  assert.equal(payload.error.code, "UNAUTHORIZED");
  assert.equal(typeof payload.error.requestId, "string");
  assert.equal(payload.error.message.includes("installation"), true);
});

test("scan rejects malformed requests with a sanitized structured error", async () => {
  const response = await request({ photos: [] }, "test-installation-400");
  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { code: string; details?: unknown } };
  assert.deepEqual(payload.error.code, "INVALID_REQUEST");
  assert.equal("details" in payload.error, false);
});

test("scan rejects oversized JSON bodies before provider work", async () => {
  const response = await request({
    photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: "A".repeat(12 * 1024 * 1024) }],
  }, "test-installation-413");
  assert.equal(response.status, 413);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE");
});

test("scan rejects decoded photos above the per-photo limit", async () => {
  const response = await request({
    photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: "A".repeat(7 * 1024 * 1024) }],
  }, "test-installation-decoded-413");
  assert.equal(response.status, 413);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE");
});

test("scan limits repeated installation requests", async () => {
  const installationId = "test-installation-429";
  for (let index = 0; index < 5; index += 1) {
    const response = await request({ photos: [] }, installationId);
    assert.equal(response.status, 400);
  }
  const response = await request({ photos: [] }, installationId);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  const payload = await response.json() as { error: { code: string; retryable?: boolean } };
  assert.equal(payload.error.code, "RATE_LIMITED");
  assert.equal(payload.error.retryable, true);
});