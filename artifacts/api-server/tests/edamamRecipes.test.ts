import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import app from "../src/app";
import { createScanAccessToken } from "../src/middleware/scanSecurity";
import { searchEdamamRecipes } from "../src/routes/edamamRecipes";
import { suitableMealCourse, type ExternalRecipe } from "../src/routes/externalRecipes";
import { MAX_PROVIDER_SEARCH_ANCHORS } from "../src/routes/providerSearchLimits";

test("complete meal course checks distinguish mains from mild complementary sides", () => {
  const recipe = (title: string, ingredients: string[]): ExternalRecipe => ({
    id: title, title, provider: "Edamam", sourceUrl: "https://example.com/recipe", instructions: "",
    ingredients: ingredients.map((name) => ({ name, measure: "1 cup" })),
    matchedIngredients: ingredients, missingIngredients: [], safetyVerified: false,
  });
  const main = { title: "Roast chicken", ingredientNames: ["Chicken", "Garlic"] };
  assert.equal(suitableMealCourse(recipe("Chicken pasta", ["Chicken", "Pasta"]), "main", "kids"), true);
  assert.equal(suitableMealCourse(recipe("Mashed potatoes", ["Potatoes", "Milk"]), "side", "kids", main), true);
  assert.equal(suitableMealCourse(recipe("Mashed potatoes", ["Potatoes", "Milk"]), "side", "kids", main, ["Broccoli"]), false);
  assert.equal(suitableMealCourse(recipe("Spicy mashed potatoes", ["Potatoes"]), "side", "kids", main), false);
  assert.equal(suitableMealCourse(recipe("Chicken salad", ["Chicken", "Lettuce"]), "side", "general", main), false);
});

test("Edamam uses server credentials and returns safe, online-only recipes for general and kids searches", async () => {
  const oldId = process.env.EDAMAM_APP_ID;
  const oldKey = process.env.EDAMAM_APP_KEY;
  const originalFetch = globalThis.fetch;
  process.env.EDAMAM_APP_ID = "test-id";
  process.env.EDAMAM_APP_KEY = "test-key";
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return new Response(JSON.stringify({ hits: [
      { recipe: { uri: "http://www.edamam.com/ontologies/edamam.owl#recipe_1", label: "Tomato pasta", image: "https://example.com/pasta.jpg", source: "Example Kitchen", url: "https://example.com/tomato-pasta", ingredients: [{ food: "Pasta", text: "1 cup pasta" }, { food: "Tomato", text: "1 tomato" }] } },
      { recipe: { uri: "http://www.edamam.com/ontologies/edamam.owl#recipe_2", label: "Peanut pasta", image: "https://example.com/peanut.jpg", url: "https://example.com/peanut-pasta", ingredients: [{ food: "Pasta", text: "1 cup pasta" }, { food: "Peanut butter", text: "1 tbsp peanut butter" }] } },
      { recipe: { uri: "http://www.edamam.com/ontologies/edamam.owl#recipe_3", label: "Spicy pasta", image: "https://example.com/spicy.jpg", url: "https://example.com/spicy-pasta", ingredients: [{ food: "Pasta", text: "1 cup pasta" }, { food: "Cayenne", text: "1 tsp cayenne" }] } },
    ] }), { status: 200 });
  };
  try {
    const input = { pantry: ["Pasta", "Tomato"], anchors: ["Pasta", "Tomato"], allergies: ["peanut"], excludedIds: new Set<string>(), excludedTitles: new Set<string>(), audience: "general" as const };
    const general = await searchEdamamRecipes(input);
    assert.deepEqual(general.map((recipe) => recipe.title), ["Tomato pasta", "Spicy pasta"]);
    assert.equal(general[0]?.provider, "Edamam");
    assert.equal(general[0]?.sourceName, "Example Kitchen");
    assert.equal(general[0]?.sourceUrl, "https://example.com/tomato-pasta");
    assert.equal(general[0]?.instructions, "");
    assert.deepEqual(general[0]?.matchedIngredients, ["Pasta", "Tomato"]);
    assert.equal(general[0]?.safetyVerified, false);
    assert.match(general[0]?.id ?? "", /^edamam:[a-f0-9]{64}$/);
    const kids = await searchEdamamRecipes({ ...input, audience: "kids", excludedIds: new Set([general[0]!.id]) });
    assert.deepEqual(kids, []);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.pathname, "/api/recipes/v2");
    assert.equal(requests[0]?.searchParams.get("type"), "public");
    assert.equal(requests[0]?.searchParams.get("q"), "Pasta Tomato");
    assert.equal(requests[0]?.searchParams.get("app_id"), "test-id");
    assert.equal(requests[0]?.searchParams.get("app_key"), "test-key");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldId;
    if (oldKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldKey;
  }
});

