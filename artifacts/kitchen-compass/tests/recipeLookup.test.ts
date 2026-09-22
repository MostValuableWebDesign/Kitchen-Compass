import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { applyCookingTransaction, buildReservations } from '../lib/kitchenLogic';
import { defaultPreferences, emptyPersistedKitchenState, parsePersistedKitchenState, serializePersistedKitchenState } from '../lib/kitchenPersistence';
import { mapDiscoveredRecipe } from '../lib/recipeDiscovery';

const require = createRequire(import.meta.url);
require.extensions['.jpg'] = () => undefined;
const { getAvailableRecipes, lookupPlannedRecipe, lookupRecipe } = require('../lib/recipeLookup') as typeof import('../lib/recipeLookup');

const generatedApiRecipe = {
  id: 'generated-lentil-skillet',
  recipeVersion: 'generated-lentil-skillet-v3',
  title: 'Smoky lentil skillet',
  description: 'A generated lentil dinner with a bright finish.',
  cuisine: 'Mediterranean',
  mealType: 'Dinner' as const,
  servings: 2,
  prepMinutes: 8,
  cookMinutes: 22,
  difficulty: 'Easy' as const,
  equipment: ['Stovetop'],
  ingredients: [{ name: 'lentils', quantity: 2, unit: 'cup', required: true }],
  healthScore: { status: 'calculated' as const, score: 86, note: 'High in fiber.', factors: [] },
  nutrition: {
    status: 'calculated' as const,
    perServing: { calories: 320, protein: 18, carbs: 48, fat: 6, fiber: 14, sodium: 220, addedSugar: 0, saturatedFat: 1 },
    total: { calories: 640, protein: 36, carbs: 96, fat: 12, fiber: 28, sodium: 440, addedSugar: 0, saturatedFat: 2 },
    coveredIngredients: ['lentils'],
    uncoveredIngredients: [],
    ingredientCoverage: 1,
    vegetableServingsPerServing: 1,
    source: { id: 'bundled-ingredient-reference-v1', label: 'Bundled ingredient reference table.' },
  },
  steps: [
    { order: 1, title: 'Warm the lentils', body: 'Warm the lentils gently until steaming and ready for the skillet.', ingredients: ['lentils'], ingredientAmounts: [{ name: 'lentils', quantity: 2, unit: 'cup' }] },
    { order: 2, title: 'Finish the skillet', body: 'Finish the skillet and check that the lentils are tender before serving.', ingredients: ['lentils'], ingredientAmounts: [{ name: 'lentils', quantity: 2, unit: 'cup' }] },
  ],
  allergens: [],
  allergenInfo: 'complete' as const,
  storageInstructions: 'Refrigerate promptly.',
  reheatingInstructions: 'Reheat until steaming hot.',
  servingSuggestions: ['Serve with herbs.'],
  commonMistakes: ['Do not scorch the lentils.'],
  dietaryTags: ['high-fiber'],
  dislikeTags: [],
  nutritionTags: ['More protein'],
  substitutions: [],
};

test('generated recipe survives discovery, rehydration, planned lookup, cooking steps, and confirmed deduction', () => {
  const discovered = mapDiscoveredRecipe(generatedApiRecipe);
  const planned = {
    id: 'Tuesday-Dinner',
    day: 'Tuesday',
    meal: 'Dinner' as const,
    recipeId: discovered.id,
    recipeVersion: discovered.recipeVersion,
    servings: 2,
  };
  const state = {
    ...emptyPersistedKitchenState(),
    plan: [planned],
    savedRecipes: [discovered],
    ingredients: [{
      id: 'lentils-bin',
      name: 'lentils',
      normalizedName: 'lentils',
      location: 'Pantry' as const,
      quantity: '2 cup',
      quantityValue: 2,
      unit: 'cup',
      quantityKnown: true,
      status: 'fresh' as const,
      confidence: 'confirmed' as const,
    }],
  };

  const restored = parsePersistedKitchenState(serializePersistedKitchenState(state), defaultPreferences);
  const availableAfterRestore = getAvailableRecipes(restored.savedRecipes);
  const todayRecipe = lookupPlannedRecipe(restored.plan[0], restored.savedRecipes);
  const detailRecipe = lookupPlannedRecipe(restored.plan[0], restored.savedRecipes);
  const cookingRecipe = lookupPlannedRecipe(restored.plan[0], restored.savedRecipes);

  assert.equal(todayRecipe?.title, 'Smoky lentil skillet');
  assert.equal(detailRecipe?.description, discovered.description);
  assert.deepEqual(cookingRecipe?.steps.map((step) => step.title), ['Warm the lentils', 'Finish the skillet']);

  const reservationBuild = buildReservations(restored.plan, availableAfterRestore, restored.ingredients);
  assert.deepEqual(reservationBuild.reservations.map(({ inventoryId, quantity, unit }) => ({ inventoryId, quantity, unit })), [
    { inventoryId: 'lentils-bin', quantity: 2, unit: 'cup' },
  ]);
  const transaction = applyCookingTransaction(
    restored.ingredients,
    [],
    'cook-Tuesday-Dinner',
    reservationBuild.reservations.filter((reservation): reservation is typeof reservation & { inventoryId: string; quantity: number; unit: string } =>
      Boolean(reservation.inventoryId && reservation.quantity !== undefined && reservation.unit),
    ),
  );
  assert.equal(transaction.applied, true);
  assert.equal(transaction.inventory[0]?.quantityValue, 0);
});

test('unknown recipe IDs and missing planned versions never resolve to a curated recipe', () => {
  const discovered = mapDiscoveredRecipe(generatedApiRecipe);
  const missingVersion = { id: 'Tuesday-Dinner', day: 'Tuesday', meal: 'Dinner' as const, recipeId: discovered.id, recipeVersion: 'deleted-version', servings: 2 };
  assert.equal(lookupRecipe('not-a-real-recipe', [discovered])?.title, undefined);
  assert.equal(lookupPlannedRecipe(missingVersion, [discovered]), undefined);
  assert.equal(buildReservations([missingVersion], getAvailableRecipes([discovered]), []).reservations.length, 0);
});