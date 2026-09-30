import assert from "node:assert/strict";
import test from "node:test";
import { combineProviderRecipeResults, suitableMealCourse, type ExternalRecipe } from "../src/routes/externalRecipes";

function recipe(provider: "Spoonacular" | "TheMealDB", food: string, missingIngredients: string[] = []): ExternalRecipe {
  return {
    id: `${provider}-${food}`, title: `${food} salad`, provider,
    sourceUrl: `https://example.com/${provider}/${food}`, ingredients: [{ name: food, measure: "1 cup" }],
    instructions: "", matchedIngredients: [food], missingIngredients, safetyVerified: false,
  };
}

test("better fit from any source beats provider order, then priority anchor breaks ties", () => {
  const weakerMeal = recipe("TheMealDB", "Rice", ["Onion"]);
  const spoonacular = recipe("Spoonacular", "Rice");
  const mealDb = recipe("TheMealDB", "Chicken");
  const ranked = combineProviderRecipeResults([[weakerMeal], [spoonacular], [mealDb]], 3, undefined, ["Chicken breast", "Rice"]);
  assert.deepEqual(ranked.map((item) => item.provider), ["TheMealDB", "Spoonacular", "TheMealDB"]);
});

test("duplicate links retain the source with the stronger pantry fit", () => {
  const weakerMeal = recipe("TheMealDB", "Rice", ["Onion"]);
  const spoonacular = recipe("Spoonacular", "Rice");
  spoonacular.sourceUrl = weakerMeal.sourceUrl;
  const drops: string[] = [];
  const ranked = combineProviderRecipeResults([[weakerMeal], [spoonacular]], 2, (_group, reason) => drops.push(reason), ["Rice"]);
  assert.deepEqual(ranked.map((item) => item.provider), ["Spoonacular"]);
  assert.deepEqual(drops, ["duplicate"]);
});

test("broth is not a protein when checking a side dish", () => {
  const side = recipe("TheMealDB", "Chicken broth");
  side.title = "Vegetable rice";
  side.ingredients = [{ name: "Chicken broth", measure: "1 cup" }, { name: "Rice", measure: "1 cup" }];
  side.matchedIngredients = ["Chicken broth", "Rice"];
  assert.equal(suitableMealCourse(side, "side", "general", { title: "Roast chicken", ingredientNames: ["Chicken"] }, ["Rice"]), true);
});

test("complete meal course checks distinguish mains from mild complementary sides", () => {
  const recipe = (title: string, ingredients: string[]): ExternalRecipe => ({
    id: title, title, provider: "Spoonacular", sourceUrl: "https://example.com/recipe", instructions: "",
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
