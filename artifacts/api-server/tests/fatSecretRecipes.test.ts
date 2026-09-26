import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after } from "node:test";
import app from "../src/app";
import { createScanAccessToken } from "../src/middleware/scanSecurity";
import { fatSecretConfigured } from "../src/routes/fatSecretRecipes";

process.env.SESSION_SECRET = "disabled-fatsecret-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
after(() => server.close());

test("FatSecret credentials do not activate the disabled provider", async () => {
  const oldId = process.env.FATSECRET_CLIENT_ID;
  const oldSecret = process.env.FATSECRET_CLIENT_SECRET;
  const oldEnabled = process.env.FATSECRET_ENABLED;
  const oldSpoonacularKey = process.env.SPOONACULAR_API_KEY;
  process.env.FATSECRET_CLIENT_ID = "test-client";
  process.env.FATSECRET_CLIENT_SECRET = "test-secret";
  process.env.FATSECRET_ENABLED = "false";
  delete process.env.SPOONACULAR_API_KEY;
  assert.equal(fatSecretConfigured(), false);
  process.env.FATSECRET_ENABLED = "true";
  assert.equal(fatSecretConfigured(), true);
  let fatSecretCalls = 0;
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.includes("fatsecret.com")) {
      fatSecretCalls += 1;
      return new Response("unexpected FatSecret request", { status: 500 });
    }
    if (target.includes("themealdb.com")) return new Response(JSON.stringify({ meals: [] }), { status: 200 });
    return originalFetch(input, init);
  };
  try {
    const response = await originalFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Pasta"], allergies: [] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: unknown[]; providersUnavailable: string[] };
    assert.deepEqual(payload.recipes, []);
    assert.deepEqual(payload.providersUnavailable, []);
    assert.equal(fatSecretCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.FATSECRET_CLIENT_ID; else process.env.FATSECRET_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.FATSECRET_CLIENT_SECRET; else process.env.FATSECRET_CLIENT_SECRET = oldSecret;
    if (oldEnabled === undefined) delete process.env.FATSECRET_ENABLED; else process.env.FATSECRET_ENABLED = oldEnabled;
    if (oldSpoonacularKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldSpoonacularKey;
  }
});
