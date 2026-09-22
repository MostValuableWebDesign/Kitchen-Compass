import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShoppingNeeds,
  applyCookingTransaction,
  buildReservations,
  deductInventory,
  ingredientIdentitiesMatch,
  recipeMatchesPreferences,
  recipeReadiness,
  scaleNutrition,
  scaleQuantity,
} from '../lib/kitchenLogic';
import { defaultPreferences, migrateV1KitchenState } from '../lib/kitchenPersistence';
import { recipes } from '../data/recipes';

const greenEggToast = {
  id: 'green-egg-toast',
  servings: 1,
  allergens: ['egg', 'wheat'],
  allergenInfo: 'complete' as const,
  ingredients: [
    { name: 'eggs', quantity: 2, unit: 'egg', required: true },
    { name: 'avocado', quantity: 0.5, unit: 'fruit', required: true },
    { name: 'bread', quantity: 1, unit: 'slice', required: true },
  ],
};

const eggsOnlyRecipe = {
  id: 'eggs-only',
  servings: 1,
  allergens: ['egg'],
  allergenInfo: 'complete' as const,
  ingredients: [{ name: 'eggs', quantity: 2, unit: 'egg', required: true }],
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
     quantityCheckReasons: [],
    category: 'Dairy & eggs',
  });

  const unknown = calculateShoppingNeeds([{ id: 'monday-dinner', recipeId: 'green-egg-toast', servings: 1 }], [greenEggToast], [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityKnown: false }], 1);
  assert.equal(unknown.find((item) => item.normalizedName === 'egg')?.quantityCheckNeeded, true);
  assert.deepEqual(unknown.find((item) => item.normalizedName === 'egg')?.quantityCheckReasons, ['unknown-inventory']);
});

test('a planned meal can use its own reservation, while other meals remain unavailable', () => {
  const plan = [{ id: 'monday-breakfast', recipeId: 'eggs-only', servings: 1 }];
  const inventory = [{ id: 'egg-row', name: 'eggs', quantityValue: 2, unit: 'egg', quantityKnown: true, status: 'fresh' as const, confidence: 'confirmed' as const }];
  const reservations = buildReservations(plan, [eggsOnlyRecipe], inventory).reservations;
  assert.equal(recipeReadiness(eggsOnlyRecipe, inventory, [], 1, reservations, 'monday-breakfast').ready, true);
  assert.equal(recipeReadiness(eggsOnlyRecipe, inventory, [], 1, reservations).ready, false);
});

test('shopping subtracts physical stock once, never reservations twice', () => {
  const plan = [
    { id: 'monday-breakfast', recipeId: 'green-egg-toast', servings: 1 },
    { id: 'tuesday-breakfast', recipeId: 'green-egg-toast', servings: 1 },
  ];
  const inventory = [{ id: 'egg-row', name: 'eggs', quantityValue: 2, unit: 'egg', quantityKnown: true, status: 'fresh' as const, confidence: 'confirmed' as const }];
  const reservations = buildReservations(plan, [greenEggToast], inventory).reservations;
  const eggs = calculateShoppingNeeds(plan, [greenEggToast], inventory, 1, reservations).find((item) => item.normalizedName === 'egg');
  assert.equal(eggs?.quantity, 2);
  assert.equal(eggs?.quantityCheckNeeded, false);
});

