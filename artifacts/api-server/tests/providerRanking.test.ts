import assert from "node:assert/strict";
import test from "node:test";
import { combineProviderRecipeResults, suitableMealCourse, type ExternalRecipe } from "../src/routes/externalRecipes";

function recipe(provider: "Edamam" | "Spoonacular" | "TheMealDB", food: string, missingIngredients: string[] = []): ExternalRecipe {
  return {
    id: `${provider}-${food}`, title: `${food} salad`, provider,
    sourceUrl: `https://example.com/${provider}/${food}`, ingredients: [{ name: food, measure: "1 cup" }],
    instructions: "", matchedIngredients: [food], missingIngredients, safetyVerified: false,
  };
}

test("better fit from any source beats provider order, then priority anchor breaks ties", () => {
  const edamam = recipe("Edamam", "Rice", ["Onion"]);
  const spoonacular = recipe("Spoonacular", "Rice");
  const mealDb = recipe("TheMealDB", "Chicken");
  const ranked = combineProviderRecipeResults([[edamam], [spoonacular], [mealDb]], 3, undefined, ["Chicken breast", "Rice"]);
  assert.deepEqual(ranked.map((item) => item.provider), ["TheMealDB", "Spoonacular", "Edamam"]);
});

test("duplicate links retain the source with the stronger pantry fit", () => {
  const edamam = recipe("Edamam", "Rice", ["Onion"]);
  const spoonacular = recipe("Spoonacular", "Rice");
  spoonacular.sourceUrl = edamam.sourceUrl;
  const drops: string[] = [];
  const ranked = combineProviderRecipeResults([[edamam], [spoonacular]], 2, (_group, reason) => drops.push(reason), ["Rice"]);
  assert.deepEqual(ranked.map((item) => item.provider), ["Spoonacular"]);
  assert.deepEqual(drops, ["duplicate"]);
});

test("broth is not a protein when checking a side dish", () => {
  const side = recipe("Edamam", "Chicken broth");
  side.title = "Vegetable rice";
  side.ingredients = [{ name: "Chicken broth", measure: "1 cup" }, { name: "Rice", measure: "1 cup" }];
  side.matchedIngredients = ["Chicken broth", "Rice"];
  assert.equal(suitableMealCourse(side, "side", "general", { title: "Roast chicken", ingredientNames: ["Chicken"] }, ["Rice"]), true);
});
