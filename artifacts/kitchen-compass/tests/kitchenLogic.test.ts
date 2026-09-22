import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShoppingNeeds,
  applyCookingTransaction,
  buildReservations,
  deductInventory,
  ingredientIdentitiesMatch,
  ingredientRowsMatch,
  confirmedDateStatus,
  consumeLeftover,
  movePlannedMeals,
  normalizeConfirmedDate,
  parseQuantityText,
  replacePlanSlots,
  rankPlanRecipes,
  recipeMatchesPreferences,
  recipeHasAllergyConflict,
  recipeAvailabilityLabel,
  recipeReadiness,
  scaleNutrition,
  scaleQuantity,
} from '../lib/kitchenLogic';
import { defaultPreferences, migrateV1KitchenState } from '../lib/kitchenPersistence';
import { calculateHealthScore, calculateRecipeNutrition } from '@workspace/recipe-calculations';

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

test('ingredient aliases detect common allergens even when AI metadata is wrong', () => {
  const aliases = [
    ['peanut butter', 'peanut'],
    ['milk', 'milk'],
    ['bread', 'wheat'],
    ['flour', 'wheat'],
    ['tofu', 'soy'],
    ['tahini', 'sesame'],
    ['salmon', 'fish'],
    ['shrimp', 'shellfish'],
    ['eggs', 'egg'],
    ['almond meal', 'tree nut'],
  ] as const;
  for (const [ingredient, allergy] of aliases) {
    assert.equal(recipeHasAllergyConflict({
      ingredients: [{ name: ingredient }],
      allergens: [],
      allergenInfo: 'complete',
    }, [allergy]), true, `${ingredient} should conflict with ${allergy}`);
  }
  assert.equal(recipeHasAllergyConflict({
    ingredients: [{ name: 'peanut butter' }],
    allergens: ['tree nut'],
    allergenInfo: 'complete',
  }, ['peanut']), true);
});

test('unknown ingredients are not allergy-safe or ready for a user with allergies', () => {
  const result = recipeReadiness({
    servings: 1,
    ingredients: [{ name: 'mystery sauce', quantity: 1, unit: 'tbsp', required: true }],
    allergens: [],
    allergenInfo: 'complete',
  }, [{ name: 'mystery sauce', status: 'fresh', confidence: 'confirmed', quantityValue: 1, unit: 'tbsp', quantityKnown: true }], ['peanut']);
  assert.equal(result.allergenConflict, false);
  assert.equal(result.allergenIncomplete, true);
  assert.equal(result.ready, false);
});

test('known safe ingredients remain ready and saved recipes are rechecked after allergies change', () => {
  const recipe = {
    servings: 1,
    ingredients: [{ name: 'spinach', quantity: 1, unit: 'cup', required: true }],
    allergens: [],
    allergenInfo: 'complete' as const,
  };
  const inventory = [{ name: 'spinach', status: 'fresh' as const, confidence: 'confirmed' as const, quantityValue: 1, unit: 'cup', quantityKnown: true }];
  assert.equal(recipeReadiness(recipe, inventory, ['peanut']).ready, true);
  const savedRecipe = { ...recipe, ingredients: [{ name: 'peanut butter', quantity: 1, unit: 'tbsp', required: true }] };
  const savedInventory = [{ ...inventory[0], name: 'peanut butter' }];
  assert.equal(recipeReadiness(savedRecipe, savedInventory, []).ready, true);
  assert.equal(recipeReadiness(savedRecipe, savedInventory, ['peanut']).allergenConflict, true);
  assert.equal(recipeReadiness(savedRecipe, savedInventory, ['peanut']).ready, false);
});

test('substitutions are checked for the current user allergy as well as ingredients', () => {
  assert.equal(recipeHasAllergyConflict({
    ingredients: [{ name: 'spinach' }],
    substitutions: [{ to: 'peanut butter' }],
    allergens: [],
    allergenInfo: 'complete',
  }, ['peanut']), true);
});

test('readiness labels distinguish safe, missing, insufficient, and unknown quantities', () => {
  const base = { servings: 1, allergens: [], allergenInfo: 'complete' as const, ingredients: [{ name: 'eggs', quantity: 2, unit: 'egg', required: true }] };
  assert.equal(recipeAvailabilityLabel(recipeReadiness(base, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 2, unit: 'egg', quantityKnown: true }], [])), 'Ready to cook');
  assert.equal(recipeAvailabilityLabel(recipeReadiness(base, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 1, unit: 'egg', quantityKnown: true }], [])), 'Not enough quantity');
  assert.equal(recipeAvailabilityLabel(recipeReadiness(base, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityKnown: false }], [])), 'Check quantities');
  assert.equal(recipeAvailabilityLabel(recipeReadiness(base, [], [])), 'Almost ready');
  assert.equal(recipeAvailabilityLabel(recipeReadiness({ ...base, allergens: ['egg'] }, [], ['egg'])), 'Not safe');
});

