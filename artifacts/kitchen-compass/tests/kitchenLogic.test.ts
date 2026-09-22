import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShoppingNeeds,
  ingredientIdentitiesMatch,
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
  assert.equal(recipeReadiness(recipe, [{ name: 'eggs', status: 'fresh', confidence: 'confirmed' }], []).ready, true);
});

test('allergy conflicts exclude recipes and incomplete information is never safe', () => {
  const recipe = { ingredients: [{ name: 'eggs', required: true }], allergens: ['egg'], allergenInfo: 'complete' as const };
  assert.deepEqual(recipeReadiness(recipe, [], ['eggs']), { ready: false, allergenConflict: true, allergenIncomplete: false });
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
    [{ recipeId: 'green-egg-toast' }, { recipeId: 'green-egg-toast' }],
    [greenEggToast],
    [{ name: 'eggs', quantityValue: 2, unit: 'egg', quantityKnown: true, status: 'fresh', confidence: 'confirmed' }],
    2,
  );
  const eggs = needs.find((item) => item.normalizedName === 'egg');
  assert.deepEqual(eggs, {
    id: 'egg',
    name: 'eggs',
    normalizedName: 'egg',
    quantity: 6,
    unit: 'egg',
    quantityCheckNeeded: false,
    category: 'Dairy & eggs',
  });

  const unknown = calculateShoppingNeeds([{ recipeId: 'green-egg-toast' }], [greenEggToast], [{ name: 'eggs', status: 'fresh', confidence: 'confirmed', quantityKnown: false }], 1);
  assert.equal(unknown.find((item) => item.normalizedName === 'egg')?.quantityCheckNeeded, true);
});