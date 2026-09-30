import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";
import { normalizeRecipeApiRecipe, recipeApiSearchParams, searchRecipeApiRecipes } from "../src/routes/recipeApiRecipes";
import { createRecipeSearchDiagnostics } from "../src/routes/recipeSearchDiagnostics";

const envNames = ["RECIPEAPI_API_KEY", "RECIPEAPI_PER_PAGE", "API_NINJAS_API_KEY", "SPOONACULAR_API_KEY", "THEMEALDB_API_KEY", "SESSION_SECRET"];
const saved = new Map(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
process.env.SESSION_SECRET = "recipe-api-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("No test port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
beforeEach(() => {
  resetScanRateLimiter(); process.env.RECIPEAPI_API_KEY = "test-recipe-key";
  delete process.env.RECIPEAPI_PER_PAGE; delete process.env.API_NINJAS_API_KEY; delete process.env.SPOONACULAR_API_KEY;
});
after(() => { server.close(); globalThis.fetch = originalFetch; for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
const raw = (id = 449, name = "Chicken pasta", names = ["Chicken breast", "Pasta", "Tomato", "Garlic powder"]) => ({
  id, name, ingredients: names.map((name) => ({ id: 1, name, category: "vegetable", quantity: 1, unit: "cup", optional: false })),
  instructions: ["Prepare ingredients.", "Cook safely."], meal_type: "main",
});
const input = { pantry: ["Chicken", "Pasta", "Tomato"], anchors: ["Chicken", "Pasta"], allergies: [], excludedIds: new Set<string>(), excludedTitles: new Set<string>(), audience: "general" as const };

test("RecipeAPI.io sends one bearer-authenticated ingredient request and never follows pagination", async () => {
  let calls = 0;
  globalThis.fetch = async (target, init) => {
    calls++;
    const location = new URL(String(target));
    assert.equal(location.hostname, "recipeapi.io"); assert.equal(location.pathname, "/api/v1/recipes");
    assert.equal(location.searchParams.get("ingredients"), "chicken,pasta");
    assert.equal(location.searchParams.get("per_page"), "10"); assert.equal(location.searchParams.get("page"), "1");
    assert.equal(location.searchParams.has("sort"), false);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-recipe-key");
    assert.equal(location.toString().includes("test-recipe-key"), false);
    return new Response(JSON.stringify({ data: [raw()], links: { next: "https://recipeapi.io/api/v1/recipes?page=2" } }));
  };
  const results = await searchRecipeApiRecipes(input);
  assert.equal(calls, 1); assert.equal(results[0]?.id, "recipeapi:449"); assert.equal(results[0]?.provider, "RecipeAPI.io");
  assert.equal(results[0]?.sourceUrl, ""); assert.equal(results[0]?.instructions, "Prepare ingredients.\nCook safely.");
  assert.equal(results[0]?.ingredients[0]?.measure, "1 cup Chicken breast");
  assert.deepEqual(results[0]?.matchedIngredients, ["Chicken breast", "Pasta", "Tomato"]);
});

test("Recipe API caps anchors and page size and sends documented main/side filters", () => {
  const anchors = Array.from({ length: 40 }, (_, index) => `item ${index}`);
  assert.equal(recipeApiSearchParams(anchors)?.get("ingredients")?.split(",").length, 30);
  assert.equal(recipeApiSearchParams(["Sea salt", "Italian seasoning"]), undefined);
  assert.equal(recipeApiSearchParams(input.anchors, "side")?.get("meal_type"), "side_dish");
  assert.equal(recipeApiSearchParams(input.anchors, "main")?.get("meal_type"), "main");
  process.env.RECIPEAPI_PER_PAGE = "25";
  assert.equal(recipeApiSearchParams(input.anchors)?.get("per_page"), "25");
  process.env.RECIPEAPI_PER_PAGE = "100";
  assert.equal(recipeApiSearchParams(input.anchors)?.get("per_page"), "50");
  process.env.RECIPEAPI_PER_PAGE = "bad";
  assert.equal(recipeApiSearchParams(input.anchors)?.get("per_page"), "10");
});

test("Recipe API validates structure and filters allergies, missing ingredients, duplicate IDs, and kids", async () => {
  assert.equal(normalizeRecipeApiRecipe({ ...raw(), id: -1 }, input.pantry, []), null);
  assert.equal(normalizeRecipeApiRecipe({ ...raw(), instructions: "bad format" }, input.pantry, []), null);
  assert.equal(normalizeRecipeApiRecipe({ ...raw(), ingredients: [null] }, input.pantry, []), null);
  const names = ["Pasta", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Bell pepper", "Ground cumin", "Italian seasoning"];
  const good = raw(1, "Pasta salad", names);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [good, raw(2, "Pasta salad", [...names, "Peas"]), raw(3, "Peanut pasta", ["Pasta", "Peanut butter"]), raw(4, "Spicy pasta", ["Pasta", "Cayenne"]), good] }));
  const diagnostics = createRecipeSearchDiagnostics();
  const result = await searchRecipeApiRecipes({ ...input, pantry: ["Pasta"], allergies: ["peanut"], audience: "kids" }, diagnostics);
  assert.equal(result.length, 1); assert.equal(result[0]?.missingIngredients.length, 7);
  for (const reason of ["tooManyMissing", "allergy", "notKidFriendly", "duplicate"] as const) assert.equal(diagnostics.candidatesRemoved[reason], 1, reason);
  assert.equal((await searchRecipeApiRecipes({ ...input, pantry: ["Pasta"], allergies: ["peanut"], audience: "kids", excludedIds: new Set(["recipeapi:1"]) })).length, 0);
  const fullPantry = normalizeRecipeApiRecipe(raw(2, "Pasta salad", ["Pasta", "Rice"]), ["Chicken", "Rice"], []);
  assert.deepEqual(fullPantry?.matchedIngredients, ["Rice"]);
});
async function request(body: Record<string, unknown>) {
  const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ recipes: Array<{ id: string; provider: string; instructions: string }>; sourceResults: Array<{ provider: string; status: string; count: number }>; providersUnavailable: string[] }>;
}
test("Recipe API populates General, kids, and main/side responses with counts and existing eligibility", async () => {
  let candidate = raw(); let apiCalls = 0;
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.hostname === "recipeapi.io") { apiCalls++; return new Response(JSON.stringify({ data: [candidate] })); }
    return new Response(JSON.stringify({ meals: [] }));
  };
  for (const body of [{ audience: "general" }, { audience: "kids" }, { audience: "general", course: "main" }, { audience: "kids", course: "main" }]) {
    const result = await request({ ingredients: input.pantry, searchAnchors: input.anchors, allergies: [], ...body });
    assert.equal(result.recipes[0]?.provider, "RecipeAPI.io"); assert.match(result.recipes[0]?.instructions ?? "", /Cook safely/);
    assert.deepEqual(result.sourceResults[2], { provider: "RecipeAPI.io", status: "found", count: 1 });
  }
  candidate = raw(2, "Mashed potatoes", ["Potato", "Milk", "Salt", "Pepper"]);
  for (const audience of ["general", "kids"]) assert.equal((await request({ ingredients: ["Potato"], searchAnchors: ["Potato"], allergies: [], audience, course: "side", mainRecipe: { title: "Roast chicken", ingredientNames: ["Chicken"] } })).recipes[0]?.provider, "RecipeAPI.io");
  candidate = raw(3, "Chicken pasta", ["Chicken", "Pasta"]);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "general" })).recipes.length, 0);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "kids" })).recipes.length, 1);
  assert.equal(apiCalls, 8);
});

