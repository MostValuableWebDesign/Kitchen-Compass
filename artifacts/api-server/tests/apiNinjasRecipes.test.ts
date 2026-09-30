import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";
import { apiNinjasSearchParams, normalizeApiNinjasRecipe, searchApiNinjasRecipes } from "../src/routes/apiNinjasRecipes";
import { combineProviderRecipeResults } from "../src/routes/externalRecipes";
import { createRecipeSearchDiagnostics } from "../src/routes/recipeSearchDiagnostics";

const saved = { key: process.env.API_NINJAS_API_KEY, mode: process.env.API_NINJAS_RECIPE_SEARCH_MODE, spoon: process.env.SPOONACULAR_API_KEY, meal: process.env.THEMEALDB_API_KEY, session: process.env.SESSION_SECRET };
const originalFetch = globalThis.fetch;
const oldRecipeApiComKey = process.env.RECIPE_API_COM_API_KEY;
delete process.env.RECIPE_API_COM_API_KEY;
const oldRecipeApiKey = process.env.RECIPEAPI_API_KEY;
delete process.env.RECIPEAPI_API_KEY;
process.env.SESSION_SECRET = "ninjas-recipe-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("No test port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
beforeEach(() => { resetScanRateLimiter(); process.env.API_NINJAS_API_KEY = "test-secret"; delete process.env.API_NINJAS_RECIPE_SEARCH_MODE; delete process.env.SPOONACULAR_API_KEY; });
after(() => {
  server.close();
  if (oldRecipeApiComKey === undefined) delete process.env.RECIPE_API_COM_API_KEY; else process.env.RECIPE_API_COM_API_KEY = oldRecipeApiComKey;
  if (oldRecipeApiKey === undefined) delete process.env.RECIPEAPI_API_KEY; else process.env.RECIPEAPI_API_KEY = oldRecipeApiKey;
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries({ API_NINJAS_API_KEY: saved.key, API_NINJAS_RECIPE_SEARCH_MODE: saved.mode, SPOONACULAR_API_KEY: saved.spoon, THEMEALDB_API_KEY: saved.meal, SESSION_SECRET: saved.session })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
const raw = (title = "Chicken pasta", names = ["Chicken breast; diced", "Pasta", "Tomatoes; chopped", "Garlic powder"]) => ({
  title, ingredients: names.map((name) => ({ name, quantity: 1, unit: "cup" })), instructions: ["Prepare ingredients.", "Cook until safely done."],
});
const input = { pantry: ["Chicken", "Pasta", "Tomatoes"], anchors: ["Chicken", "Pasta"], allergies: [], excludedIds: new Set<string>(), excludedTitles: new Set<string>(), audience: "general" as const };

test("API Ninjas defaults to one authenticated v3 ingredient-search request", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (target, init) => {
    calls.push(new URL(String(target)));
    assert.equal((init?.headers as Record<string, string>)["X-Api-Key"], "test-secret");
    return new Response(JSON.stringify([raw()]), { status: 200 });
  };
  const recipes = await searchApiNinjasRecipes(input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.pathname, "/v3/recipe");
  assert.equal(calls[0]?.searchParams.get("title"), null);
  assert.equal(calls[0]?.searchParams.get("limit"), "10");
  assert.equal(calls[0]?.searchParams.get("ingredients"), "chicken,pasta");
  assert.equal(String(calls[0]).includes("test-secret"), false);
  assert.equal(recipes[0]?.provider, "API Ninjas");
  assert.equal(recipes[0]?.sourceUrl, "");
  assert.match(recipes[0]?.instructions ?? "", /Prepare ingredients\.\nCook/);
  assert.deepEqual(recipes[0]?.matchedIngredients, ["Chicken breast", "Pasta", "Tomatoes"]);
  assert.deepEqual(recipes[0]?.missingIngredients, []);
});

test("ingredient search caps thirty selected anchors at five even with the legacy title setting", () => {
  process.env.API_NINJAS_RECIPE_SEARCH_MODE = "title";
  const params = apiNinjasSearchParams(["Chicken broth", "Chicken", "Chicken breast", "Rice", "Pasta", "Beef", "Shrimp", "Potatoes", "Tomatoes"]);
  assert.equal(params?.get("ingredients")?.split(",").length, 5);
  assert.equal(params?.get("title"), null);
  assert.equal(params?.get("limit"), "10");
  const thirty = Array.from({ length: 30 }, (_, index) => ["Chicken", "Rice", "Pasta", "Beef", "Shrimp", "Potato"][index % 6]!);
  assert.equal(apiNinjasSearchParams(thirty)?.get("ingredients"), "chicken,rice,pasta,beef,shrimp");
  assert.equal(apiNinjasSearchParams(["Chicken broth", "Mystery packet"]), undefined);
});

test("Ninjas checks full pantry, seven missing ingredients, seasonings, allergies, exclusions, and kids", async () => {
  const names = ["Pasta", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Bell pepper", "Fresh basil leaves", "Italian seasoning"];
  const good = raw("Pasta salad", names);
  globalThis.fetch = async () => new Response(JSON.stringify([good, raw("Pasta with peas", [...names, "Peas"]), raw("Peanut pasta", ["Pasta", "Peanut butter"]), raw("Spicy pasta", ["Pasta", "Cayenne"]), good]), { status: 200 });
  const diagnostics = createRecipeSearchDiagnostics();
  const results = await searchApiNinjasRecipes({ ...input, pantry: ["Pasta"], allergies: ["peanut"], audience: "kids" }, diagnostics);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.missingIngredients.length, 7);
  assert.equal(diagnostics.candidatesRemoved.tooManyMissing, 1);
  assert.equal(diagnostics.candidatesRemoved.allergy, 1);
  assert.equal(diagnostics.candidatesRemoved.notKidFriendly, 1);
  assert.equal(diagnostics.candidatesRemoved.duplicate, 1);
  const excluded = await searchApiNinjasRecipes({ ...input, pantry: ["Pasta"], allergies: ["peanut"], audience: "kids", excludedIds: new Set([results[0]!.id]) });
  assert.equal(excluded.length, 0);
  const fullPantry = normalizeApiNinjasRecipe(raw("Pasta salad", ["Pasta", "Rice"]), ["Chicken", "Rice"], []);
  assert.deepEqual(fullPantry?.matchedIngredients, ["Rice"]);
});

test("malformed Ninjas responses are rejected and absent permalinks do not merge distinct recipes", () => {
  assert.equal(normalizeApiNinjasRecipe({ ...raw(), instructions: "not v3 steps" }, input.pantry, []), null);
  assert.equal(normalizeApiNinjasRecipe({ ...raw(), ingredients: [{ name: "Chicken", quantity: "bad", unit: "cup" }] }, input.pantry, []), null);
  const first = normalizeApiNinjasRecipe(raw(), input.pantry, [])!;
  const second = normalizeApiNinjasRecipe(raw("Chicken rice"), input.pantry, [])!;
  assert.equal(normalizeApiNinjasRecipe(raw(), input.pantry, [])?.id, first.id);
  assert.equal(combineProviderRecipeResults([[first, second, first]], 50).length, 2);
});

async function request(body: Record<string, unknown>) {
  const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ recipes: Array<{ provider: string; instructions: string }>; sourceResults: Array<{ provider: string; status: string; count: number }>; providersUnavailable: string[] }>;
}

