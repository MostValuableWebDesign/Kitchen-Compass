import assert from "node:assert/strict";
import test from "node:test";
import { classifyIngredientAvailability } from "../src/routes/recipeIngredientMatch";
import { normalizeExternalMeal } from "../src/routes/externalRecipes";
import { normalizeSpoonacularRecipe } from "../src/routes/spoonacularRecipes";
import { normalizeStructuredOnlineRecipe } from "../src/routes/structuredOnlineRecipe";

test("deterministic availability recognizes wording, equivalents, and compatible general types", () => {
  for (const [recipe, pantry] of [
    ["DICED Red Onions!", "onion"],
    ["scallions", "Green onions"],
    ["chickpeas", "garbanzo beans"],
    ["penne pasta", "pasta"],
    ["pasta", "spaghetti"],
    ["chicken breasts", "chicken"],
    ["ground beef", "beef"],
  ]) assert.equal(classifyIngredientAvailability(recipe!, pantry!), "match", `${recipe} / ${pantry}`);
});

test("distinct food forms stay distinct and different pasta shapes are only suggestions", () => {
  for (const [recipe, pantry] of [
    ["garlic powder", "garlic"],
    ["chicken broth", "chicken"],
    ["rice flour", "rice"],
    ["chicken thigh", "chicken breast"],
    ["green onion", "onion"],
  ]) assert.equal(classifyIngredientAvailability(recipe!, pantry!), "missing", `${recipe} / ${pantry}`);
  assert.equal(classifyIngredientAvailability("penne pasta", "spaghetti"), "possible_substitute");
  assert.equal(classifyIngredientAvailability("red onion", "yellow onion"), "possible_substitute");
});

test("all published providers use the same counts and keep substitutions missing", () => {
  const names = ["Diced red onions", "Garbanzo beans", "Penne pasta", "Garlic powder", "Chicken broth", "Rice flour"];
  const pantry = ["onion", "chickpeas", "spaghetti", "garlic", "chicken", "rice"];
  const structured = { title: "Pantry dinner", ingredients: names.map((name) => ({ name, quantity: 1, unit: "cup" })), instructions: ["Cook."] };
  const recipes = [
    normalizeExternalMeal({ idMeal: "1", strMeal: "Pantry dinner", strInstructions: "Cook.", ...Object.fromEntries(names.map((name, index) => [`strIngredient${index + 1}`, name])) }, pantry, []),
    normalizeSpoonacularRecipe({ id: 2, title: "Pantry dinner", sourceUrl: "https://example.com/recipe", instructions: "Cook.", extendedIngredients: names.map((name) => ({ name })) }, { id: 2 }, pantry, []),
    normalizeStructuredOnlineRecipe(structured, pantry, [], { provider: "RecipeAPI.io", idPrefix: "recipeapi" }),
    normalizeStructuredOnlineRecipe(structured, pantry, [], { provider: "Recipe-API.com", idPrefix: "recipe-api-com" }),
  ];
  for (const recipe of recipes) {
    assert.ok(recipe);
    assert.deepEqual(recipe.matchedIngredients, ["Diced red onions", "Garbanzo beans"]);
    assert.deepEqual(recipe.missingIngredients, ["Penne pasta", "Chicken broth", "Rice flour"]);
    assert.deepEqual(recipe.possibleSubstitutions, [{ recipeIngredient: "Penne pasta", pantryIngredient: "spaghetti" }]);
  }
});
