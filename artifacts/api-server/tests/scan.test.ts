import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { receiptPhoto, textReceiptPdf, scannedReceiptPdf } from "./receiptTestFixtures";
import { consumeQuota, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "scan-test-session-secret";
process.env.OPENAI_API_KEY = "scan-test-openai-key";

const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const originalFetch = globalThis.fetch;

async function clearPersistentTestQuotas() {
  if (!process.env.DATABASE_URL) return;
  const { pool } = await import("@workspace/db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kitchen_scan_quota (
      bucket_key TEXT PRIMARY KEY,
      window_started_at TIMESTAMPTZ NOT NULL,
      request_count INTEGER NOT NULL
    )
  `);
  await pool.query(`
    DELETE FROM kitchen_scan_quota
    WHERE bucket_key LIKE 'issue:%'
       OR bucket_key LIKE 'ip:%'
       OR bucket_key LIKE 'token:%'
       OR bucket_key LIKE 'test:%'
  `);
}

beforeEach(async () => {
  resetScanRateLimiter();
  await clearPersistentTestQuotas();
});
after(() => server.close());

async function issueAccess() {
  const response = await originalFetch(`${baseUrl}/scan/access`, { method: "POST" });
  assert.equal(response.status, 200);
  const payload = await response.json() as { accessToken: string };
  return payload.accessToken;
}

async function request(body: unknown, accessToken?: string, installationId?: string, forwardedFor?: string) {
  return originalFetch(`${baseUrl}/scan/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(installationId ? { "x-kitchen-installation": installationId } : {}),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
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

test("spoofed forwarded IP headers cannot reset scan quotas", async () => {
  const accessToken = await issueAccess();
  for (let index = 0; index < 5; index += 1) {
    const response = await request({ photos: [] }, accessToken, `scan-installation-${index}`, `198.51.100.${index + 1}`);
    assert.equal(response.status, 400);
  }
  const response = await request({ photos: [] }, accessToken, "scan-installation-final", "203.0.113.99");
  assert.equal(response.status, 429);
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
    assert.equal(payload.error.message.includes("not changed"), true);
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

test("supports the maximum ten-photo scan batch", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({ suggestions: [], warnings: [] }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return original(input, init);
  };
  try {
    const response = await request({
      photos: Array.from({ length: 10 }, (_, index) => ({
        id: `photo-${index + 1}`,
        mimeType: "image/jpeg",
        base64: "aGVsbG8=",
      })),
    }, await issueAccess());
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = original;
  }
});

test("rejects scan batches above ten photos", async () => {
  const response = await request({
    photos: Array.from({ length: 11 }, (_, index) => ({
      id: `photo-${index + 1}`,
      mimeType: "image/jpeg",
      base64: "aGVsbG8=",
    })),
  }, await issueAccess());
  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "INVALID_REQUEST");
});

test("multi-photo scans preserve source photos and deduplicate the same ingredient globally", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              suggestions: [
                { sourcePhotoId: "photo-1", normalizedName: "eggs", displayName: "Eggs", storageLocation: "Refrigerator", quantity: 2, unit: "egg", confidence: 0.98, uncertaintyReasons: [] },
                { sourcePhotoId: "photo-2", normalizedName: "eggs", displayName: "Eggs carton", storageLocation: "Refrigerator", quantity: 1, unit: "egg", confidence: 0.96, uncertaintyReasons: [] },
                { sourcePhotoId: "photo-2", normalizedName: "spinach", displayName: "Spinach", storageLocation: "Refrigerator", quantity: null, unit: null, confidence: 0.9, uncertaintyReasons: ["Quantity not visible"] },
              ],
              warnings: [],
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return original(input, init);
  };
  try {
    const response = await request({
      photos: [
        { id: "photo-1", mimeType: "image/jpeg", base64: "aGVsbG8=" },
        { id: "photo-2", mimeType: "image/jpeg", base64: "d29ybGQ=" },
      ],
      existingIngredients: [],
    }, await issueAccess());
    assert.equal(response.status, 200);
    const payload = await response.json() as { suggestions: Array<{ normalizedName: string; sourcePhotoId: string; quantityKnown: boolean }> };
    assert.deepEqual(payload.suggestions.map((suggestion) => [suggestion.normalizedName, suggestion.sourcePhotoId]), [['egg', 'photo-1'], ['spinach', 'photo-2']]);
    assert.equal(payload.suggestions[1]?.quantityKnown, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("receipt mode extracts purchased foods, ignores adjustments, and preserves grocery quantities", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).includes("api.openai.com")) return original(input, init);
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.json_schema.name, "grocery_receipt");
    assert.match(body.messages[0].content[0].text, /Prices, unit prices, totals, and payment amounts are NOT quantities/);
    assert.match(body.messages[0].content[0].text, /untrusted data/);
    const item = (name: string, itemType = "food", quantity: number | null = 2, unit: string | null = "ea") => ({ sourcePhotoId: "photo-1-section-1", normalizedName: name, displayName: name, storageLocation: "Pantry", quantity, unit, confidence: 0.9, uncertaintyReasons: [], itemType });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: [item("Eggs"), item("Chicken", "food", 0.5, "lb"), item("Mystery produce", "food", null, null), item("Soap", "nonfood"), item("Tax", "adjustment"), item("Subtotal", "food"), item("Returned rice", "adjustment"), item("Void beans", "food", 0)], warnings: [] }) } }] }));
  };
  try {
    const body = { ...validRequest(), photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: receiptPhoto().toString("base64") }], scanType: "receipt" };
    const response = await request(body, await issueAccess());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.suggestions.length, 3);
    assert.equal(result.suggestions[0].existingInventoryMatch, "egg");
    assert.equal(result.suggestions[0].quantity, 2);
    assert.equal(result.suggestions[1].quantity, 8);
    assert.equal(result.suggestions[1].unit, "oz");
    assert.equal(result.suggestions[2].quantityKnown, false);
    assert.match(result.scanId, /^receipt-[a-f0-9]{24}$/);
    const repeated = await request(body, await issueAccess());
    assert.equal((await repeated.json()).scanId, result.scanId);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("receipt scan rejects unsupported modes and invalid receipt classifications", async () => {
  assert.equal((await request({ ...validRequest(), scanType: "pdf" }, await issueAccess())).status, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).includes("api.openai.com") ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: [{ sourcePhotoId: "photo-1", normalizedName: "rice", displayName: "Rice", storageLocation: "Pantry", quantity: 1, unit: "ea", confidence: 0.9, uncertaintyReasons: [] }], warnings: [] }) } }] })) : original(input, init);
  try { assert.equal((await request({ ...validRequest(), photos: [{ id: "photo-1", mimeType: "image/jpeg", base64: receiptPhoto().toString("base64") }], scanType: "receipt" }, await issueAccess())).status, 503); }
  finally { globalThis.fetch = original; }
});