test('ingredient matching uses normalized identities, not broad substrings', () => {
  assert.equal(ingredientIdentitiesMatch('eggs', { name: 'egg carton', status: 'fresh', confidence: 'confirmed' }), false);
  assert.equal(ingredientIdentitiesMatch('eggs', { name: 'eggs', status: 'fresh', confidence: 'confirmed' }), true);
});

test('unsupported quantities remain unknown while supported quantities are normalized', () => {
  assert.deepEqual(parseQuantityText('2 eggs'), { quantityValue: 2, unit: 'egg', quantityKnown: true });
  assert.equal(parseQuantityText('1 bag').quantityKnown, false);
  assert.equal(parseQuantityText('a handful').quantityKnown, false);
  assert.equal(parseQuantityText('1 handful').quantityKnown, true);
});

test('duplicate protection matches name and location, allowing separate rows by location', () => {
  const refrigeratorEggs = { name: 'Eggs', location: 'Refrigerator' };
  assert.equal(ingredientRowsMatch(refrigeratorEggs, { name: 'eggs', location: 'Refrigerator' }), true);
  assert.equal(ingredientRowsMatch(refrigeratorEggs, { name: 'eggs', location: 'Pantry' }), false);
});

test('date warnings use only valid user-confirmed dates and never infer a warning', () => {
  const now = Date.UTC(2026, 8, 22, 12);
  assert.equal(normalizeConfirmedDate('2026-09-25'), '2026-09-25');
  assert.equal(normalizeConfirmedDate('2026-02-30'), undefined);
  assert.equal(confirmedDateStatus(undefined, now), null);
  assert.equal(confirmedDateStatus('2026-09-30', now), null);
  assert.equal(confirmedDateStatus('2026-09-25', now), 'soon');
  assert.equal(confirmedDateStatus('2026-09-21', now), 'expired');
});

test('one-serving Green Egg Toast scales to two servings', () => {
  assert.equal(scaleQuantity(2, 1, 2), 4);
  assert.equal(scaleQuantity(0.5, 1, 2), 1);
  assert.deepEqual(scaleNutrition({ calories: 340, protein: 17 }, 1, 2), { calories: 680, protein: 34 });
});

test('nutrition is calculated from ingredient quantities and exposes per-serving values', () => {
  const ingredients = [
    { name: 'eggs', quantity: 2, unit: 'egg' },
    { name: 'avocado', quantity: 0.5, unit: 'fruit' },
    { name: 'bread', quantity: 1, unit: 'slice' },
  ];
  const nutrition = calculateRecipeNutrition(ingredients, 1);
  const twoServings = calculateRecipeNutrition(ingredients, 2);
  assert.equal(nutrition.status, 'calculated');
  assert.equal(nutrition.ingredientCoverage, 1);
  assert.equal(nutrition.perServing?.calories, 384);
  assert.equal(nutrition.total?.addedSugar, 1.4);
  assert.equal(nutrition.source.id, 'bundled-ingredient-reference-v1');
  assert.equal(twoServings.total?.calories, nutrition.total?.calories);
  assert.equal(twoServings.perServing?.calories, 192);
});

test('unsupported or missing reference data is insufficient, not a guessed number', () => {
  const nutrition = calculateRecipeNutrition([
    { name: 'spinach', quantity: 1, unit: 'cup' },
  ], 2);
  assert.equal(nutrition.status, 'insufficient-information');
  assert.equal(nutrition.perServing, undefined);
  assert.deepEqual(nutrition.uncoveredIngredients, ['spinach']);
  assert.equal(calculateHealthScore(nutrition).status, 'insufficient-information');
});