test("Ninjas populates General, kids, and complete-meal responses with eligible provider counts", async () => {
  let candidate = raw();
  globalThis.fetch = async (target) => new Response(JSON.stringify(new URL(String(target)).hostname === "api.api-ninjas.com" ? [candidate] : { meals: [] }), { status: 200 });
  for (const body of [
    { audience: "general" }, { audience: "kids" }, { audience: "general", course: "main" }, { audience: "kids", course: "main" },
  ]) {
    const result = await request({ ingredients: input.pantry, searchAnchors: input.anchors, allergies: [], ...body });
    assert.equal(result.recipes[0]?.provider, "API Ninjas");
    assert.match(result.recipes[0]?.instructions ?? "", /Cook/);
    assert.deepEqual(result.sourceResults[1], { provider: "API Ninjas", status: "found", count: 1 });
  }
  candidate = raw("Mashed potatoes", ["Potato", "Milk", "Salt", "Pepper"]);
  for (const audience of ["general", "kids"]) {
    const result = await request({ ingredients: ["Potato"], searchAnchors: ["Potato"], allergies: [], audience, course: "side", mainRecipe: { title: "Roast chicken", ingredientNames: ["Chicken"] } });
    assert.equal(result.recipes[0]?.provider, "API Ninjas");
  }
  candidate = raw("Chicken pasta", ["Chicken", "Pasta"]);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "general" })).recipes.length, 0);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "kids" })).recipes.length, 1);
});

test("quota and malformed Ninjas failures leave other providers available and do not retry", async () => {
  process.env.THEMEALDB_API_KEY = "test-key";
  let calls = 0;
  let malformed = false;
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.hostname === "api.api-ninjas.com") { calls++; return malformed ? new Response('{"error":"bad"}', { status: 200 }) : new Response("quota", { status: 429 }); }
    if (location.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta" }] }));
    return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta", strInstructions: "Cook safely.", strIngredient1: "Chicken", strIngredient2: "Pasta", strIngredient3: "Salt", strIngredient4: "Pepper" }] }));
  };
  for (const mode of [false, true]) {
    malformed = mode;
    const result = await request({ ingredients: input.pantry, allergies: [] });
    assert.equal(result.recipes[0]?.provider, "TheMealDB");
    assert.deepEqual(result.providersUnavailable, ["API Ninjas"]);
    assert.deepEqual(result.sourceResults[1], { provider: "API Ninjas", status: "unavailable", count: 0 });
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
  }
  assert.equal(calls, 2);
  delete process.env.API_NINJAS_API_KEY;
  const result = await request({ ingredients: input.pantry, allergies: [] });
  assert.deepEqual(result.sourceResults[1], { provider: "API Ninjas", status: "not_configured", count: 0 });
  assert.equal(calls, 2);
});
