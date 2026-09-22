import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "scan-persistence-failure-test-secret";
process.env.DATABASE_URL = "postgresql://127.0.0.1:1/unavailable?connect_timeout=1";

const { default: app } = await import("../src/app");
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;

test("configured persistent quota outage fails closed with a structured 503", async () => {
  const response = await fetch(`${baseUrl}/scan/access`, { method: "POST" });
  assert.equal(response.status, 503);
  const payload = await response.json() as { error: { code: string; requestId: string; retryable: boolean } };
  assert.equal(payload.error.code, "SCAN_UNAVAILABLE");
  assert.equal(typeof payload.error.requestId, "string");
  assert.equal(payload.error.retryable, true);
});

test.after(() => server.close());