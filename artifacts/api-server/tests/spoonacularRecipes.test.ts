import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after } from "node:test";
import app from "../src/app";
import { createScanAccessToken } from "../src/middleware/scanSecurity";
import { searchSpoonacularRecipes } from "../src/routes/spoonacularRecipes";
import { MAX_PROVIDER_SEARCH_ANCHORS } from "../src/routes/providerSearchLimits";
import { createRecipeSearchDiagnostics } from "../src/routes/recipeSearchDiagnostics";

process.env.SESSION_SECRET = "spoonacular-recipes-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server has no port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
const originalFetch = globalThis.fetch;
const oldEdamamId = process.env.EDAMAM_APP_ID;
const oldEdamamKey = process.env.EDAMAM_APP_KEY;
delete process.env.EDAMAM_APP_ID;
delete process.env.EDAMAM_APP_KEY;
after(() => {
  server.close();
  if (oldEdamamId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldEdamamId;
  if (oldEdamamKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldEdamamKey;
});

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
    if (target.hostname === "www.themealdb.com") {
      if (target.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: ["Potato", "Cheddar"].includes(target.searchParams.get("i") ?? "") ? [] : [
        { idMeal: "201", strMeal: "Tomato pasta" },
        { idMeal: "202", strMeal: "Chicken pasta" },
      ] }), { status: 200 });
      const id = target.searchParams.get("i");
      return new Response(JSON.stringify({ meals: [{
        idMeal: id, strMeal: id === "201" ? "Tomato pasta" : "Chicken pasta",
        strInstructions: "Cook the pasta.", strIngredient1: "Pasta", strMeasure1: "1 cup",
        strIngredient2: id === "201" ? "Tomato" : "Chicken", strMeasure2: "1 cup",
      }] }), { status: 200 });
    }
    if (target.hostname === "api.spoonacular.com") {
      calls.push(target);
      assert.equal((init?.headers as Record<string, string>)?.["x-api-key"], "test-key");
      if (failSpoonacular) return new Response("unavailable", { status: 503 });
      if (target.pathname.endsWith("/findByIngredients")) {
        if (target.searchParams.get("ingredients") === "Potato,Cheddar") {
          return new Response(JSON.stringify([
            { id: 201, title: "Cheesy baked potatoes", image: "https://img.spoonacular.com/201.jpg", usedIngredientCount: 2 },
            { id: 202, title: "Spicy baked potatoes", image: "https://img.spoonacular.com/202.jpg", usedIngredientCount: 2 },
            { id: 203, title: "Cheesy baked potatoes with cayenne", image: "https://img.spoonacular.com/203.jpg", usedIngredientCount: 1 },
            { id: 204, title: "Peanut baked potatoes", image: "https://img.spoonacular.com/204.jpg", usedIngredientCount: 1 },
            { id: 205, title: "Archived cheesy baked potatoes", image: "https://img.spoonacular.com/205.jpg", usedIngredientCount: 2 },
          ]), { status: 200 });
        }
        assert.equal(target.searchParams.get("ingredients"), "Pasta,Tomato");
        return new Response(JSON.stringify([
          { id: 101, title: "Tomato pasta", image: "https://img.spoonacular.com/101.jpg", usedIngredientCount: 2 },
          { id: 102, title: "Peanut pasta", image: "https://img.spoonacular.com/102.jpg", usedIngredientCount: 1 },
          { id: 103, title: "Archived pasta", image: "https://img.spoonacular.com/103.jpg", usedIngredientCount: 1 },
        ]), { status: 200 });
      }
      assert.equal(target.pathname, "/recipes/informationBulk");
      if (target.searchParams.get("ids") === "201,202,203,204") {
        return new Response(JSON.stringify([
          { id: 201, title: "Cheesy baked potatoes", ingredients: ["Potato", "Cheddar"] },
          { id: 202, title: "Spicy baked potatoes", ingredients: ["Potato", "Cheddar"] },
          { id: 203, title: "Cheesy baked potatoes with cayenne", ingredients: ["Potato", "Cayenne"] },
          { id: 204, title: "Peanut baked potatoes", ingredients: ["Potato", "Peanut butter"] },
        ].map(({ id, title, ingredients }) => ({
          id,
          title,
          image: `https://img.spoonacular.com/${id}.jpg`,
          sourceName: "Example Kitchen",
          sourceUrl: `https://example.com/recipes/${id}`,
          analyzedInstructions: [{ steps: [{ step: "Cook until tender." }] }],
          extendedIngredients: ingredients.map((name) => ({ name, original: `1 cup ${name.toLowerCase()}` })),
        }))), { status: 200 });
      }
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
    const payload = await response.json() as { recipes: Array<{ id: string; provider: string; sourceName: string; sourceUrl: string; imageUrl: string; instructions: string; matchedIngredients: string[] }>; providersUnavailable: string[]; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.deepEqual(payload.recipes.map((item) => item.id), ["spoonacular:101", "202"]);
    assert.equal(payload.recipes[0]?.provider, "Spoonacular");
    assert.equal(payload.recipes[0]?.sourceName, "Example Kitchen");
    assert.equal(payload.recipes[0]?.sourceUrl, "https://example.com/recipes/101");
    assert.equal(payload.recipes[0]?.imageUrl, "https://img.spoonacular.com/101.jpg");
    assert.equal(payload.recipes[0]?.instructions, "Cook the pasta.");
    assert.deepEqual(payload.recipes[0]?.matchedIngredients, ["Pasta", "Tomato"]);
    assert.deepEqual(payload.providersUnavailable, []);
    assert.deepEqual(payload.sourceResults, [
      { provider: "Edamam", status: "not_configured", count: 0 },
      { provider: "Spoonacular", status: "found", count: 1 },
      { provider: "TheMealDB", status: "found", count: 2 },
    ]);
    assert.equal(calls.length, 2);

    const kidsResponse = await originalFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ingredients: ["Potato", "Cheddar"],
        searchAnchors: ["Potato", "Cheddar"],
        allergies: ["peanut"],
        excludedRecipeIds: ["spoonacular:205"],
        audience: "kids",
      }),
    });
    assert.equal(kidsResponse.status, 200);
    const kidsPayload = await kidsResponse.json() as {
      recipes: Array<{ id: string; title: string; provider: string; sourceName: string; sourceUrl: string; safetyVerified: boolean }>;
      safetyNotice: string;
      sourceResults: Array<{ provider: string; status: string; count: number }>;
    };
    assert.deepEqual(kidsPayload.recipes.map((item) => item.id), ["spoonacular:201"]);
    assert.equal(kidsPayload.recipes[0]?.title, "Cheesy baked potatoes");
    assert.equal(kidsPayload.recipes[0]?.provider, "Spoonacular");
    assert.equal(kidsPayload.recipes[0]?.sourceName, "Example Kitchen");
    assert.equal(kidsPayload.recipes[0]?.sourceUrl, "https://example.com/recipes/201");
    assert.equal(kidsPayload.recipes[0]?.safetyVerified, false);
    assert.match(kidsPayload.safetyNotice, /not been independently verified/);
    assert.match(kidsPayload.safetyNotice, /Check the original recipe and every package label/);
    assert.deepEqual(kidsPayload.sourceResults, [
      { provider: "Edamam", status: "not_configured", count: 0 },
      { provider: "Spoonacular", status: "found", count: 1 },
      { provider: "TheMealDB", status: "no_results", count: 0 },
    ]);

    failSpoonacular = true;
    const unavailable = await originalFetch(url, { method: "POST", headers, body: JSON.stringify(request) });
    assert.equal(unavailable.status, 200);
    const fallback = await unavailable.json() as { recipes: Array<{ id: string; provider: string }>; providersUnavailable: string[]; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.deepEqual(fallback.providersUnavailable, ["Spoonacular"]);
    assert.deepEqual(fallback.recipes.map((item) => item.id), ["201", "202"]);
    assert.deepEqual(fallback.sourceResults, [
      { provider: "Edamam", status: "not_configured", count: 0 },
      { provider: "Spoonacular", status: "unavailable", count: 0 },
      { provider: "TheMealDB", status: "found", count: 2 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
    if (oldFatSecretId === undefined) delete process.env.FATSECRET_CLIENT_ID; else process.env.FATSECRET_CLIENT_ID = oldFatSecretId;
    if (oldFatSecretSecret === undefined) delete process.env.FATSECRET_CLIENT_SECRET; else process.env.FATSECRET_CLIENT_SECRET = oldFatSecretSecret;
  }
});

test("Spoonacular returns a pantry recipe to the app when the original link is HTTP and instructions are absent", async () => {
  const oldKey = process.env.SPOONACULAR_API_KEY;
  const originalMealKey = process.env.THEMEALDB_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SPOONACULAR_API_KEY = "test-key";
  delete process.env.THEMEALDB_API_KEY;
  const spoonCalls: URL[] = [];
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    if (target.hostname === "api.spoonacular.com") {
      spoonCalls.push(target);
      if (target.pathname.endsWith("/findByIngredients")) {
        assert.equal(target.searchParams.get("ranking"), "1");
        return new Response(JSON.stringify([{ id: 900, title: "Chicken and tomato dinner", usedIngredientCount: 1 }]), { status: 200 });
      }
      return new Response(JSON.stringify([{ id: 900, title: "Chicken and tomato dinner", sourceName: "Example Kitchen",
        sourceUrl: "http://example.com/chicken", spoonacularSourceUrl: "https://spoonacular.com/chicken-and-tomato-dinner-900",
        analyzedInstructions: [], extendedIngredients: ["Chicken breasts", "Tomato", "Fresh basil leaves", "Potato", "Carrot", "Onion", "Milk", "Cheese", "Mushroom", "Lemon"].map((name) => ({ name })),
      }]), { status: 200 });
    }
    if (target.hostname === "www.themealdb.com") return new Response(JSON.stringify({ meals: [] }), { status: 200 });
    throw new Error(`Unexpected provider: ${target.hostname}`);
  };
  try {
    const response = await previousFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Chicken", "Tomatoes", "Fresh basil leaves"], searchAnchors: ["Chicken"], allergies: [] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ provider: string; sourceUrl: string; missingIngredients: string[] }>; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.equal(payload.recipes[0]?.provider, "Spoonacular");
    assert.equal(payload.recipes[0]?.sourceUrl, "https://spoonacular.com/chicken-and-tomato-dinner-900");
    assert.equal(payload.recipes[0]?.missingIngredients.length, 7);
    assert.deepEqual(payload.sourceResults[1], { provider: "Spoonacular", status: "found", count: 1 });
    assert.equal(spoonCalls.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
    if (originalMealKey === undefined) delete process.env.THEMEALDB_API_KEY; else process.env.THEMEALDB_API_KEY = originalMealKey;
  }
});

test("Spoonacular caps its ingredient query at the shared provider search limit", async () => {
  const oldKey = process.env.SPOONACULAR_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SPOONACULAR_API_KEY = "test-key";
  const anchors = Array.from({ length: MAX_PROVIDER_SEARCH_ANCHORS + 5 }, (_, index) => `Ingredient ${index + 1}`);
  let query = "";
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    query = target.searchParams.get("ingredients") ?? "";
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    await searchSpoonacularRecipes({
      pantry: anchors,
      anchors,
      allergies: [],
      excludedIds: new Set<string>(),
      excludedTitles: new Set<string>(),
      audience: "general",
    });
    assert.equal(query, anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS).join(","));
  } finally {
    globalThis.fetch = previousFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
  }
});

