import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, beforeEach } from "node:test";
import app from "../src/app";
import { createScanAccessToken, resetScanRateLimiter } from "../src/middleware/scanSecurity";

process.env.SESSION_SECRET = "recipe-test-session-secret";
process.env.OPENAI_API_KEY = "recipe-test-openai-key";

const server = app.listen(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Recipe test server did not expose a port.");
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const originalFetch = globalThis.fetch;

beforeEach(() => resetScanRateLimiter());
after(() => server.close());

async function issueAccess() {
  return createScanAccessToken();
}

function requestBody() {
  return {
    inventory: [{ name: "eggs", location: "Refrigerator", quantityValue: 4, unit: "egg", quantityKnown: true, status: "fresh", confidence: "confirmed" }],
    preferences: {
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      cuisines: [],
      skill: "Comfortable",
      cookTime: 45,
      equipment: ["Stovetop"],
      nutrition: [],
    },
    filters: { mealType: "Any" },
    variationSeed: "test-seed-1",
    excludeRecipeVersions: [],
  };
}

function validModelRecipe() {
  return {
    title: "Egg and greens bowl",
    description: "A quick bowl built around confirmed eggs.",
    cuisine: "Modern",
    mealType: "Breakfast",
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 7,
    difficulty: "Easy",
    equipment: ["Stovetop"],
    ingredients: [
      { name: "eggs", quantity: 2, unit: "egg", required: true },
      { name: "spinach", quantity: 1, unit: "cup", required: false },
    ],
    steps: [{ order: 1, title: "Cook", body: "Cook the eggs until set.", ingredients: ["eggs"] }],
    allergens: ["egg"],
    allergenInfo: "complete",
    storageInstructions: "Refrigerate within 2 hours.",
    reheatingInstructions: "Reheat gently until hot.",
    dietaryTags: ["high-protein"],
    dislikeTags: [],
    nutritionTags: ["More protein"],
    substitutions: [{ from: "spinach", to: "kale", reason: "Similar leafy green texture." }],
  };
}

test("recipe discovery rejects malformed requests before provider work", async () => {
  const response = await originalFetch(`${baseUrl}/recipes/discover`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await issueAccess()}` },
    body: JSON.stringify({ inventory: [] }),
  });
  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { code: string; details?: unknown } };
  assert.equal(payload.error.code, "INVALID_REQUEST");
  assert.equal("details" in payload.error, false);
});

test("recipe discovery returns only strict, versioned, server-validated recipes", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipes: [validModelRecipe()] }) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return original(input, init);
  };
  try {
    const response = await originalFetch(`${baseUrl}/recipes/discover`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await issueAccess()}` },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { source: string; recipes: Array<{ id: string; recipeVersion: string; allergenInfo: string; healthScore: { status: string }; nutrition: { status: string; uncoveredIngredients: string[]; source: { id: string } }; substitutions: Array<{ validated: boolean }> }> };
    assert.equal(payload.source, "server-ai");
    assert.equal(payload.recipes.length, 1);
    assert.match(payload.recipes[0]!.id, /^discovered-/);
    assert.match(payload.recipes[0]!.recipeVersion, /^[a-f0-9]{24}$/);
    assert.equal(payload.recipes[0]!.allergenInfo, "complete");
    assert.equal(payload.recipes[0]!.healthScore.status, "insufficient-information");
    assert.equal(payload.recipes[0]!.nutrition.status, "insufficient-information");
    assert.deepEqual(payload.recipes[0]!.nutrition.uncoveredIngredients, ["spinach"]);
    assert.equal(payload.recipes[0]!.nutrition.source.id, "bundled-ingredient-reference-v1");
    assert.equal(payload.recipes[0]!.substitutions[0]!.validated, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("recipe discovery never returns an allergy-conflicting candidate", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipes: [validModelRecipe()] }) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return original(input, init);
  };
  try {
    const body = requestBody();
    body.preferences.allergies = ["egg"];
    const response = await originalFetch(`${baseUrl}/recipes/discover`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await issueAccess()}` },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});