import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { kidFriendlyScore } from "../src/routes/kidFriendly";
import { combineProviderRecipeResults, externalRecipeRequestSchema, hasEnoughAdditionalIngredients, type ExternalRecipe } from "../src/routes/externalRecipes";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "external-recipes-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port.");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
const oldNinjasKey = process.env.API_NINJAS_API_KEY;
delete process.env.API_NINJAS_API_KEY;
const oldSpoonacularKey = process.env.SPOONACULAR_API_KEY;
delete process.env.SPOONACULAR_API_KEY;

test("published recipe request accepts 64 matching ingredients but keeps search anchors capped at 30", () => {
  const ingredients = Array.from({ length: 64 }, (_, index) => `ingredient-${index + 1}`);
  const anchors = ingredients.slice(0, 30);
  assert.equal(externalRecipeRequestSchema.safeParse({ ingredients, searchAnchors: anchors, allergies: [] }).success, true);
  assert.equal(externalRecipeRequestSchema.safeParse({ ingredients: [...ingredients, "ingredient-65"], searchAnchors: anchors, allergies: [] }).success, false);
  assert.equal(externalRecipeRequestSchema.safeParse({ ingredients, searchAnchors: [...anchors, "ingredient-31"], allergies: [] }).success, false);
});

test("general recipes require three distinct ingredients besides one matching anchor", () => {
  const recipe = (names: string[]): ExternalRecipe => ({
    id: "one", title: "Chicken dinner", provider: "Spoonacular", sourceUrl: "https://example.com/one",
    ingredients: names.map((name) => ({ name, measure: "1" })), instructions: "",
    matchedIngredients: ["Chicken"], missingIngredients: [], safetyVerified: false,
  });
  assert.equal(hasEnoughAdditionalIngredients(recipe(["Chicken breast", "Rice", "Salt"]), ["Chicken"]), false);
  assert.equal(hasEnoughAdditionalIngredients(recipe(["Chicken breast", "Rice", "Salt", "Tomato"]), ["Chicken"]), true);
  assert.equal(hasEnoughAdditionalIngredients(recipe(["Chicken breast", "Rice", "Rice", "Salt"]), ["Chicken"]), false);
  assert.equal(hasEnoughAdditionalIngredients(recipe(["Chicken", "Rice", "Salt", "Tomato"]), ["Beef", "Chicken", "Rice"]), true);
});

test("combined provider recipes choose the best ingredient fits before the 50-recipe cap", () => {
  const makeRecipe = (provider: "Spoonacular" | "TheMealDB", index: number, matchedCount: number) => ({
    id: `${provider}-${index}`,
    title: `${provider} recipe ${index}`,
    provider,
    sourceUrl: `https://example.com/${provider}/${index}`,
    ingredients: [{ name: "Pasta", measure: "1 cup" }],
    instructions: "Cook the pasta.",
    matchedIngredients: Array.from({ length: matchedCount }, (_, item) => `${provider} ingredient ${item + 1}`),
    missingIngredients: [],
    safetyVerified: false as const,
  });
  const matchedCounts = { Spoonacular: 4, TheMealDB: 1 } as const;
  const groups = (["Spoonacular", "TheMealDB"] as const)
    .map((provider) => Array.from({ length: 55 }, (_, index) => makeRecipe(provider, index, matchedCounts[provider])));
  const recipes = combineProviderRecipeResults(groups, 55);
  assert.equal(recipes.length, 50);
  assert.deepEqual(recipes.map((recipe) => recipe.matchedIngredients.length), Array.from({ length: 50 }, () => 4));
  assert.deepEqual(
    Object.fromEntries((["Spoonacular", "TheMealDB"] as const)
      .map((provider) => [provider, recipes.filter((recipe) => recipe.provider === provider).length])),
    { Spoonacular: 50, TheMealDB: 0 },
  );
});

test("one missing ingredient outranks five even with fewer pantry matches", () => {
  const recipe = (id: string, matched: number, missing: number): ExternalRecipe => ({
    id, title: id, provider: "Spoonacular", sourceUrl: `https://example.com/${id}`, instructions: "",
    ingredients: [{ name: "Chicken", measure: "1" }],
    matchedIngredients: Array.from({ length: matched }, (_, index) => `Have ${index}`),
    missingIngredients: Array.from({ length: missing }, (_, index) => `Need ${index}`), safetyVerified: false,
  });
  const manyMissing = Array.from({ length: 30 }, (_, index) => recipe(`five-${index}`, 5, 5));
  const oneMissing = recipe("one-missing", 1, 1);
  const noneMissing = recipe("none-missing", 1, 0);
  const combined = combineProviderRecipeResults([manyMissing, [oneMissing], [noneMissing]], 30);
  assert.deepEqual(combined.slice(0, 2).map((item) => item.id), ["none-missing", "one-missing"]);
  assert.equal(combined.length, 30);
  assert.equal(combined.some((item) => item.id === "five-29"), false);
});

