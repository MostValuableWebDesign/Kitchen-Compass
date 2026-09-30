import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalMeal } from "../src/routes/externalRecipes";
import { normalizeSpoonacularRecipe } from "../src/routes/spoonacularRecipes";
import { isNonCountedMissingIngredient } from "../src/routes/recipeSeasonings";

test("herbs, spices, and seasonings do not count as missing across providers", () => {
  for (const name of ["Fresh basil leaves", "Ground cumin", "Garlic powder", "Italian seasoning", "Red pepper flakes", "Salt"]) {
    assert.equal(isNonCountedMissingIngredient(name), true, name);
  }
  for (const name of ["Bell pepper", "Chicken breast", "Ginger chicken", "Chili beans"]) {
    assert.equal(isNonCountedMissingIngredient(name), false, name);
  }
  const names = ["Chicken", "Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Bell pepper", "Fresh basil leaves", "Ground cumin", "Garlic powder", "Italian seasoning"];
  const pantry = ["Chicken"];
  const expected = ["Potato", "Carrot", "Onion", "Garlic", "Lemon", "Celery", "Bell pepper"];
  const spoonacular = normalizeSpoonacularRecipe({ id: 1, title: "Chicken dinner", image: "https://example.com/p.jpg", sourceUrl: "https://example.com/r", instructions: "Cook.", extendedIngredients: names.map((name) => ({ name })) }, { id: 1 }, pantry, []);
  const meal = normalizeExternalMeal({ idMeal: "1", strMeal: "Chicken dinner", strInstructions: "Cook.", ...Object.fromEntries(names.map((name, index) => [`strIngredient${index + 1}`, name])) }, pantry, []);
  for (const recipe of [spoonacular, meal]) {
    assert.ok(recipe);
    assert.deepEqual(recipe.missingIngredients, expected);
    assert.equal(recipe.missingIngredients.length, 7);
  }
});