test("Spoonacular counts matches from the full pantry beyond the 30 query anchors", async () => {
  const oldKey = process.env.SPOONACULAR_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SPOONACULAR_API_KEY = "test-key";
  const anchors = Array.from({ length: MAX_PROVIDER_SEARCH_ANCHORS }, (_, index) => `Anchor ${index + 1}`);
  const pantry = [...anchors, ...Array.from({ length: 34 }, (_, index) => `Ingredient ${index + 31}`)];
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith("/findByIngredients")) {
      return new Response(JSON.stringify([{ id: 640, title: "Pantry match", image: "https://example.com/pantry-match.jpg", usedIngredientCount: 0 }]), { status: 200 });
    }
    return new Response(JSON.stringify([{
      id: 640,
      title: "Pantry match",
      image: "https://example.com/pantry-match.jpg",
      sourceUrl: "https://example.com/pantry-match",
      instructions: "Cook the ingredients.",
      extendedIngredients: [{ name: "Anchor 1" }, { name: "Ingredient 64" }],
    }]), { status: 200 });
  };
  try {
    const results = await searchSpoonacularRecipes({
      pantry,
      anchors,
      allergies: [],
      excludedIds: new Set<string>(),
      excludedTitles: new Set<string>(),
      audience: "general",
      maxCandidates: 1,
    });
    assert.deepEqual(results[0]?.matchedIngredients, ["Anchor 1", "Ingredient 64"]);
    assert.deepEqual(results[0]?.missingIngredients, []);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
  }
});

