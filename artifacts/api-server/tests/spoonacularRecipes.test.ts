import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after } from "node:test";
import app from "../src/app";
import { createScanAccessToken } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "spoonacular-recipes-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
after(() => server.close());

test("Spoonacular uses a server key, full recipe details, source credit, and archived exclusions", async () => {
  const oldKey = process.env.SPOONACULAR_API_KEY;
  const oldFatSecretId = process.env.FATSECRET_CLIENT_ID;
  const oldFatSecretSecret = process.env.FATSECRET_CLIENT_SECRET;
  process.env.SPOONACULAR_API_KEY = "test-key";
  delete process.env.FATSECRET_CLIENT_ID;
  delete process.env.FATSECRET_CLIENT_SECRET;
  const calls: URL[] = [];
  let failSpoonacular = false;
  globalThis.fetch = async (input, init) => {
    const target = new URL(String(input));
    if (target.hostname === "www.themealdb.com") return new Response(JSON.stringify({ meals: [] }), { status: 200 });
    if (target.hostname === "api.spoonacular.com") {
      calls.push(target);
      assert.equal((init?.headers as Record<string, string>)?.["x-api-key"], "test-key");
      if (failSpoonacular) return new Response("unavailable", { status: 503 });
      if (target.pathname.endsWith("/findByIngredients")) {
        assert.equal(target.searchParams.get("ingredients"), "Pasta,Tomato");
        return new Response(JSON.stringify([
          { id: 101, title: "Tomato pasta", image: "https://img.spoonacular.com/101.jpg", usedIngredientCount: 2 },
          { id: 102, title: "Peanut pasta", image: "https://img.spoonacular.com/102.jpg", usedIngredientCount: 1 },
          { id: 103, title: "Archived pasta", image: "https://img.spoonacular.com/103.jpg", usedIngredientCount: 1 },
        ]), { status: 200 });
      }
      assert.equal(target.pathname, "/recipes/informationBulk");
      assert.equal(target.searchParams.get("ids"), "101,102");
      return new Response(JSON.stringify([101, 102].map((id) => ({
        id,
        title: id === 101 ? "Tomato pasta" : "Peanut pasta",
        image: `https://img.spoonacular.com/${id}.jpg`,
        sourceName: "Example Kitchen",
        sourceUrl: `https://example.com/recipes/${id}`,
        analyzedInstructions: [{ steps: [{ step: "Cook the pasta." }] }],
        extendedIngredients: [
          { name: "Pasta", original: "1 cup pasta" },
          { name: id === 101 ? "Tomato" : "Peanut butter", original: id === 101 ? "1 tomato" : "1 tbsp peanut butter" },
        ],
      }))), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const headers = { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` };
    const request = { ingredients: ["Pasta", "Tomato"], searchAnchors: ["Pasta", "Tomato"], allergies: ["peanut"], excludedRecipeIds: ["spoonacular:103"] };
    const response = await originalFetch(url, { method: "POST", headers, body: JSON.stringify(request) });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ id: string; provider: string; sourceName: string; sourceUrl: string; imageUrl: string; instructions: string; matchedIngredients: string[] }>; providersUnavailable: string[] };
    assert.deepEqual(payload.recipes.map((item) => item.id), ["spoonacular:101"]);
    assert.equal(payload.recipes[0]?.provider, "Spoonacular");
    assert.equal(payload.recipes[0]?.sourceName, "Example Kitchen");
    assert.equal(payload.recipes[0]?.sourceUrl, "https://example.com/recipes/101");
    assert.equal(payload.recipes[0]?.imageUrl, "https://img.spoonacular.com/101.jpg");
    assert.equal(payload.recipes[0]?.instructions, "Cook the pasta.");
    assert.deepEqual(payload.recipes[0]?.matchedIngredients, ["Pasta", "Tomato"]);
    assert.deepEqual(payload.providersUnavailable, []);
    assert.equal(calls.length, 2);

    failSpoonacular = true;
    const unavailable = await originalFetch(url, { method: "POST", headers, body: JSON.stringify(request) });
    assert.equal(unavailable.status, 200);
    assert.deepEqual((await unavailable.json() as { providersUnavailable: string[] }).providersUnavailable, ["Spoonacular"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
    if (oldFatSecretId === undefined) delete process.env.FATSECRET_CLIENT_ID; else process.env.FATSECRET_CLIENT_ID = oldFatSecretId;
    if (oldFatSecretSecret === undefined) delete process.env.FATSECRET_CLIENT_SECRET; else process.env.FATSECRET_CLIENT_SECRET = oldFatSecretSecret;
  }
});