test('changing a planned meal releases its old reservation and recalculates needs', () => {
  const inventory = [{ id: 'egg-row', name: 'eggs', quantityValue: 2, unit: 'egg', quantityKnown: true, status: 'fresh' as const, confidence: 'confirmed' as const }];
  const first = [{ id: 'monday-breakfast', recipeId: 'eggs-only', servings: 1 }];
  const firstReservations = buildReservations(first, [eggsOnlyRecipe], inventory).reservations;
  assert.equal(recipeReadiness(eggsOnlyRecipe, inventory, [], 1, firstReservations, 'monday-breakfast').ready, true);
  const swapped = [{ id: 'monday-dinner', recipeId: 'eggs-only', servings: 1 }];
  const swappedReservations = buildReservations(swapped, [eggsOnlyRecipe], inventory).reservations;
  assert.equal(swappedReservations.some((reservation) => reservation.plannedMealId === 'monday-breakfast'), false);
  assert.equal(recipeReadiness(eggsOnlyRecipe, inventory, [], 1, swappedReservations, 'monday-dinner').ready, true);
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

test('repeating the same cooking transaction does not deduct stock twice', () => {
  const inventory = [{ id: 'egg-row', name: 'eggs', status: 'fresh' as const, confidence: 'confirmed' as const, quantityValue: 4, unit: 'egg', quantityKnown: true }];
  const first = applyCookingTransaction(inventory, [], 'cook-monday-breakfast', [{ inventoryId: 'egg-row', quantity: 2, unit: 'egg' }]);
  const second = applyCookingTransaction(first.inventory, first.completedTransactionIds, 'cook-monday-breakfast', [{ inventoryId: 'egg-row', quantity: 2, unit: 'egg' }]);
  assert.equal(first.applied, true);
  assert.equal(first.inventory[0]?.quantityValue, 2);
  assert.equal(second.applied, false);
  assert.equal(second.inventory[0]?.quantityValue, 2);
  assert.deepEqual(second.completedTransactionIds, ['cook-monday-breakfast']);
});

test('planned servings drive readiness and shopping demand independently of current defaults', () => {
  const inventory = [{ id: 'egg-row', name: 'eggs', quantityValue: 4, unit: 'egg', quantityKnown: true, status: 'fresh' as const, confidence: 'confirmed' as const }];
  const plan = [{ id: 'monday-breakfast', recipeId: 'eggs-only', servings: 2 }];
  const reservations = buildReservations(plan, [eggsOnlyRecipe], inventory).reservations;
  assert.equal(recipeReadiness(eggsOnlyRecipe, inventory, [], 2, reservations, 'monday-breakfast').ready, true);
  assert.equal(calculateShoppingNeeds(plan, [eggsOnlyRecipe], inventory, 1, reservations).length, 0);
  assert.equal(calculateShoppingNeeds([{ ...plan[0], servings: 3 }], [eggsOnlyRecipe], inventory, 1).find((item) => item.normalizedName === 'egg')?.quantity, 2);
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

test('new-user defaults keep all built-in recipes discoverable', () => {
  assert.deepEqual(defaultPreferences.cuisines, []);
  for (const recipe of recipes) {
    assert.equal(recipeMatchesPreferences(recipe, defaultPreferences), true, recipe.id);
  }
});

test('v1 migration preserves inventory, preferences, and multiple planned meals', () => {
  const migrated = migrateV1KitchenState(JSON.stringify({
    ingredients: [
      { id: 'old-eggs', name: 'eggs', location: 'Refrigerator', quantity: '2 eggs', status: 'fresh' },
      { id: 'old-spinach', name: 'spinach', location: 'Refrigerator', quantity: '1 bag', status: 'low' },
      { id: 'old-flour', name: 'flour', location: 'Pantry', status: 'fresh' },
    ],
    preferences: {
      servings: 4,
      allergies: ['peanuts'],
      dietaryRestrictions: ['vegetarian'],
      dislikes: ['cilantro'],
      cuisines: ['Mediterranean'],
      skill: 'Beginner',
      cookTime: 30,
      equipment: ['Stovetop'],
      nutrition: ['More vegetables'],
    },
    plan: [
      { id: 'Monday-Breakfast', day: 'Monday', meal: 'Breakfast', recipeId: 'green-egg-toast' },
      { id: 'Tuesday-Dinner', day: 'Tuesday', meal: 'Dinner', recipeId: 'tomato-pasta' },
    ],
  }), defaultPreferences);
  assert.equal(migrated.ingredients.find((item) => item.id === 'old-eggs')?.quantityValue, 2);
  assert.equal(migrated.ingredients.find((item) => item.id === 'old-flour')?.quantityKnown, false);
  assert.deepEqual(migrated.preferences.allergies, ['peanuts']);
  assert.equal(migrated.plan.length, 2);
  assert.deepEqual(migrated.plan.map((meal) => meal.servings), [4, 4]);
  assert.equal(migrateV1KitchenState(JSON.stringify(migrated), defaultPreferences).plan[0]?.servings, 4);
});