test("Spoonacular diagnostics count provider and recipe qualification rejections", async () => {
  const oldKey = process.env.SPOONACULAR_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SPOONACULAR_API_KEY = "test-key";
  const details = [
    { id: 801, title: "Eligible pasta", ingredients: ["Pasta"] },
    { id: 804, title: "Peanut pasta", ingredients: ["Pasta", "Peanut butter"] },
    { id: 805, title: "Unmatched farro", ingredients: ["Farro"] },
    { id: 806, title: "Too many missing", ingredients: ["Pasta", "Food 1", "Food 2", "Food 3", "Food 4", "Food 5", "Food 6", "Food 7", "Food 8"] },
  ];
  globalThis.fetch = async (input) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith("/findByIngredients")) {
      return new Response(JSON.stringify([
        { id: 801, title: "Eligible pasta", usedIngredientCount: 1 },
        { id: 802, title: "No provider match", usedIngredientCount: 0 },
        { id: 803, title: "Excluded by id", usedIngredientCount: 1 },
        { id: 804, title: "Peanut pasta", usedIngredientCount: 1 },
        { id: 805, title: "Unmatched farro", usedIngredientCount: 1 },
        { id: 806, title: "Too many missing", usedIngredientCount: 1 },
        { id: 807, title: "Excluded by title", usedIngredientCount: 1 },
        { id: 808, title: "Candidate limit", usedIngredientCount: 1 },
      ]), { status: 200 });
    }
    const ids = new Set((target.searchParams.get("ids") ?? "").split(",").map(Number));
    return new Response(JSON.stringify(details.filter((item) => ids.has(item.id)).map((item) => ({
      id: item.id,
      title: item.title,
      image: "https://example.com/recipe.jpg",
      sourceUrl: "https://example.com/recipe",
      instructions: "Cook.",
      extendedIngredients: item.ingredients.map((name) => ({ name })),
    }))), { status: 200 });
  };
  try {
    const diagnostics = createRecipeSearchDiagnostics();
    const results = await searchSpoonacularRecipes({
      pantry: ["Pasta"],
      anchors: ["Pasta"],
      allergies: ["peanut"],
      excludedIds: new Set(["spoonacular:803"]),
      excludedTitles: new Set(["excluded by title"]),
      audience: "general",
      maxCandidates: 4,
    }, diagnostics);

    assert.deepEqual(results.map((item) => item.title), ["Eligible pasta"]);
    assert.deepEqual(diagnostics, {
      candidatesReceived: 8,
      candidatesRemoved: {
        candidateLimit: 1,
        invalid: 0,
        allergy: 1,
        duplicate: 0,
        noPantryMatch: 2,
        tooManyMissing: 1,
        excluded: 2,
        notKidFriendly: 0,
        courseMismatch: 0,
        disliked: 0,
        resultLimit: 0,
      },
      eligible: 1,
    });
    assert.doesNotMatch(JSON.stringify(diagnostics), /Pasta|Peanut|test-key/);
  } finally {
    globalThis.fetch = previousFetch;
    if (oldKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldKey;
  }
});
