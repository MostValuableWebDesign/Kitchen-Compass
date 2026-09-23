import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultPreferences,
  emptyPersistedKitchenState,
  parsePersistedKitchenState,
  removeSavedScanPhotos,
  serializePersistedKitchenState,
} from '../lib/kitchenPersistence';

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
