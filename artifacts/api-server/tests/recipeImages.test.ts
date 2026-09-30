import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const originalCacheDir = process.env.GENERATED_RECIPE_CACHE_DIR;
let cacheDir: string;
beforeEach(async () => {
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  cacheDir = await mkdtemp(join(tmpdir(), "kitchen-generated-cache-"));
  process.env.GENERATED_RECIPE_CACHE_DIR = cacheDir;
  resetScanRateLimiter();
});
after(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  if (originalCacheDir === undefined) delete process.env.GENERATED_RECIPE_CACHE_DIR; else process.env.GENERATED_RECIPE_CACHE_DIR = originalCacheDir;
});
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

test("generated image files avoid provider calls and verify recipe input identity", async () => {
  const base64 = Buffer.from("cached-jpeg-data").toString("base64");
  let calls = 0;
  const providerFetch = async (target: Parameters<typeof fetch>[0]) => {
    calls++;
    return String(target).includes("api.openai.com") ? new Response(JSON.stringify({ data: [{ b64_json: base64 }] })) : new Response(JSON.stringify({ meals: [] }));
  };
  globalThis.fetch = providerFetch;
  assert.equal((await request({ recipes: [recipe] })).status, 200);
  assert.equal(calls, 2);
  globalThis.fetch = async () => { throw new Error("Cached image must avoid every provider call"); };
  const reused = await request({ recipes: [{ ...recipe, ingredients: [...recipe.ingredients].reverse() }] });
  assert.equal(reused.status, 200);
  assert.equal((await reused.json()).images[0].imageBase64, base64);
  calls = 0; globalThis.fetch = providerFetch;
  await request({ recipes: [{ ...recipe, title: "Different dish", ingredients: ["rice"] }] });
  assert.equal(calls, 2);
});
