import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultPreferences,
  emptyPersistedKitchenState,
  parsePersistedKitchenState,
  removeSavedScanPhotos,
  serializePersistedKitchenState,
} from '../lib/kitchenPersistence';
import { archivePublishedRecipe, isArchivedPublished } from '../lib/recipeArchive';

test('onboarding preferences and reminder settings persist through the local state format', () => {
  const state = {
    ...emptyPersistedKitchenState(),
    preferences: { ...defaultPreferences, householdSize: 4, servings: 3, allergies: ['peanuts'], cuisines: [] },
    onboardingComplete: true,
    reminders: { enabled: true, hour: 7, minute: 30 },
    theme: 'dark' as const,
  };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.equal(restored.onboardingComplete, true);
  assert.equal(restored.preferences.householdSize, 4);
  assert.deepEqual(restored.preferences.allergies, ['peanuts']);
  assert.deepEqual(restored.reminders, { enabled: true, hour: 7, minute: 30 });
    assert.equal(restored.theme, 'dark');
  assert.deepEqual(restored.preferences.cuisines, []);
});

test('saved scan photo deletion keeps confirmed ingredient data', () => {
  const state = {
    ...emptyPersistedKitchenState(),
    ingredients: [{
      id: 'eggs', name: 'eggs', normalizedName: 'egg', location: 'Refrigerator' as const,
      quantity: '6 eggs', quantityValue: 6, unit: 'egg', quantityKnown: true,
      status: 'fresh' as const, confidence: 'confirmed' as const, photoUri: 'file:///scan.jpg',
    }],
  };
  const cleared = removeSavedScanPhotos(state);
  assert.equal(cleared.ingredients[0]?.photoUri, undefined);
  assert.equal(cleared.ingredients[0]?.name, 'eggs');
  assert.equal(cleared.ingredients[0]?.quantityValue, 6);
});

test('barcode identity survives a local kitchen reload', () => {
  const state = { ...emptyPersistedKitchenState(), ingredients: [{
    id: 'oats', name: 'Brand Rolled Oats', location: 'Pantry' as const, status: 'fresh' as const,
    confidence: 'confirmed' as const, source: 'barcode' as const, barcode: '012345678905', brand: 'Brand',
  }] };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.equal(restored.ingredients[0]?.barcode, '012345678905');
  assert.equal(restored.ingredients[0]?.source, 'barcode');
  assert.equal(restored.ingredients[0]?.brand, 'Brand');
});

test('full local-data reset starts onboarding again and has no offline records', () => {
  const reset = emptyPersistedKitchenState();
  assert.equal(reset.onboardingComplete, false);
  assert.deepEqual(reset.ingredients, []);
  assert.deepEqual(reset.spaceScans, []);
  assert.deepEqual(reset.plan, []);
  assert.deepEqual(reset.savedRecipes, []);
  assert.deepEqual(reset.archivedRecipes, []);
  assert.deepEqual(reset.savedKidPublishedRecipes, []);
  assert.deepEqual(reset.reminders, { enabled: false, hour: 18, minute: 0 });
});

test('3D scan model and confirmed ingredient list survive reload', () => {
  const scan = { id: 'scan-1', location: 'Pantry' as const,
    modelUri: 'file:///Documents/kitchen-compass-space-1.obj',
    createdAt: '2026-09-23T12:00:00.000Z', ingredientNames: ['Pasta', 'Tomatoes'] };
  const state = { ...emptyPersistedKitchenState(), spaceScans: [scan] };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.deepEqual(restored.spaceScans, [scan]);
  assert.deepEqual(parsePersistedKitchenState(JSON.stringify({ ...state, spaceScans: [{ ...scan, modelUri: 'https://example.com/other.obj' }] }), defaultPreferences).spaceScans, []);
});

test('published kid recipes and their original images survive reload', () => {
  const published = {
    id: 'meal-1', title: 'Tomato pasta', provider: 'TheMealDB' as const,
    sourceUrl: 'https://www.themealdb.com/meal/meal-1', imageUrl: 'https://www.themealdb.com/pasta.jpg',
    ingredients: [{ name: 'Pasta', measure: '1 cup' }], instructions: 'Cook the pasta.',
    matchedIngredients: ['Pasta'], missingIngredients: [], safetyVerified: false as const,
  };
  const state = { ...emptyPersistedKitchenState(), savedKidPublishedRecipes: [published] };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.deepEqual(restored.savedKidPublishedRecipes, [published]);
});

test('persisted kitchen records remain readable without a network', () => {
  const state = {
    ...emptyPersistedKitchenState(),
    ingredients: [{
      id: 'rice', name: 'rice', normalizedName: 'rice', location: 'Pantry' as const,
      quantityKnown: false, status: 'fresh' as const, confidence: 'confirmed' as const,
    }],
  };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.equal(restored.ingredients[0]?.name, 'rice');
  assert.equal(restored.ingredients[0]?.quantityKnown, false);
  assert.deepEqual(restored.archivedRecipes, []);
});

