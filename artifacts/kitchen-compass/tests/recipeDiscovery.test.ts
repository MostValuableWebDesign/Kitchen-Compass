import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecipeDiscoveryRequest, mapDiscoveredRecipe, matchingSavedRecipes, mergeRecipes, novelRecipes, parseCachedRecipes, recipeVersion, recipesNeedingImages } from '../lib/recipeDiscovery';
import { archiveLocalRecipe, archivePublishedRecipe, isArchivedPublished, isArchivedRecipe, parseArchivedRecipes, restoreArchivedRecipe } from '../lib/recipeArchive';

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
  steps: [{ order: 1, title: 'Cook', body: 'Cook the eggs.', ingredients: ['eggs'], ingredientAmounts: [{ name: 'eggs', quantity: 2, unit: 'egg' }], cues: ['Whites are set.'], mistakes: ['Do not use high heat.'] }],
  allergens: ['egg'],
  allergenInfo: 'complete' as const,
  storageInstructions: 'Refrigerate.',
  reheatingInstructions: 'Reheat gently.',
  servingSuggestions: ['Serve with toast.'],
  commonMistakes: ['Overcook the eggs.'],
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

test('distinct recipes using the same ingredients are allowed while duplicates and repeat images are excluded', () => {
  const first = mapDiscoveredRecipe(apiRecipe);
  const reworded = mapDiscoveredRecipe({ ...apiRecipe, id: 'another-id', recipeVersion: 'another-version', title: ' EGG & Greens Bowl! ' });
  const newRecipe = mapDiscoveredRecipe({ ...apiRecipe, id: 'new-id', recipeVersion: 'new-version', title: 'Garlic eggs' });
  assert.deepEqual(novelRecipes([first], [reworded, newRecipe, newRecipe]).map((recipe) => recipe.id), ['new-id']);
  const request = buildRecipeDiscoveryRequest([], {
    allergies: [], dietaryRestrictions: [], dislikes: [], cuisines: [], skill: 'Beginner', cookTime: 30, equipment: [], nutrition: [],
  }, { mealType: 'Any', cuisine: '' }, 'test', [first.recipeVersion!], [first.title]);
  assert.deepEqual(request.excludeRecipeTitles, [first.title]);
  assert.deepEqual(recipesNeedingImages([{ ...first, image: 'file:///saved.jpg' }, newRecipe, newRecipe]).map((recipe) => recipe.id), ['new-id']);
});

test('saved matching recipes remain available alongside newly discovered recipes', () => {
  const recipe = mapDiscoveredRecipe(apiRecipe);
  const preferences = {
    allergies: [], dietaryRestrictions: [], dislikes: [], cuisines: [], skill: 'Comfortable' as const,
    cookTime: 45, equipment: ['Stovetop'], nutrition: [], servings: 1,
  };
  const eggs = [{ name: 'eggs', status: 'fresh' as const, confidence: 'confirmed' as const, quantityKnown: true, quantityValue: 4, unit: 'egg' }];
  assert.equal(matchingSavedRecipes([recipe], eggs, preferences, { mealType: 'Any', cuisine: '' }, []).length, 1);
  assert.equal(matchingSavedRecipes([recipe], eggs, preferences, { mealType: 'Any', cuisine: '', minHealthScore: 85 }, []).length, 0);
  assert.equal(matchingSavedRecipes([recipe], [{ name: 'rice', status: 'fresh', confidence: 'confirmed' }], preferences, { mealType: 'Any', cuisine: '' }, []).length, 0);
});

test('offline cache accepts only validated recipe-shaped entries', () => {
  const recipe = mapDiscoveredRecipe(apiRecipe);
  assert.equal(parseCachedRecipes([recipe, { id: 'broken', title: 'No safety data' }]).length, 1);
  const withImage = { ...recipe, image: 'file:///recipe-photo.jpg', imageSource: 'AI-generated' as const };
  assert.equal(parseCachedRecipes([withImage])[0]?.image, withImage.image);
  assert.equal(parseCachedRecipes(undefined).length, 0);
});

test('archiving hides a recipe without deleting its saved version or image and restores it later', () => {
  const recipe = { ...mapDiscoveredRecipe(apiRecipe), image: 'file:///saved.jpg', imageSource: 'AI-generated' as const };
  const archived = archiveLocalRecipe([], recipe, '2026-09-23T00:00:00.000Z');
  assert.equal(isArchivedRecipe(recipe, archived), true);
  assert.equal(isArchivedRecipe({ ...recipe, recipeVersion: 'another-version' }, archived), true);
  assert.equal(archived[0]?.recipeVersion, recipe.recipeVersion);
  assert.equal(recipe.image, 'file:///saved.jpg');
  assert.equal(parseArchivedRecipes(JSON.parse(JSON.stringify(archived)))[0]?.key, archived[0]?.key);
  assert.equal(isArchivedRecipe(recipe, restoreArchivedRecipe(archived, archived[0]!.key)), false);
});

test('published recipes can be archived and restored from a saved snapshot', () => {
  const published = {
    id: 'meal-1', title: 'Egg and greens bowl', provider: 'TheMealDB' as const,
    sourceUrl: 'https://example.com/meal', ingredients: [{ name: 'egg', measure: '2' }],
    instructions: 'Cook.', matchedIngredients: ['egg'], missingIngredients: [], safetyVerified: false as const,
  };
  const archived = archivePublishedRecipe([], published);
  assert.equal(isArchivedPublished(published, archived), true);
  assert.equal(parseArchivedRecipes(JSON.parse(JSON.stringify(archived)))[0]?.externalRecipe?.sourceUrl, published.sourceUrl);
  assert.equal(isArchivedPublished(published, restoreArchivedRecipe(archived, archived[0]!.key)), false);
});
