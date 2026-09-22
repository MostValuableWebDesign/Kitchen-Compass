import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { consumeQuota, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "scan-test-session-secret";
process.env.OPENAI_API_KEY = "scan-test-openai-key";

const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const originalFetch = globalThis.fetch;

beforeEach(() => resetScanRateLimiter());
after(() => server.close());

async function issueAccess() {
  const response = await originalFetch(`${baseUrl}/scan/access`, { method: "POST" });
  assert.equal(response.status, 200);
  const payload = await response.json() as { accessToken: string };
  return payload.accessToken;
}

async function request(body: unknown, accessToken?: string, installationId?: string) {
  return originalFetch(`${baseUrl}/scan/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(installationId ? { "x-kitchen-installation": installationId } : {}),
    },
    body: JSON.stringify(body),
  });
}

function validRequest() {
  return {
    photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: "aGVsbG8=" }],
    existingIngredients: [{ name: "eggs", location: "Refrigerator" }],
  };
}

test("scan requires a server-issued credential", async () => {
  const response = await request({ photos: [] });
  assert.equal(response.status, 401);
  const payload = await response.json() as { error: { code: string; message: string; requestId: string } };
  assert.equal(payload.error.code, "UNAUTHORIZED");
  assert.equal(typeof payload.error.requestId, "string");
  assert.equal(payload.error.message.includes("credential"), true);
});

test("changing the installation header alone does not reset the access quota", async () => {
  const accessToken = await issueAccess();
  for (let index = 0; index < 5; index += 1) {
    const response = await request({ photos: [] }, accessToken, `test-installation-${index}-a`);
    assert.equal(response.status, 400);
  }
  const response = await request({ photos: [] }, accessToken, "test-installation-changed");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
});

test("spoofed forwarded IP headers cannot reset access-token quotas", async () => {
  for (let index = 0; index < 3; index += 1) {
    const response = await originalFetch(`${baseUrl}/scan/access`, {
      method: "POST",
      headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
    });
    assert.equal(response.status, 200);
  }
  const response = await originalFetch(`${baseUrl}/scan/access`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.99" },
  });
  assert.equal(response.status, 429);
});

test("persistent quota increments on insert and on conflict when PostgreSQL is available", { skip: !process.env.DATABASE_URL }, async () => {
  const { pool } = await import("@workspace/db");
  const key = `test:${randomUUID()}`;
  const first = await consumeQuota(key, 2, 60_000);
  const second = await consumeQuota(key, 2, 60_000);
  const row = await pool.query("SELECT request_count FROM kitchen_scan_quota WHERE bucket_key = $1", [key]);
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(row.rows[0]?.request_count, 2);
});

test("scan rejects malformed requests with a sanitized structured error", async () => {
  const response = await request({ photos: [] }, await issueAccess());
  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { code: string; details?: unknown } };
  assert.deepEqual(payload.error.code, "INVALID_REQUEST");
  assert.equal("details" in payload.error, false);
});

test("scan rejects oversized JSON bodies before provider work", async () => {
  const response = await request({
    photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: "A".repeat(12 * 1024 * 1024) }],
  }, await issueAccess());
  assert.equal(response.status, 413);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE");
});

test("scan rejects decoded photos above the per-photo limit", async () => {
  const response = await request({
    photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: "A".repeat(7 * 1024 * 1024) }],
  }, await issueAccess());
  assert.equal(response.status, 413);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE");
});

test("provider failures and malformed model output stay unavailable and sanitized", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) return new Response("upstream failure", { status: 502 });
    return original(input, init);
  };
  try {
    const response = await request(validRequest(), await issueAccess());
    assert.equal(response.status, 503);
    const payload = await response.json() as { error: { code: string; message: string } };
    assert.equal(payload.error.code, "SCAN_UNAVAILABLE");
    assert.equal(payload.error.message.includes("upstream"), false);
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"suggestions":[]}' } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return original(input, init);
  };
  try {
    const response = await request(validRequest(), await issueAccess());
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test("successful scans are validated and identify existing inventory matches", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              suggestions: [{
                sourcePhotoId: "photo-1",
                normalizedName: "eggs",
                displayName: "Eggs",
                storageLocation: "Refrigerator",
                quantity: 2,
                unit: "egg",
                confidence: 0.98,
                uncertaintyReasons: [],
              }],
              warnings: [],
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return original(input, init);
  };
  try {
    const response = await request(validRequest(), await issueAccess());
    assert.equal(response.status, 200);
    const payload = await response.json() as { suggestions: Array<{ existingInventoryMatch?: string; quantityKnown: boolean }> };
    assert.equal(payload.suggestions[0]?.existingInventoryMatch, "egg");
    assert.equal(payload.suggestions[0]?.quantityKnown, true);
  } finally {
    globalThis.fetch = original;
  }
});