test('archived recipe exclusions survive a local state reload', () => {
  const state = {
    ...emptyPersistedKitchenState(),
    archivedRecipes: [{ key: 'egg bowl', title: 'Egg Bowl', archivedAt: '2026-09-23T00:00:00.000Z', recipeVersion: 'saved-v1' }],
  };
  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  assert.deepEqual(restored.archivedRecipes, state.archivedRecipes);
});

test('archiving a FatSecret result persists only its provider ID', () => {
  const recipe = {
    id: 'fatsecret:91', title: 'Tomato pasta', provider: 'FatSecret' as const,
    sourceUrl: 'https://www.fatsecret.com/recipes/tomato/Default.aspx',
    ingredients: [{ name: 'Pasta', measure: '1 cup' }], instructions: 'Cook pasta.',
    matchedIngredients: ['Pasta'], missingIngredients: [], safetyVerified: false as const,
  };
  const archived = archivePublishedRecipe([], recipe);
  const restored = parsePersistedKitchenState(serializePersistedKitchenState({ ...emptyPersistedKitchenState(), archivedRecipes: archived }), defaultPreferences);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('Tomato pasta'), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('Cook pasta'), false);
  assert.equal(isArchivedPublished(recipe, restored.archivedRecipes), true);
});

test('archiving a Spoonacular result keeps its ID and title without recipe content', () => {
  const recipe = {
    id: 'spoonacular:101', title: 'Tomato pasta', provider: 'Spoonacular' as const,
    sourceName: 'Example Kitchen', sourceUrl: 'https://example.com/recipes/101',
    imageUrl: 'https://img.spoonacular.com/101.jpg',
    ingredients: [{ name: 'Pasta', measure: '1 cup' }], instructions: 'Cook pasta.',
    matchedIngredients: ['Pasta'], missingIngredients: [], safetyVerified: false as const,
  };
  const archived = archivePublishedRecipe([], recipe);
  const restored = parsePersistedKitchenState(serializePersistedKitchenState({ ...emptyPersistedKitchenState(), archivedRecipes: archived }), defaultPreferences);
  assert.equal(restored.archivedRecipes[0]?.title, recipe.title);
  assert.equal(restored.archivedRecipes[0]?.externalId, recipe.id);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('Cook pasta'), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('1 cup'), false);
  assert.equal(isArchivedPublished(recipe, restored.archivedRecipes), true);
});

test('archives from unsupported providers are dropped during reload', () => {
  const state = { ...emptyPersistedKitchenState(), archivedRecipes: [{ key: 'retired:1', title: 'Retired recipe', externalProvider: 'RetiredProvider', externalId: 'retired:1', archivedAt: '2026-09-30T00:00:00.000Z' }] };
  const restored = parsePersistedKitchenState(JSON.stringify(state), defaultPreferences);
  assert.deepEqual(restored.archivedRecipes, []);
});

test('API Ninjas archives retain only a stable opaque exclusion ID', () => {
  const recipe = {
    id: `api-ninjas:${'b'.repeat(64)}`, title: 'Chicken pasta', provider: 'API Ninjas' as const,
    sourceUrl: '', ingredients: [{ name: 'Chicken', measure: '1 cup chicken' }], instructions: 'Cook chicken safely.',
    matchedIngredients: ['Chicken'], missingIngredients: [], safetyVerified: false as const,
  };
  const archived = archivePublishedRecipe([], recipe);
  const restored = parsePersistedKitchenState(serializePersistedKitchenState({ ...emptyPersistedKitchenState(), archivedRecipes: archived }), defaultPreferences);
  assert.equal(restored.archivedRecipes[0]?.externalId, recipe.id);
  assert.equal(isArchivedPublished(recipe, restored.archivedRecipes), true);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes(recipe.title), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes(recipe.instructions), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('1 cup'), false);
});

test('RecipeAPI.io archives preserve exclusions without retaining recipe data', () => {
  const recipe = {
    id: 'recipeapi:449', title: 'Chicken pasta', provider: 'RecipeAPI.io' as const,
    sourceUrl: '', ingredients: [{ name: 'Chicken', measure: '1 cup chicken' }], instructions: 'Cook chicken safely.',
    matchedIngredients: ['Chicken'], missingIngredients: [], safetyVerified: false as const,
  };
  const archived = archivePublishedRecipe([], recipe);
  const restored = parsePersistedKitchenState(serializePersistedKitchenState({ ...emptyPersistedKitchenState(), archivedRecipes: archived }), defaultPreferences);
  assert.equal(restored.archivedRecipes[0]?.externalId, recipe.id);
  assert.equal(isArchivedPublished(recipe, restored.archivedRecipes), true);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes(recipe.title), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes(recipe.instructions), false);
  assert.equal(JSON.stringify(restored.archivedRecipes).includes('1 cup'), false);
});