test("PDF receipts extract native text before AI and return reviewable purchases with stable identity", async () => {
  const pdf = textReceiptPdf().toString("base64");
  const body = { scanType: "receipt", receiptPdf: { id: "receipt-pdf-1", mimeType: "application/pdf", base64: pdf }, existingIngredients: [{ name: "eggs", location: "Refrigerator" }] };
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).includes("api.openai.com")) return originalFetch(input, init);
    calls++;
    const content = JSON.parse(String(init?.body)).messages[0].content;
    assert.equal(content.some((part: { type: string }) => part.type === "file" || part.type === "image_url"), false);
    assert.match(content[1].text, /Source ID: receipt-pdf-1-page-1-text/);
    assert.match(content[1].text, /\[Line 2\] Chicken breast/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      suggestions: [{ itemType: "food", sourcePhotoId: "receipt-pdf-1-page-1-text", receiptLine: 6, linePosition: null, normalizedName: "eggs", displayName: "Eggs", storageLocation: "Refrigerator", quantity: 12, unit: "ea", confidence: 0.95, uncertaintyReasons: [] }], warnings: [],
    }) } }] }));
  };
  try {
    const first = await request(body, await issueAccess());
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.suggestions[0].sourcePhotoId, "receipt-pdf-1");
    assert.equal(result.suggestions[0].existingInventoryMatch, "egg");
    assert.equal(result.suggestions[0].quantity, 12);
    assert.equal(result.suggestions[0].quantityKnown, true);
    assert.match(result.warnings.join(" "), /1 text page/);
    const second = await request(body, await issueAccess());
    assert.equal((await second.json()).scanId, result.scanId);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid, oversized, mixed and non-receipt PDF submissions are rejected before provider calls", async () => {
  const pdf = { id: "receipt-pdf-1", mimeType: "application/pdf", base64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64") };
  const cases = [
    { body: { scanType: "receipt", receiptPdf: { ...pdf, base64: "aGVsbG8=" } }, status: 400 },
    { body: { scanType: "receipt", receiptPdf: { ...pdf, base64: "invalid!" } }, status: 400 },
    { body: { scanType: "receipt", receiptPdf: { ...pdf, mimeType: "text/plain" } }, status: 400 },
    { body: { receiptPdf: pdf }, status: 400 },
    { body: { ...validRequest(), scanType: "receipt", receiptPdf: pdf }, status: 400 },
    { body: { scanType: "receipt", photos: [] }, status: 400 },
    { body: { scanType: "receipt", receiptPdf: { ...pdf, base64: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5 * 1024 * 1024)]).toString("base64") } }, status: 413 },
  ];
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) throw new Error("Invalid PDF must never reach AI");
    return originalFetch(input, init);
  };
  try {
    for (const entry of cases) {
      resetScanRateLimiter();
      const response = await request(entry.body, await issueAccess());
      assert.equal(response.status, entry.status);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("PDF recognition rejects fabricated source IDs and surfaces unreadable document failures", async () => {
  const body = { scanType: "receipt", receiptPdf: { id: "receipt-pdf-1", mimeType: "application/pdf", base64: textReceiptPdf().toString("base64") } };
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: [{ itemType: "food", sourcePhotoId: "photo-1", normalizedName: "rice", displayName: "Rice", storageLocation: "Pantry", quantity: 1, unit: "ea", confidence: 0.9, uncertaintyReasons: [] }], warnings: [] }) } }] }));
  try {
    assert.equal((await request(body, await issueAccess())).status, 503);
    globalThis.fetch = async () => new Response("Unreadable/encrypted PDF", { status: 400 });
    assert.equal((await request(body, await issueAccess())).status, 503);
  } finally { globalThis.fetch = originalFetch; }
});

