import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "external-recipes-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port.");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
beforeEach(() => resetScanRateLimiter());
after(() => server.close());

test("published recipes require confirmed ingredients and an access token", async () => {
  const unauthorized = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ingredients: ["egg"], allergies: [] }) });
  assert.equal(unauthorized.status, 401);
  const invalid = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: [], allergies: [] }) });
  assert.equal(invalid.status, 400);
});

test("published recipes show source attribution and never assert allergy safety", async () => {
  const oldKey = process.env.THEMEALDB_API_KEY;
  process.env.THEMEALDB_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.includes("themealdb.com") && target.includes("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1" }, { idMeal: "2" }] }), { status: 200 });
    if (target.includes("themealdb.com") && target.includes("lookup.php")) {
      const peanut = target.endsWith("=2");
      return new Response(JSON.stringify({ meals: [{
        idMeal: peanut ? "2" : "1", strMeal: peanut ? "Peanut egg bowl" : "Egg and tomato bowl",
        strInstructions: "Cook ingredients until done.", strIngredient1: "Egg", strMeasure1: "2",
        strIngredient2: peanut ? "Peanut butter" : "Tomato", strMeasure2: "1 tbsp",
        strMealThumb: "https://www.themealdb.com/images/test.jpg", strSource: "https://example.com/recipe",
      }] }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Egg", "Tomato"], searchAnchors: ["Egg"], allergies: ["peanut"] }) });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ title: string; provider: string; sourceUrl: string; safetyVerified: boolean; matchedIngredients: string[]; missingIngredients: string[] }> };
    assert.deepEqual(payload.recipes.map((item) => item.title), ["Egg and tomato bowl"]);
    assert.equal(payload.recipes[0]?.provider, "TheMealDB");
    assert.equal(payload.recipes[0]?.sourceUrl, "https://example.com/recipe");
    assert.equal(payload.recipes[0]?.safetyVerified, false);
    assert.deepEqual(payload.recipes[0]?.matchedIngredients, ["Egg", "Tomato"]);
    assert.deepEqual(payload.recipes[0]?.missingIngredients, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("published recipes use at most ten provider search anchors", async () => {
  const oldKey = process.env.THEMEALDB_API_KEY;
  const originalFetchForAnchorTest = globalThis.fetch;
  const filterRequests: string[] = [];
  process.env.THEMEALDB_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.includes("themealdb.com") && target.includes("filter.php")) {
      filterRequests.push(target);
      return new Response(JSON.stringify({ meals: [] }), { status: 200 });
    }
    return originalFetchForAnchorTest(input);
  };
  try {
    const response = await originalFetchForAnchorTest(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({
        ingredients: Array.from({ length: 15 }, (_, index) => `ingredient-${index + 1}`),
        searchAnchors: Array.from({ length: 10 }, (_, index) => `ingredient-${index + 1}`),
        allergies: [],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(filterRequests.length, 10);
  } finally {
    globalThis.fetch = originalFetchForAnchorTest;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});
