import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { kidFriendlyScore } from "../src/routes/kidFriendly";
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

test("familiar meal formats are ranked as kid ideas without claiming every child likes them", () => {
  assert.equal(kidFriendlyScore("Tomato pasta", ["tomato", "pasta"]), 1);
  assert.equal(kidFriendlyScore("Spicy chicken tenders", ["chicken", "cayenne"]), 0);
  assert.equal(kidFriendlyScore("Egg and tomato bowl", ["egg", "tomato"]), 0);
});

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
    const nextResponse = await originalFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Egg", "Peanut butter"], searchAnchors: ["Egg"], excludeRecipeIds: ["1"], allergies: [] }),
    });
    assert.equal(nextResponse.status, 200);
    const nextPayload = await nextResponse.json() as { recipes: Array<{ id: string }> };
    assert.deepEqual(nextPayload.recipes.map((item) => item.id), ["2"]);

    const excluded = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Egg", "Tomato"], searchAnchors: ["Egg"], allergies: ["peanut"], excludedRecipeIds: ["1"], excludedRecipeTitles: ["Egg and tomato bowl"] }) });
    assert.equal(excluded.status, 200);
    assert.deepEqual((await excluded.json() as { recipes: unknown[] }).recipes, []);

    const kids = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Egg"], allergies: ["peanut"], audience: "kids" }) });
    assert.equal(kids.status, 200);
    assert.deepEqual((await kids.json() as { recipes: unknown[] }).recipes, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("kid published search keeps familiar mild pantry matches", async () => {
  const oldKey = process.env.THEMEALDB_API_KEY;
  process.env.THEMEALDB_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.includes("themealdb.com") && target.includes("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Tomato pasta" }, { idMeal: "2", strMeal: "Spicy pasta" }] }), { status: 200 });
    if (target.includes("themealdb.com") && target.includes("lookup.php")) {
      const spicy = target.endsWith("=2");
      return new Response(JSON.stringify({ meals: [{
        idMeal: spicy ? "2" : "1", strMeal: spicy ? "Spicy pasta" : "Tomato pasta",
        strInstructions: "Cook thoroughly.", strIngredient1: "Pasta", strMeasure1: "1 cup",
        strIngredient2: spicy ? "Cayenne" : "Tomato", strMeasure2: "1 tsp",
      }] }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Pasta"], allergies: [], audience: "kids" }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { recipes: Array<{ title: string }> }).recipes.map((recipe) => recipe.title), ["Tomato pasta"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("published recipes use up to thirty provider search anchors", async () => {
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
        ingredients: Array.from({ length: 30 }, (_, index) => `ingredient-${index + 1}`),
        searchAnchors: Array.from({ length: 30 }, (_, index) => `ingredient-${index + 1}`),
        allergies: [],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(filterRequests.length, 30);
  } finally {
    globalThis.fetch = originalFetchForAnchorTest;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("published recipes ignore missing herbs and spices, reject more than five other missing ingredients, and sort by matches", async () => {
  const oldKey = process.env.THEMEALDB_API_KEY;
  const originalFetchForFilteringTest = globalThis.fetch;
  process.env.THEMEALDB_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.includes("themealdb.com") && target.includes("filter.php")) {
      return new Response(JSON.stringify({ meals: [{ idMeal: "few-matches" }, { idMeal: "many-matches" }, { idMeal: "too-many-missing" }] }), { status: 200 });
    }
    if (target.includes("themealdb.com") && target.includes("lookup.php")) {
      const id = new URL(target).searchParams.get("i");
      const ingredientNames = id === "many-matches"
        ? ["Chicken", "Rice", "Tomato", "Basil", "Paprika", "Carrot", "Onion", "Garlic", "Lemon", "Celery"]
        : id === "few-matches"
          ? ["Chicken", "Potato", "Carrot", "Onion", "Garlic", "Lemon"]
          : ["Chicken", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery"];
      const meal = {
        idMeal: id ?? "",
        strMeal: id ?? "",
        strInstructions: "Cook until done.",
        ...Object.fromEntries(ingredientNames.map((name, index) => [`strIngredient${index + 1}`, name])),
      };
      return new Response(JSON.stringify({ meals: [meal] }), { status: 200 });
    }
    return originalFetchForFilteringTest(input);
  };
  try {
    const response = await originalFetchForFilteringTest(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Chicken", "Rice", "Tomato"], searchAnchors: ["Chicken"], allergies: [] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ id: string; matchedIngredients: string[]; missingIngredients: string[] }> };
    assert.deepEqual(payload.recipes.map((recipe) => recipe.id), ["many-matches", "few-matches"]);
    assert.deepEqual(payload.recipes[0]?.missingIngredients, ["Carrot", "Onion", "Garlic", "Lemon", "Celery"]);
    assert.equal(payload.recipes[0]?.missingIngredients.includes("Basil"), false);
    assert.equal(payload.recipes[0]?.missingIngredients.includes("Paprika"), false);
  } finally {
    globalThis.fetch = originalFetchForFilteringTest;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});
