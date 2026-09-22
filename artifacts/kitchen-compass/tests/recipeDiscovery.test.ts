import assert from 'node:assert/strict';
import test from 'node:test';
import { mapDiscoveredRecipe, mergeRecipes, parseCachedRecipes, recipeVersion } from '../lib/recipeDiscovery';

const apiRecipe = {
  id: 'discovered-stable',
  recipeVersion: 'stable-version-1',
  title: 'Egg and greens bowl',
  description: 'A quick bowl.',
  cuisine: 'Modern',
  mealType: 'Breakfast' as const,
  servings: 1,
  prepMinutes: 5,
  cookMinutes: 7,
  difficulty: 'Easy' as const,
  equipment: ['Stovetop'],
  ingredients: [{ name: 'eggs', quantity: 2, unit: 'egg', required: true }],
  healthScore: {
    status: 'calculated' as const,
    score: 82,
    note: 'Balanced.',
    factors: [],
  },
  nutrition: {
    status: 'calculated' as const,
    perServing: { calories: 300, protein: 18, carbs: 12, fat: 18, fiber: 4, sodium: 250, addedSugar: 0, saturatedFat: 3 },
    total: { calories: 300, protein: 18, carbs: 12, fat: 18, fiber: 4, sodium: 250, addedSugar: 0, saturatedFat: 3 },
    coveredIngredients: ['eggs'],
    uncoveredIngredients: [],
    ingredientCoverage: 1,
    vegetableServingsPerServing: 0,
    source: { id: 'bundled-ingredient-reference-v1', label: 'Bundled ingredient reference table; unsupported ingredients are not estimated.' },
  },
  steps: [{ order: 1, title: 'Cook', body: 'Cook the eggs.', ingredients: ['eggs'] }],
  allergens: ['egg'],
  allergenInfo: 'complete' as const,
  storageInstructions: 'Refrigerate.',
  reheatingInstructions: 'Reheat gently.',
  dietaryTags: ['high-protein'],
  dislikeTags: [],
  nutritionTags: ['More protein'],
  substitutions: [],
};

test('server recipes map to the app shape with a stable version and numeric display amount', () => {
  const recipe = mapDiscoveredRecipe(apiRecipe);
  assert.equal(recipe.source, 'server-ai');
  assert.equal(recipe.recipeVersion, 'stable-version-1');
  assert.equal(recipeVersion(recipe), 'stable-version-1');
  assert.equal(recipe.ingredients[0]?.amount, '2 egg');
  assert.equal(recipe.meal, 'Breakfast');
});

test('refreshing discovery does not replace a saved recipe with a different version', () => {
  const first = mapDiscoveredRecipe(apiRecipe);
  const newer = mapDiscoveredRecipe({ ...apiRecipe, id: 'discovered-newer', recipeVersion: 'stable-version-2', title: 'A different bowl' });
  assert.deepEqual(mergeRecipes([first], [first, newer]).map(recipeVersion), ['stable-version-1', 'stable-version-2']);
  assert.deepEqual(mergeRecipes([first], [{ ...newer, recipeVersion: 'stable-version-1', id: 'same-version' }]).map((recipe) => recipe.id), ['discovered-stable']);
});

test('offline cache accepts only validated recipe-shaped entries', () => {
  const recipe = mapDiscoveredRecipe(apiRecipe);
  assert.equal(parseCachedRecipes([recipe, { id: 'broken', title: 'No safety data' }]).length, 1);
  assert.equal(parseCachedRecipes(undefined).length, 0);
});