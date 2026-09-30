import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";
import { normalizeRecipeApiComRecipe, searchRecipeApiComRecipes } from "../src/routes/recipeApiComRecipes";
import { createRecipeSearchDiagnostics } from "../src/routes/recipeSearchDiagnostics";
const envNames = ["RECIPE_API_COM_API_KEY", "RECIPE_API_COM_MAX_DETAILS", "RECIPEAPI_API_KEY", "API_NINJAS_API_KEY", "SPOONACULAR_API_KEY", "THEMEALDB_API_KEY", "SESSION_SECRET"];
const saved = new Map(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
process.env.SESSION_SECRET = "recipe-api-com-test-session";
const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("No port");
const url = `http://127.0.0.1:${address.port}/api/recipes/external`;
beforeEach(() => {
  resetScanRateLimiter(); process.env.RECIPE_API_COM_API_KEY = "rapi_test-secret";
  delete process.env.RECIPE_API_COM_MAX_DETAILS;
  for (const name of ["RECIPEAPI_API_KEY", "API_NINJAS_API_KEY", "SPOONACULAR_API_KEY"]) delete process.env[name];
});
after(() => { server.close(); globalThis.fetch = originalFetch; for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
const uuid = (index: number) => `a066f472-ed0c-46ea-8e2c-${String(index).padStart(12, "0")}`;
const raw = (index = 1, name = "Chicken pasta", names = ["Chicken", "Pasta", "Tomato", "Salt"]) => ({
  id: uuid(index), name, ingredients: [{ group_name: "Main", items: names.map((name) => ({ name, quantity: name === "Salt" ? null : 1, unit: name === "Salt" ? null : "cup", preparation: null, notes: name === "Salt" ? "to taste" : null })) }],
  instructions: [{ step_number: 2, text: "Cook safely." }, { step_number: 1, text: "Prepare ingredients." }], dietary: { flags: [], not_suitable_for: [] as string[] },
});
const input = { pantry: ["Chicken", "Pasta", "Tomato"], anchors: ["Chicken", "Pasta"], allergies: [], excludedIds: new Set<string>(), excludedTitles: new Set<string>(), audience: "general" as const };

test("recipe-api.com uses a free text discovery call, server authentication, and bounded details", async () => {
  const calls: URL[] = [];
  let expectedDetails = 3;
  globalThis.fetch = async (target, init) => {
    const location = new URL(String(target)); calls.push(location);
    assert.equal((init?.headers as Record<string, string>)["X-API-Key"], "rapi_test-secret");
    assert.equal(location.toString().includes("rapi_test-secret"), false);
    if (location.pathname === "/api/v1/recipes") {
      assert.equal(location.searchParams.get("q"), "chicken");
      assert.equal(location.searchParams.get("per_page"), String(expectedDetails));
      assert.equal(location.searchParams.has("ingredients"), false);
      return new Response(JSON.stringify({ data: Array.from({ length: 10 }, (_, i) => ({ id: uuid(i + 1), name: "Chicken pasta" })), meta: { total: 10, page: 1 } }));
    }
    const index = Number(location.pathname.slice(-12));
    return new Response(JSON.stringify({ data: raw(index) }));
  };
  const results = await searchRecipeApiComRecipes(input);
  assert.equal(calls.length, 4); assert.equal(results.length, 3);
  assert.equal(results[0]?.provider, "Recipe-API.com"); assert.equal(results[0]?.id, `recipe-api-com:${uuid(1)}`);
  assert.equal(results[0]?.instructions, "Prepare ingredients.\nCook safely.");
  assert.equal(results[0]?.ingredients.at(-1)?.measure, "Salt to taste");
  assert.equal(results[0]?.sourceUrl, "");
  calls.length = 0; expectedDetails = 2;
  assert.equal((await searchRecipeApiComRecipes({ ...input, course: "main" })).length, 2);
  assert.equal(calls.length, 3);
});

test("archived and duplicate summaries avoid metered detail calls; quota stops further requests and retains qualified recipes", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (target) => {
    const location = new URL(String(target)); calls.push(location);
    if (location.pathname === "/api/v1/recipes") return new Response(JSON.stringify({ data: [
      { id: uuid(1), name: "Chicken pasta" }, { id: uuid(1), name: "Chicken pasta" }, { id: uuid(2), name: "Archived chicken" }, { id: "bad-id", name: "Chicken" }, { id: uuid(3), name: "Chicken rice" }, { id: uuid(4), name: "Chicken salad" },
    ] }));
    return location.pathname.endsWith(uuid(1)) ? new Response(JSON.stringify({ data: raw(1) })) : new Response("quota", { status: 429 });
  };
  const results = await searchRecipeApiComRecipes({ ...input, excludedIds: new Set([`recipe-api-com:${uuid(2)}`]) });
  assert.equal(results.length, 1); assert.equal(calls.length, 3);
  assert.equal(calls.some((location) => location.pathname.endsWith(uuid(2)) || location.pathname.endsWith(uuid(4))), false);
});

test("grouped recipes validate IDs and steps, retain nullable quantities, and check allergies in notes", () => {
  const recipe = raw();
  assert.equal(normalizeRecipeApiComRecipe({ ...recipe, id: "invalid" }, input.pantry, []), null);
  assert.equal(normalizeRecipeApiComRecipe({ ...recipe, ingredients: [{ items: [null] }] }, input.pantry, []), null);
  assert.equal(normalizeRecipeApiComRecipe({ ...recipe, instructions: [{ step_number: 1, text: "a" }, { step_number: 1, text: "b" }] }, input.pantry, []), null);
  recipe.ingredients[0]!.items[0]!.notes = "contains peanut butter";
  assert.equal(normalizeRecipeApiComRecipe(recipe, input.pantry, ["peanut"]), null);
  const warning = raw(); warning.dietary.not_suitable_for = ["Peanut allergy"];
  assert.equal(normalizeRecipeApiComRecipe(warning, input.pantry, ["peanut"]), null);
});

test("detail eligibility checks pantry matches, seven missing ingredients, spices, and kid suitability", async () => {
  process.env.RECIPE_API_COM_MAX_DETAILS = "5";
  const names = ["Pasta", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Bell pepper", "Ground cumin", "Italian seasoning"];
  const details = [raw(1, "Pasta salad", names), raw(2, "Pasta salad", [...names, "Peas"]), raw(3, "Peanut pasta", ["Pasta", "Peanut butter"]), raw(4, "Spicy pasta", ["Pasta", "Cayenne"]), raw(5, "Rice salad", ["Rice"])];
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.pathname === "/api/v1/recipes") return new Response(JSON.stringify({ data: details.map(({ id, name }) => ({ id, name })) }));
    return new Response(JSON.stringify({ data: details.find((recipe) => location.pathname.endsWith(recipe.id)) }));
  };
  const diagnostics = createRecipeSearchDiagnostics();
  const result = await searchRecipeApiComRecipes({ ...input, pantry: ["Pasta"], allergies: ["peanut"], audience: "kids" }, diagnostics);
  assert.equal(result.length, 1); assert.equal(result[0]?.missingIngredients.length, 7);
  for (const reason of ["tooManyMissing", "allergy", "notKidFriendly", "noPantryMatch"] as const) assert.equal(diagnostics.candidatesRemoved[reason], 1, reason);
});

async function request(body: Record<string, unknown>) {
  const response = await originalFetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await createScanAccessToken()}` }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ recipes: Array<{ provider: string; instructions: string }>; sourceResults: Array<{ provider: string; status: string; count: number }>; providersUnavailable: string[] }>;
}

test("Recipe-API.com populates general, kids, and complete meals using the existing ingredient minimum", async () => {
  let candidate = raw();
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.hostname !== "recipe-api.com") return new Response(JSON.stringify({ meals: [] }));
    return new Response(JSON.stringify({ data: location.pathname === "/api/v1/recipes" ? [{ id: candidate.id, name: candidate.name }] : candidate }));
  };
  for (const body of [{ audience: "general" }, { audience: "kids" }, { audience: "general", course: "main" }, { audience: "kids", course: "main" }]) {
    const result = await request({ ingredients: input.pantry, searchAnchors: input.anchors, allergies: [], ...body });
    assert.equal(result.recipes[0]?.provider, "Recipe-API.com"); assert.match(result.recipes[0]?.instructions ?? "", /Cook safely/);
    assert.deepEqual(result.sourceResults[3], { provider: "Recipe-API.com", status: "found", count: 1 });
  }
  candidate = raw(2, "Mashed potatoes", ["Potato", "Milk", "Salt", "Pepper"]);
  for (const audience of ["general", "kids"]) assert.equal((await request({ ingredients: ["Potato"], searchAnchors: ["Potato"], allergies: [], audience, course: "side", mainRecipe: { title: "Roast chicken", ingredientNames: ["Chicken"] } })).recipes[0]?.provider, "Recipe-API.com");
  candidate = raw(3, "Chicken pasta", ["Chicken", "Pasta"]);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "general" })).recipes.length, 0);
  assert.equal((await request({ ingredients: input.pantry, allergies: [], audience: "kids" })).recipes.length, 1);
});

test("missing key, malformed data, auth and quota failures preserve other providers without retries", async () => {
  process.env.THEMEALDB_API_KEY = "test-key";
  let status = 429; let calls = 0;
  globalThis.fetch = async (target) => {
    const location = new URL(String(target));
    if (location.hostname === "recipe-api.com") { calls++; return new Response('{"error":"provider failed"}', { status }); }
    if (location.pathname.endsWith("filter.php")) return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta" }] }));
    return new Response(JSON.stringify({ meals: [{ idMeal: "1", strMeal: "Chicken pasta", strInstructions: "Cook safely.", strIngredient1: "Chicken", strIngredient2: "Pasta", strIngredient3: "Salt", strIngredient4: "Pepper" }] }));
  };
  for (const code of [429, 401, 200]) {
    status = code; const result = await request({ ingredients: input.pantry, allergies: [] });
    assert.equal(result.recipes[0]?.provider, "TheMealDB"); assert.deepEqual(result.providersUnavailable, ["Recipe-API.com"]);
    assert.deepEqual(result.sourceResults[3], { provider: "Recipe-API.com", status: "unavailable", count: 0 });
    assert.equal(JSON.stringify(result).includes("rapi_test-secret"), false);
  }
  assert.equal(calls, 3); delete process.env.RECIPE_API_COM_API_KEY;
  assert.deepEqual((await request({ ingredients: input.pantry, allergies: [] })).sourceResults[3], { provider: "Recipe-API.com", status: "not_configured", count: 0 });
  assert.equal(calls, 3);
});