test("quota, auth, plan and malformed Recipe API failures do not block other sources or retry", async () => {
  process.env.THEMEALDB_API_KEY = "test-key";
  let status = 429; let calls = 0;
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.hostname === "recipeapi.io") { calls++; return new Response('{"error":{"message":"provider error"}}', { status }); }
    if (location.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta" }] }));
    return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta", strInstructions: "Cook safely.", strIngredient1: "Chicken", strIngredient2: "Pasta", strIngredient3: "Salt", strIngredient4: "Pepper" }] }));
  };
  for (const code of [429, 401, 402, 200]) {
    status = code;
    const result = await request({ ingredients: input.pantry, allergies: [] });
    assert.equal(result.recipes[0]?.provider, "TheMealDB"); assert.deepEqual(result.providersUnavailable, ["RecipeAPI.io"]);
    assert.deepEqual(result.sourceResults[2], { provider: "RecipeAPI.io", status: "unavailable", count: 0 });
    assert.equal(JSON.stringify(result).includes("test-recipe-key"), false);
  }
  assert.equal(calls, 4);
  delete process.env.RECIPEAPI_API_KEY;
  assert.deepEqual((await request({ ingredients: input.pantry, allergies: [] })).sourceResults[2], { provider: "RecipeAPI.io", status: "not_configured", count: 0 });
  assert.equal(calls, 4);
});