test("12 Spoonacular and 21 MealDB recipes return 33 when links differ despite shared titles", () => {
  const recipe = (provider: "Spoonacular" | "TheMealDB", index: number): ExternalRecipe => ({
    id: `${provider}-${index}`, title: `Chicken pasta ${index % 3}`, provider,
    sourceUrl: `https://example.com/${provider}/${index}`, instructions: "",
    ingredients: [{ name: "Chicken", measure: "1" }],
    matchedIngredients: ["Chicken"], missingIngredients: [], safetyVerified: false,
  });
  const spoonacular = Array.from({ length: 12 }, (_, index) => recipe("Spoonacular", index));
  const mealDb = Array.from({ length: 21 }, (_, index) => recipe("TheMealDB", index));
  const removed: string[] = [];
  const recipes = combineProviderRecipeResults([spoonacular, mealDb], 50, (_group, reason) => removed.push(reason));
  assert.equal(recipes.length, 33);
  assert.deepEqual(removed, []);
  const sameLink = { ...recipe("TheMealDB", 21), sourceUrl: spoonacular[0]!.sourceUrl };
  assert.equal(combineProviderRecipeResults([spoonacular, [...mealDb, sameLink]], 50).length, 33);
});
beforeEach(() => resetScanRateLimiter());
after(() => {
  server.close();
  if (oldNinjasKey === undefined) delete process.env.API_NINJAS_API_KEY; else process.env.API_NINJAS_API_KEY = oldNinjasKey;
  if (oldSpoonacularKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldSpoonacularKey;
});

test("familiar meal formats are ranked as kid ideas without claiming every child likes them", () => {
  assert.equal(kidFriendlyScore("Tomato pasta", ["tomato", "pasta"]), 1);
  assert.equal(kidFriendlyScore("Cheesy baked potatoes", ["potato", "cheddar"]), 1);
  assert.equal(kidFriendlyScore("Chicken pot pie", ["chicken", "potato"]), 1);
  assert.equal(kidFriendlyScore("Spicy chicken tenders", ["chicken", "cayenne"]), 0);
  assert.equal(kidFriendlyScore("Cheesy baked potatoes", ["potato", "chili powder"]), 0);
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
  const oldFatSecretId = process.env.FATSECRET_CLIENT_ID;
  const oldFatSecretSecret = process.env.FATSECRET_CLIENT_SECRET;
  const oldSpoonacularKey = process.env.SPOONACULAR_API_KEY;
  process.env.THEMEALDB_API_KEY = "test-key";
  delete process.env.FATSECRET_CLIENT_ID;
  delete process.env.FATSECRET_CLIENT_SECRET;
  delete process.env.SPOONACULAR_API_KEY;
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.includes("themealdb.com") && target.includes("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1" }, { idMeal: "2" }] }), { status: 200 });
    if (target.includes("themealdb.com") && target.includes("lookup.php")) {
      const peanut = target.endsWith("=2");
      return new Response(JSON.stringify({ meals: [{
        idMeal: peanut ? "2" : "1", strMeal: peanut ? "Peanut egg bowl" : "Egg and tomato bowl",
        strInstructions: "Cook ingredients until done.", strIngredient1: "Egg", strMeasure1: "2",
        strIngredient2: peanut ? "Peanut butter" : "Tomato", strMeasure2: "1 tbsp",
        strIngredient3: "Salt", strIngredient4: "Pepper",
        strMealThumb: "https://www.themealdb.com/images/test.jpg", strSource: "https://example.com/recipe",
      }] }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Egg", "Tomato"], searchAnchors: ["Egg"], allergies: ["peanut"] }) });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ title: string; provider: string; sourceUrl: string; safetyVerified: boolean; matchedIngredients: string[]; missingIngredients: string[] }>; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.deepEqual(payload.recipes.map((item) => item.title), ["Egg and tomato bowl"]);
    assert.deepEqual(payload.sourceResults, [
      { provider: "Spoonacular", status: "not_configured", count: 0 },
      { provider: "API Ninjas", status: "not_configured", count: 0 },
      { provider: "TheMealDB", status: "found", count: 1 },
    ]);
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
    if (oldFatSecretId === undefined) delete process.env.FATSECRET_CLIENT_ID;
    else process.env.FATSECRET_CLIENT_ID = oldFatSecretId;
    if (oldFatSecretSecret === undefined) delete process.env.FATSECRET_CLIENT_SECRET;
    else process.env.FATSECRET_CLIENT_SECRET = oldFatSecretSecret;
    if (oldSpoonacularKey === undefined) delete process.env.SPOONACULAR_API_KEY;
    else process.env.SPOONACULAR_API_KEY = oldSpoonacularKey;
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
    const general = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Pasta"], searchAnchors: ["Pasta"], allergies: [], audience: "general" }) });
    assert.equal(general.status, 200);
    assert.deepEqual((await general.json() as { recipes: unknown[] }).recipes, []);
    const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Pasta"], allergies: [], audience: "kids" }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { recipes: Array<{ title: string }> }).recipes.map((recipe) => recipe.title), ["Tomato pasta"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("general complete-meal sides use the minimum while kid sides do not", async () => {
  const oldKey = process.env.THEMEALDB_API_KEY;
  process.env.THEMEALDB_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: [
      { idMeal: "short", strMeal: "Simple rice side" },
      { idMeal: "long", strMeal: "Corn rice side" },
    ] }), { status: 200 });
    const short = target.searchParams.get("i") === "short";
    return new Response(JSON.stringify({ meals: [{
      idMeal: short ? "short" : "long", strMeal: short ? "Simple rice side" : "Corn rice side",
      strInstructions: "Cook thoroughly.", strIngredient1: "Rice", strIngredient2: "Tomato",
      strIngredient3: "Salt", ...(short ? {} : { strIngredient4: "Corn" }),
    }] }), { status: 200 });
  };
  try {
    const base = { ingredients: ["Rice", "Tomato"], searchAnchors: ["Rice"], allergies: [], course: "side", mainRecipe: { title: "Roast chicken", ingredientNames: ["Chicken"] } };
    const headers = { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` };
    const general = await originalFetch(url, { method: "POST", headers, body: JSON.stringify({ ...base, audience: "general" }) });
    assert.equal(general.status, 200);
    assert.deepEqual((await general.json() as { recipes: Array<{ id: string }> }).recipes.map((recipe) => recipe.id), ["long"]);
    const kids = await originalFetch(url, { method: "POST", headers, body: JSON.stringify({ ...base, audience: "kids" }) });
    assert.equal(kids.status, 200);
    assert.deepEqual((await kids.json() as { recipes: Array<{ id: string }> }).recipes.map((recipe) => recipe.id), ["short", "long"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY; else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("published recipes match against 64 pantry ingredients while searching at most 30 anchors", async () => {
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
        ingredients: Array.from({ length: 64 }, (_, index) => `ingredient-${index + 1}`),
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

test("published recipes ignore missing herbs and spices, accept seven missing ingredients, and reject eight", async () => {
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
        ? ["Chicken", "Rice", "Tomato", "Basil", "Paprika", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Potato", "Bell pepper"]
        : id === "few-matches"
          ? ["Chicken", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Mushroom"]
          : ["Chicken", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Mushroom", "Broccoli"];
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
    assert.deepEqual(payload.recipes[1]?.missingIngredients, ["Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Mushroom"]);
    assert.equal(payload.recipes[0]?.missingIngredients.includes("Basil"), false);
    assert.equal(payload.recipes[0]?.missingIngredients.includes("Paprika"), false);
  } finally {
    globalThis.fetch = originalFetchForFilteringTest;
    if (oldKey === undefined) delete process.env.THEMEALDB_API_KEY;
    else process.env.THEMEALDB_API_KEY = oldKey;
  }
});

test("provider counts precede the combined 50-recipe cap for general and kids", async () => {
  const oldMealKey = process.env.THEMEALDB_API_KEY;
  const oldSpoonKey = process.env.SPOONACULAR_API_KEY;
  process.env.THEMEALDB_API_KEY = "test-key";
  process.env.SPOONACULAR_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith("findByIngredients")) return new Response(JSON.stringify([{ id: 1, title: "Spoonacular pasta", usedIngredientCount: 1 }]), { status: 200 });
    if (target.pathname.endsWith("informationBulk")) return new Response(JSON.stringify([{ id: 1, title: "Spoonacular pasta", sourceUrl: "https://example.com/spoon-pasta", extendedIngredients: ["Pasta", "Salt", "Pepper", "Water"].map((name) => ({ name })) }]), { status: 200 });
    if (target.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: Array.from({ length: 50 }, (_, index) => ({ idMeal: String(index + 1), strMeal: `MealDB pasta ${index}` })) }), { status: 200 });
    const id = target.searchParams.get("i");
    return new Response(JSON.stringify({ meals: [{ idMeal: id, strMeal: `MealDB pasta ${id}`, strSource: `https://example.com/meal-${id}`, strInstructions: "Cook.", strIngredient1: "Pasta", strIngredient2: "Salt", strIngredient3: "Pepper", strIngredient4: "Water" }] }), { status: 200 });
  };
  try {
    for (const audience of ["general", "kids"]) {
      const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify({ ingredients: ["Pasta"], searchAnchors: ["Pasta"], allergies: [], audience }) });
      assert.equal(response.status, 200);
      const payload = await response.json() as { recipes: Array<{ provider: string }>; sourceResults: Array<{ provider: string; count: number }>; resultCounts: { eligible: number; duplicates: number; capped: number; returned: number; limit: number } };
      assert.equal(payload.recipes.length, 50);
      assert.equal(payload.recipes[0]?.provider, "Spoonacular");
      assert.equal(payload.recipes[1]?.provider, "TheMealDB");
      assert.deepEqual(payload.sourceResults.map((source) => [source.provider, source.count]), [["Spoonacular", 1], ["API Ninjas", 0], ["TheMealDB", 50]]);
      assert.deepEqual(payload.resultCounts, { eligible: 51, duplicates: 0, capped: 1, returned: 50, limit: 50 });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldMealKey === undefined) delete process.env.THEMEALDB_API_KEY; else process.env.THEMEALDB_API_KEY = oldMealKey;
    if (oldSpoonKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldSpoonKey;
  }
});