test('health score uses all six documented factors and keeps allergy safety separate', () => {
  const nutrition = calculateRecipeNutrition([
    { name: 'eggs', quantity: 2, unit: 'egg' },
    { name: 'broccoli', quantity: 2, unit: 'cup' },
    { name: 'olive oil', quantity: 1, unit: 'tbsp' },
  ], 1);
  const score = calculateHealthScore(nutrition);
  assert.equal(score.status, 'calculated');
  assert.deepEqual(score.factors.map((factor) => factor.key), ['vegetables', 'fiber', 'protein', 'sodium', 'added-sugar', 'saturated-fat']);
  assert.equal(score.factors.some((factor) => factor.direction === 'positive'), true);
  assert.equal(score.factors.some((factor) => factor.direction === 'negative'), true);
  assert.equal(score.score !== undefined, true);
  // Allergy conflict is evaluated by recipeReadiness, not by the general-health rubric.
  assert.equal(recipeReadiness({ ...eggsOnlyRecipe, allergens: ['egg'] }, [], ['egg']).allergenConflict, true);
  assert.equal(calculateHealthScore(nutrition).score, score.score);
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

test('moving a meal swaps occupied slots without losing either choice', () => {
  const plan = [
    { id: 'monday-dinner', day: 'Monday', meal: 'Dinner' as const, recipeId: 'eggs-only', servings: 1 },
    { id: 'tuesday-lunch', day: 'Tuesday', meal: 'Lunch' as const, recipeId: 'green-egg-toast', servings: 2 },
  ];
  const moved = movePlannedMeals(plan, { day: 'Monday', meal: 'Dinner' }, { day: 'Tuesday', meal: 'Lunch' });
  assert.equal(moved.find((item) => item.id === 'monday-dinner')?.day, 'Tuesday');
  assert.equal(moved.find((item) => item.id === 'monday-dinner')?.meal, 'Lunch');
  assert.equal(moved.find((item) => item.id === 'tuesday-lunch')?.day, 'Monday');
  assert.equal(moved.find((item) => item.id === 'tuesday-lunch')?.meal, 'Dinner');
});

test('partial regeneration replaces selected slots and preserves other saved choices', () => {
  const plan = [
    { id: 'monday-breakfast', day: 'Monday', meal: 'Breakfast' as const, recipeId: 'eggs-only', servings: 1 },
    { id: 'tuesday-dinner', day: 'Tuesday', meal: 'Dinner' as const, recipeId: 'green-egg-toast', servings: 2 },
  ];
  const next = replacePlanSlots(
    plan,
    [{ day: 'Monday', meal: 'Breakfast' }],
    [{ ...plan[0], recipeId: 'green-egg-toast' }],
  );
  assert.equal(next.find((item) => item.day === 'Monday' && item.meal === 'Breakfast')?.recipeId, 'green-egg-toast');
  assert.equal(next.find((item) => item.day === 'Tuesday' && item.meal === 'Dinner')?.recipeId, 'green-egg-toast');
  assert.equal(next.length, 2);
});

test('recipe ranking prefers safe, available, soon-to-expire kitchen ingredients', () => {
  const ranked = rankPlanRecipes(
    [
      {
        id: 'ready-soon',
        meal: 'Dinner',
        servings: 1,
        cook: 20,
        equipment: ['Stovetop'],
        cuisine: 'Any',
        difficulty: 'Easy',
        allergens: [],
        allergenInfo: 'complete' as const,
        ingredients: [{ name: 'eggs', quantity: 1, unit: 'egg', required: true }],
      },
      {
        id: 'missing',
        meal: 'Dinner',
        servings: 1,
        cook: 20,
        equipment: ['Stovetop'],
        cuisine: 'Any',
        difficulty: 'Easy',
        allergens: [],
        allergenInfo: 'complete' as const,
        ingredients: [{ name: 'chicken', quantity: 1, unit: 'piece', required: true }],
      },
    ],
    [{ id: 'egg-row', name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityValue: 1, unit: 'egg', quantityKnown: true, dateConfirmed: true, expires: '2026-09-25' }],
    { ...defaultPreferences, cookTime: 45, equipment: ['Stovetop'], nutrition: [] },
    1,
  );
  assert.equal(ranked[0]?.recipe.id, 'ready-soon');
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

test('leftover meals do not reserve or shop for the original raw ingredients', () => {
  const leftoverPlan = [{ id: 'monday-lunch', recipeId: 'green-egg-toast', servings: 1, leftoverId: 'leftover-1' }];
  const inventory = [{ id: 'egg-row', name: 'eggs', status: 'fresh' as const, confidence: 'confirmed' as const, quantityValue: 2, unit: 'egg', quantityKnown: true }];
  assert.deepEqual(buildReservations(leftoverPlan, [greenEggToast], inventory).reservations, []);
  assert.deepEqual(calculateShoppingNeeds(leftoverPlan, [greenEggToast], inventory, 1), []);
});

test('leftover consumption supports partial portions and removes the row at zero', () => {
  const starting = [{ id: 'leftover-1', portions: 3, recipeId: 'green-egg-toast' }];
  const partial = consumeLeftover(starting, 'leftover-1', 1);
  assert.equal(partial.consumed, true);
  assert.equal(partial.leftovers[0]?.portions, 2);
  const finished = consumeLeftover(partial.leftovers, 'leftover-1', 2);
  assert.equal(finished.consumed, true);
  assert.deepEqual(finished.leftovers, []);
  assert.equal(consumeLeftover(starting, 'leftover-1', 4).consumed, false);
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
  const builtInRecipeSummaries = [
    { id: 'lemon-herb-chicken', cuisine: 'Mediterranean', cook: 25, difficulty: 'Easy', equipment: ['Stovetop', 'Oven'], ingredients: [{ name: 'chicken' }], allergens: [], allergenInfo: 'complete' as const, nutritionTags: ['More vegetables'] },
    { id: 'tomato-basil-pasta', cuisine: 'Italian', cook: 18, difficulty: 'Easy', equipment: ['Stovetop'], ingredients: [{ name: 'pasta' }], allergens: ['wheat', 'milk'], allergenInfo: 'complete' as const, nutritionTags: ['More vegetables'] },
    { id: 'green-egg-toast', cuisine: 'Modern', cook: 8, difficulty: 'Easy', equipment: ['Stovetop'], ingredients: [{ name: 'eggs' }], allergens: ['egg', 'wheat'], allergenInfo: 'complete' as const, nutritionTags: ['More vegetables', 'More protein'] },
  ];
  for (const recipe of builtInRecipeSummaries) {
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