test("Edamam caps its ingredient query at the shared provider search limit", async () => {
  const oldId = process.env.EDAMAM_APP_ID;
  const oldKey = process.env.EDAMAM_APP_KEY;
  const originalFetch = globalThis.fetch;
  process.env.EDAMAM_APP_ID = "test-id";
  process.env.EDAMAM_APP_KEY = "test-key";
  const anchors = Array.from({ length: MAX_PROVIDER_SEARCH_ANCHORS + 5 }, (_, index) => `Ingredient ${index + 1}`);
  let query = "";
  globalThis.fetch = async (input) => {
    query = new URL(String(input)).searchParams.get("q") ?? "";
    return new Response(JSON.stringify({ hits: [] }), { status: 200 });
  };
  try {
    await searchEdamamRecipes({
      pantry: anchors,
      anchors,
      allergies: [],
      excludedIds: new Set<string>(),
      excludedTitles: new Set<string>(),
      audience: "general",
    });
    assert.equal(query, anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS).join(" "));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldId;
    if (oldKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldKey;
  }
});

test("Edamam counts matches from the full pantry beyond the 30 query anchors", async () => {
  const oldId = process.env.EDAMAM_APP_ID;
  const oldKey = process.env.EDAMAM_APP_KEY;
  const originalFetch = globalThis.fetch;
  process.env.EDAMAM_APP_ID = "test-id";
  process.env.EDAMAM_APP_KEY = "test-key";
  const anchors = Array.from({ length: MAX_PROVIDER_SEARCH_ANCHORS }, (_, index) => `Anchor ${index + 1}`);
  const pantry = [...anchors, ...Array.from({ length: 34 }, (_, index) => `Ingredient ${index + 31}`)];
  globalThis.fetch = async () => new Response(JSON.stringify({ hits: [{
    recipe: {
      uri: "edamam-pantry-match",
      label: "Pantry match",
      image: "https://example.com/pantry-match.jpg",
      url: "https://example.com/pantry-match",
      ingredients: [{ food: "Anchor 1" }, { food: "Ingredient 64" }],
    },
  }] }), { status: 200 });
  try {
    const results = await searchEdamamRecipes({
      pantry,
      anchors,
      allergies: [],
      excludedIds: new Set<string>(),
      excludedTitles: new Set<string>(),
      audience: "general",
    });
    assert.deepEqual(results[0]?.matchedIngredients, ["Anchor 1", "Ingredient 64"]);
    assert.deepEqual(results[0]?.missingIngredients, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldId;
    if (oldKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldKey;
  }
});

test("published search combines every provider in priority order and reports each eligible count", async () => {
  const originalFetch = globalThis.fetch;
  const oldId = process.env.EDAMAM_APP_ID;
  const oldKey = process.env.EDAMAM_APP_KEY;
  const oldSpoonacularKey = process.env.SPOONACULAR_API_KEY;
  const oldSessionSecret = process.env.SESSION_SECRET;
  process.env.EDAMAM_APP_ID = "test-id";
  process.env.EDAMAM_APP_KEY = "test-key";
  process.env.SPOONACULAR_API_KEY = "test-spoonacular-key";
  process.env.SESSION_SECRET = "edamam-priority-test-session";
  const server = app.listen(0);
  const calledProviders: string[] = [];
  let edamamHasResults = true;
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    globalThis.fetch = async (input) => {
      const target = new URL(String(input));
      calledProviders.push(target.hostname);
      if (target.hostname === "api.edamam.com") return new Response(JSON.stringify({ hits: edamamHasResults ? [
        { recipe: { uri: "edamam-1", label: "Shared pasta", image: "https://example.com/shared.jpg", url: "https://example.com/shared", ingredients: [{ food: "Pasta", text: "1 cup pasta" }] } },
        { recipe: { uri: "edamam-2", label: "Edamam pasta", image: "https://example.com/edamam.jpg", url: "https://example.com/edamam", ingredients: [{ food: "Pasta", text: "1 cup pasta" }] } },
      ] : [] }), { status: 200 });
      if (target.hostname === "api.spoonacular.com") {
        if (target.pathname.endsWith("findByIngredients")) return new Response(JSON.stringify([
          { id: 101, title: "Shared pasta", image: "https://example.com/shared.jpg", usedIngredientCount: 1 },
          { id: 102, title: "Spoonacular pasta", image: "https://example.com/spoonacular.jpg", usedIngredientCount: 1 },
        ]), { status: 200 });
        return new Response(JSON.stringify([101, 102].map((id) => ({
          id, title: id === 101 ? "Shared pasta" : "Spoonacular pasta",
          image: `https://example.com/${id}.jpg`, sourceUrl: `https://example.com/${id}`,
          analyzedInstructions: [{ steps: [{ step: "Cook pasta." }] }],
          extendedIngredients: [{ name: "Pasta", original: "1 cup pasta" }],
        }))), { status: 200 });
      }
      if (target.hostname === "www.themealdb.com") {
        if (target.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "201", strMeal: "TheMealDB pasta" }] }), { status: 200 });
        return new Response(JSON.stringify({ meals: [{ idMeal: "201", strMeal: "TheMealDB pasta", strInstructions: "Cook pasta.", strIngredient1: "Pasta", strMeasure1: "1 cup" }] }), { status: 200 });
      }
      throw new Error(`Unexpected provider ${target.hostname}`);
    };
    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/recipes/external`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Pasta"], searchAnchors: ["Pasta"], allergies: [] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ title: string; provider: string }>; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.deepEqual(payload.recipes.map((recipe) => [recipe.provider, recipe.title]), [
      ["Edamam", "Shared pasta"], ["TheMealDB", "TheMealDB pasta"],
      ["Edamam", "Edamam pasta"], ["Spoonacular", "Spoonacular pasta"],
    ]);
    assert.deepEqual(payload.sourceResults.map((source) => [source.provider, source.status, source.count]), [
      ["Edamam", "found", 2], ["Spoonacular", "found", 2], ["TheMealDB", "found", 1],
    ]);
    assert.deepEqual(new Set(calledProviders), new Set(["api.edamam.com", "api.spoonacular.com", "www.themealdb.com"]));
    assert.equal(calledProviders.filter((provider) => provider === "api.spoonacular.com").length, 2);
    edamamHasResults = false;
    calledProviders.length = 0;
    const fallbackResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/recipes/external`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Pasta"], searchAnchors: ["Pasta"], allergies: [] }),
    });
    const fallback = await fallbackResponse.json() as { recipes: Array<{ provider: string }>; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.equal(fallbackResponse.status, 200);
    assert.deepEqual(fallback.recipes.map((recipe) => recipe.provider), ["Spoonacular", "TheMealDB", "Spoonacular"]);
    assert.deepEqual(fallback.sourceResults.map((source) => [source.provider, source.status]), [
      ["Edamam", "no_results"], ["Spoonacular", "found"], ["TheMealDB", "found"],
    ]);
    assert.deepEqual(new Set(calledProviders), new Set(["api.edamam.com", "api.spoonacular.com", "www.themealdb.com"]));
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
    if (oldId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldId;
    if (oldKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldKey;
    if (oldSpoonacularKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldSpoonacularKey;
    if (oldSessionSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSessionSecret;
  }
});

test("kid side search accepts a mild published side and rejects a main dish", async () => {
  const originalFetch = globalThis.fetch;
  const oldId = process.env.EDAMAM_APP_ID;
  const oldKey = process.env.EDAMAM_APP_KEY;
  const oldSpoonacularKey = process.env.SPOONACULAR_API_KEY;
  const oldSessionSecret = process.env.SESSION_SECRET;
  process.env.EDAMAM_APP_ID = "test-id";
  process.env.EDAMAM_APP_KEY = "test-key";
  delete process.env.SPOONACULAR_API_KEY;
  process.env.SESSION_SECRET = "meal-side-test-session";
  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    globalThis.fetch = async (input) => {
      const target = new URL(String(input));
      if (target.hostname === "api.edamam.com") return new Response(JSON.stringify({ hits: [
        { recipe: { uri: "side-1", label: "Mashed potatoes", image: "https://example.com/potatoes.jpg", url: "https://example.com/potatoes", ingredients: [{ food: "Potatoes", text: "2 potatoes" }, { food: "Milk", text: "1 cup milk" }] } },
        { recipe: { uri: "main-1", label: "Chicken pasta", image: "https://example.com/pasta.jpg", url: "https://example.com/pasta", ingredients: [{ food: "Potatoes", text: "2 potatoes" }, { food: "Chicken", text: "1 chicken" }] } },
      ] }), { status: 200 });
      if (target.hostname === "www.themealdb.com") return new Response(JSON.stringify({ meals: [] }), { status: 200 });
      throw new Error(`Unexpected provider ${target.hostname}`);
    };
    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/recipes/external`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Potatoes", "Milk"], searchAnchors: ["Potatoes"], allergies: [], audience: "kids", course: "side", mainRecipe: { title: "Roast chicken", ingredientNames: ["Chicken", "Garlic"] } }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipes: Array<{ title: string }>; sourceResults: Array<{ provider: string; status: string; count: number }> };
    assert.deepEqual(payload.recipes.map((recipe) => recipe.title), ["Mashed potatoes"]);
    assert.deepEqual(payload.sourceResults[0], { provider: "Edamam", status: "found", count: 1 });
    const noMain = await originalFetch(`http://127.0.0.1:${address.port}/api/recipes/external`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` },
      body: JSON.stringify({ ingredients: ["Potatoes"], searchAnchors: ["Potatoes"], allergies: [], audience: "kids", course: "side" }),
    });
    assert.equal(noMain.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
    if (oldId === undefined) delete process.env.EDAMAM_APP_ID; else process.env.EDAMAM_APP_ID = oldId;
    if (oldKey === undefined) delete process.env.EDAMAM_APP_KEY; else process.env.EDAMAM_APP_KEY = oldKey;
    if (oldSpoonacularKey === undefined) delete process.env.SPOONACULAR_API_KEY; else process.env.SPOONACULAR_API_KEY = oldSpoonacularKey;
    if (oldSessionSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSessionSecret;
  }
});