test("scanned tall PDF sections are analyzed in bounded batches, merged without overlap stock inflation, and normalized", async () => {
  const body = { scanType: "receipt", receiptPdf: { id: "receipt-pdf-1", mimeType: "application/pdf", base64: scannedReceiptPdf().toString('base64') } };
  let calls = 0, active = 0, peak = 0;
  const seen = new Set<number>();
  globalThis.fetch = async (input, init) => {
    if (!String(input).includes('api.openai.com')) return originalFetch(input, init);
    calls++; active++; peak = Math.max(peak, active);
    const content = JSON.parse(String(init?.body)).messages[0].content;
    const images = content.filter((part: { type: string }) => part.type === 'image_url');
    assert.ok(images.length > 0 && images.length <= 3);
    for (const image of images) {
      assert.match(image.image_url.url, /^data:image\/png;base64,/);
      assert.equal(image.image_url.detail, 'high');
      assert.equal(Buffer.from(image.image_url.url.split(',')[1], 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    const suggestions = content.flatMap((part: { type: string; text?: string }) => {
      const match = /Source ID: (receipt-pdf-1-page-1-section-(\d+))/.exec(part.text ?? '');
      if (!match) return [];
      const section = Number(match[2]); seen.add(section);
      if (section > 3) return [];
      return [{ itemType: 'food', sourcePhotoId: match[1], receiptLine: null, linePosition: section === 1 ? 0.95 : section === 2 ? 0.05 : 0.5,
        normalizedName: 'retailer chicken', displayName: 'Heritage Farm® Boneless Skinless Chicken Breasts, 1 lb', storageLocation: 'Refrigerator',
        quantity: section === 3 ? 2 : 1, unit: 'ea', confidence: 0.95, uncertaintyReasons: [] }];
    });
    await new Promise((resolve) => setTimeout(resolve, 5)); active--;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions, warnings: [] }) } }] }));
  };
  try {
    const response = await request(body, await issueAccess());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(seen.size > 3);
    assert.equal(calls, Math.ceil(seen.size / 3));
    assert.ok(peak <= 3);
    assert.deepEqual([...seen].sort((a,b) => a-b), Array.from({length:seen.size}, (_, i) => i + 1));
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].displayName, 'Chicken breast');
    assert.equal(result.suggestions[0].quantity, 3);
    assert.equal(result.suggestions[0].sourcePhotoId, 'receipt-pdf-1');
  } finally { globalThis.fetch = originalFetch; }
});
