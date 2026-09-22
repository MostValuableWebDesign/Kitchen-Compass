import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShoppingNeeds,
  buildReservations,
  deductInventory,
  ingredientIdentitiesMatch,
  recipeMatchesPreferences,
  recipeReadiness,
  scaleNutrition,
  scaleQuantity,
} from '../lib/kitchenLogic';

const greenEggToast = {
  id: 'green-egg-toast',
  servings: 1,
  ingredients: [
    { name: 'eggs', quantity: 2, unit: 'egg', required: true },
    { name: 'avocado', quantity: 0.5, unit: 'fruit', required: true },
    { name: 'bread', quantity: 1, unit: 'slice', required: true },
  ],
};

test('uncertain and used inventory cannot make a recipe ready', () => {
  const recipe = { ingredients: [{ name: 'eggs', required: true }], allergens: [], allergenInfo: 'complete' as const };
  assert.equal(recipeReadiness(recipe, [{ name: 'eggs', status: 'fresh', confidence: 'uncertain' }], []).ready, false);
  assert.equal(recipeReadiness(recipe, [{ name: 'eggs', status: 'used', confidence: 'confirmed' }], []).ready, false);
  assert.equal(recipeReadiness(recipe, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 2, unit: 'egg', quantityKnown: true }], []).ready, false);
  assert.deepEqual(recipeReadiness({ ingredients: [{ name: 'eggs', quantity: 1, unit: 'egg', required: true }], servings: 1, allergens: [], allergenInfo: 'complete' }, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 2, unit: 'egg', quantityKnown: true }], [], 1).ready, true);
});

test('allergy conflicts exclude recipes and incomplete information is never safe', () => {
  const recipe = { ingredients: [{ name: 'eggs', required: true }], allergens: ['egg'], allergenInfo: 'complete' as const };
  assert.equal(recipeReadiness(recipe, [], ['eggs']).allergenConflict, true);
  assert.equal(recipeReadiness({ ...recipe, allergens: [], allergenInfo: 'incomplete' }, [], []).allergenIncomplete, true);
  assert.equal(recipeReadiness({ ...recipe, allergens: [], allergenInfo: 'incomplete' }, [], []).ready, false);
});

test('ingredient matching uses normalized identities, not broad substrings', () => {
  assert.equal(ingredientIdentitiesMatch('eggs', { name: 'egg carton', status: 'fresh', confidence: 'confirmed' }), false);
  assert.equal(ingredientIdentitiesMatch('eggs', { name: 'eggs', status: 'fresh', confidence: 'confirmed' }), true);
});

test('one-serving Green Egg Toast scales to two servings', () => {
  assert.equal(scaleQuantity(2, 1, 2), 4);
  assert.equal(scaleQuantity(0.5, 1, 2), 1);
  assert.deepEqual(scaleNutrition({ calories: 340, protein: 17 }, 1, 2), { calories: 680, protein: 34 });
});

test('weekly demand aggregates meals and does not allocate unknown stock as known stock', () => {
  const needs = calculateShoppingNeeds(
    [{ id: 'monday-dinner', recipeId: 'green-egg-toast', servings: 1 }, { id: 'tuesday-dinner', recipeId: 'green-egg-toast', servings: 1 }],
    [greenEggToast],
    [{ name: 'eggs', quantityValue: 2, unit: 'egg', quantityKnown: true, status: 'fresh', confidence: 'confirmed' }],
    2,
  );
  const eggs = needs.find((item) => item.normalizedName === 'egg');
   assert.deepEqual(eggs, {
    id: 'egg',
    name: 'eggs',
    normalizedName: 'egg',
     quantity: 2,
    unit: 'egg',
    quantityCheckNeeded: false,
    category: 'Dairy & eggs',
  });

  const unknown = calculateShoppingNeeds([{ id: 'monday-dinner', recipeId: 'green-egg-toast', servings: 1 }], [greenEggToast], [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityKnown: false }], 1);
  assert.equal(unknown.find((item) => item.normalizedName === 'egg')?.quantityCheckNeeded, true);
});

test('reservations allocate exact quantities and warn instead of claiming stock', () => {
  const result = buildReservations(
    [{ id: 'monday-dinner', recipeId: 'green-egg-toast', servings: 1 }],
    [{ ...greenEggToast, ingredients: [{ name: 'eggs', quantity: 2, unit: 'egg', required: true }] }],
    [{ id: 'egg-row', name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 2, unit: 'egg', quantityKnown: true }],
  );
  assert.equal(result.reservations.find((item) => item.inventoryId === 'egg-row')?.quantity, 2);
  assert.equal(result.warnings.length, 0);
  const over = buildReservations(
    [{ id: 'monday-dinner', recipeId: 'green-egg-toast', servings: 2 }],
    [{ ...greenEggToast, ingredients: [{ name: 'eggs', quantity: 2, unit: 'egg', required: true }] }],
    [{ id: 'egg-row', name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 1, unit: 'egg', quantityKnown: true }],
  );
  assert.equal(over.warnings.length, 1);
  assert.equal(over.reservations.some((item) => item.quantityKnown === false), true);
});

test('cooking deductions use exact inventory ids and preserve partial stock', () => {
  const updated = deductInventory([
    { id: 'egg-row', name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 4, unit: 'egg', quantityKnown: true },
    { id: 'egg-carton-label', name: 'egg carton label', status: 'fresh', confidence: 'confirmed', quantityValue: 3, unit: 'egg', quantityKnown: true },
  ], [{ inventoryId: 'egg-row', quantity: 2, unit: 'egg' }]);
  assert.equal(updated[0].quantityValue, 2);
  assert.equal(updated[0].status, 'fresh');
  assert.equal(updated[1].quantityValue, 3);
});

test('saved preferences exclude unsafe or incompatible discovery results', () => {
  const recipe = {
    cuisine: 'Mediterranean',
    cook: 30,
    difficulty: 'Easy',
    equipment: ['Stovetop'],
    ingredients: [{ name: 'chicken' }],
    allergens: [],
    allergenInfo: 'complete' as const,
    nutritionTags: ['More protein'],
  };
  assert.equal(recipeMatchesPreferences(recipe, {
    allergies: [], dietaryRestrictions: ['vegetarian'], dislikes: [], cuisines: ['Mediterranean'],
    skill: 'Beginner', cookTime: 45, equipment: ['Stovetop'], nutrition: [],
  }), false);
});