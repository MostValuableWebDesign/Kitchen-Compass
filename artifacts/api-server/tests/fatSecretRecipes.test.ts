import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after } from "node:test";
import app from "../src/app";
import { createScanAccessToken } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "fatsecret-recipes-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
after(() => server.close());

test("FatSecret search authenticates on the server, verifies full recipes, and excludes archived IDs", async () => {
  const oldId = process.env.FATSECRET_CLIENT_ID;
  const oldSecret = process.env.FATSECRET_CLIENT_SECRET;
  process.env.FATSECRET_CLIENT_ID = "test-client";
  process.env.FATSECRET_CLIENT_SECRET = "test-secret";
  const calls: string[] = [];
  let failFatSecret = false;
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.includes("themealdb.com")) return new Response(JSON.stringify({ meals: [] }), { status: 200 });
    if (target.includes("oauth.fatsecret.com")) {
      assert.equal((init?.headers as Record<string, string>)?.authorization, `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`);
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    if (target.includes("platform.fatsecret.com")) {
      calls.push(target);
      assert.equal((init?.headers as Record<string, string>)?.authorization, "Bearer test-token");
      if (failFatSecret) return new Response("unavailable", { status: 503 });
      if (target.includes("recipes/search/v3")) return new Response(JSON.stringify({ recipes: { recipe: [
        { recipe_id: "91", recipe_name: "Tomato pasta", recipe_image: "https://m.ftscrt.com/tomato.jpg" },
        { recipe_id: "92", recipe_name: "Peanut pasta" },
      ] } }), { status: 200 });
      const peanut = target.includes("recipe_id=92");
      return new Response(JSON.stringify({ recipe: {
        recipe_id: peanut ? "92" : "91", recipe_name: peanut ? "Peanut pasta" : "Tomato pasta",
        recipe_url: `https://www.fatsecret.com/recipes/${peanut ? "peanut" : "tomato"}/Default.aspx`,
        recipe_images: peanut ? { recipe_image: "https://m.ftscrt.com/peanut.jpg" } : undefined,
        ingredients: { ingredient: [
          { food_name: "Pasta", ingredient_description: "1 cup pasta" },
          { food_name: peanut ? "Peanut butter" : "Tomato", ingredient_description: "1 tomato" },
        ] },
        directions: { direction: [{ direction_number: "1", direction_description: "Cook pasta." }] },
      } }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const headers = { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` };
    const response = await originalFetch(url, { method: "POST", headers, body: JSON.stringify({ ingredients: ["Pasta", "Tomato"], searchAnchors: ["Pasta"], allergies: ["peanut"] }) });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ id: string; provider: string; imageUrl: string; instructions: string; matchedIngredients: string[] }>; providersUnavailable: string[] };
    assert.deepEqual(payload.recipes.map((item) => item.id), ["fatsecret:91"]);
    assert.equal(payload.recipes[0]?.provider, "FatSecret");
    assert.equal(payload.recipes[0]?.imageUrl, "https://m.ftscrt.com/tomato.jpg");
    assert.deepEqual(payload.recipes[0]?.matchedIngredients, ["Pasta", "Tomato"]);
    assert.equal(payload.recipes[0]?.instructions, "Cook pasta.");
    assert.deepEqual(payload.providersUnavailable, []);
    const excluded = await originalFetch(url, { method: "POST", headers, body: JSON.stringify({ ingredients: ["Pasta", "Tomato"], searchAnchors: ["Pasta"], allergies: ["peanut"], excludedRecipeIds: ["fatsecret:91"] }) });
    assert.equal(excluded.status, 200);
    assert.deepEqual((await excluded.json() as { recipes: unknown[] }).recipes, []);
    assert.equal(calls.filter((call) => call.includes("recipe/v2")).length, 3);
    failFatSecret = true;
    const unavailable = await originalFetch(url, { method: "POST", headers, body: JSON.stringify({ ingredients: ["Pasta"], searchAnchors: ["Pasta"], allergies: [] }) });
    assert.equal(unavailable.status, 200);
    assert.deepEqual((await unavailable.json() as { providersUnavailable: string[] }).providersUnavailable, ["FatSecret"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.FATSECRET_CLIENT_ID; else process.env.FATSECRET_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.FATSECRET_CLIENT_SECRET; else process.env.FATSECRET_CLIENT_SECRET = oldSecret;
  }
});
