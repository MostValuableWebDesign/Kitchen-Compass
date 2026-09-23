import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "recipe-image-test-secret";
process.env.OPENAI_API_KEY = "recipe-image-test-key";
process.env.THEMEALDB_API_KEY = "recipe-image-test-meal-key";

const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Recipe image test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const originalFetch = globalThis.fetch;

beforeEach(() => resetScanRateLimiter());
after(() => { globalThis.fetch = originalFetch; server.close(); });

const recipe = {
  recipeVersion: "version-1",
  title: "Egg and greens bowl",
  description: "Eggs and spinach in a warm bowl.",
  ingredients: ["eggs", "spinach"],
};

async function request(body: unknown, authorized = true) {
  return originalFetch(`${baseUrl}/recipes/images`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { authorization: `Bearer ${createScanAccessToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("recipe images require access and reject malformed recipes", async () => {
  assert.equal((await request({ recipes: [recipe] }, false)).status, 401);
  assert.equal((await request({ recipes: [{ title: recipe.title }] })).status, 400);
});

test("an exact source recipe photo takes priority over image generation", async () => {
  let generated = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("themealdb.com")) return new Response(JSON.stringify({ meals: [
      { strMeal: recipe.title, strMealThumb: "https://www.themealdb.com/wrong.jpg", strIngredient1: "pork", strIngredient2: "rice" },
      { strMeal: recipe.title, strMealThumb: "https://www.themealdb.com/right.jpg", strIngredient1: "egg", strIngredient2: "spinach" },
    ] }), { status: 200 });
    if (String(input).includes("api.openai.com")) generated = true;
    return originalFetch(input, init);
  };
  try {
    const response = await request({ recipes: [recipe] });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).images, [{ recipeVersion: recipe.recipeVersion, imageUrl: "https://www.themealdb.com/right.jpg", source: "TheMealDB" }]);
    assert.equal(generated, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("a recipe without an exact source photo gets a generated image", async () => {
  const base64 = Buffer.from("fake-jpeg-data").toString("base64");
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("themealdb.com")) return new Response(JSON.stringify({ meals: [
      { strMeal: "Different dish", strMealThumb: "https://example.com/wrong.jpg" },
    ] }), { status: 200 });
    if (String(input).includes("api.openai.com")) {
      const body = JSON.parse(String(init?.body)) as { model: string; output_format: string; prompt: string };
      assert.equal(body.model, "gpt-image-2.5-flare");
      assert.equal(body.output_format, "jpeg");
      assert.match(body.prompt, /Egg and greens bowl/);
      return new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await request({ recipes: [recipe] });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).images, [{ recipeVersion: recipe.recipeVersion, imageBase64: base64, source: "AI-generated" }]);
  } finally { globalThis.fetch = originalFetch; }
});
