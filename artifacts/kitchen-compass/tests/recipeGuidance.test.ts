import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require.extensions['.jpg'] = () => undefined;

const { celsiusFromFahrenheit, getRecipe, recipes, scaledIngredient } = require('../data/recipes') as typeof import('../data/recipes');

test('every curated recipe has ordered, beginner-complete primary steps', () => {
  for (const recipe of recipes) {
    assert.ok(recipe.steps.length >= 3, recipe.id);
    assert.deepEqual(recipe.steps.map((step) => step.order), recipe.steps.map((_, index) => index + 1), recipe.id);
    for (const step of recipe.steps) {
      assert.ok(step.body.length > 40, `${recipe.id}:${step.title}`);
      assert.ok(step.ingredientAmounts?.length, `${recipe.id}:${step.title} ingredient amounts`);
      assert.ok(step.ingredientAmounts?.every((item) => item.quantity > 0 && item.unit), `${recipe.id}:${step.title} quantities`);
      assert.ok(step.cues.length > 0, `${recipe.id}:${step.title} sensory cue`);
      assert.ok(step.mistakes.length > 0, `${recipe.id}:${step.title} common mistake`);
    }
    assert.ok(recipe.servingSuggestions?.length, `${recipe.id} serving suggestions`);
    assert.ok(recipe.commonMistakes?.length, `${recipe.id} common mistakes`);
  }
});

test('step ingredient amounts scale with servings while durations stay unchanged', () => {
  const recipe = getRecipe('lemon-herb-chicken')!;
  const step = recipe.steps[2]!;
  const chicken = recipe.ingredients.find((item) => item.name === 'chicken breast')!;
  const scaled = scaledIngredient(recipe, chicken, 4);
  assert.equal(scaled.quantity, 4);
  assert.equal(step.duration, 20);
  assert.equal(recipe.steps[2]?.duration, 20);
});

test('temperature conversion produces rounded Celsius values from Fahrenheit', () => {
  assert.equal(celsiusFromFahrenheit(32), 0);
  assert.equal(celsiusFromFahrenheit(165), 74);
  assert.equal(celsiusFromFahrenheit(425), 218);
});

test('each alternative method is independently complete and ordered', () => {
  for (const recipe of recipes) {
    for (const method of recipe.methods ?? []) {
      assert.ok(method.title && method.description && method.equipment.length > 0, `${recipe.id}:${method.id} metadata`);
      assert.ok(method.steps.length >= 3, `${recipe.id}:${method.id} step count`);
      assert.deepEqual(method.steps.map((step) => step.order), method.steps.map((_, index) => index + 1), `${recipe.id}:${method.id} order`);
      assert.notDeepEqual(method.steps.map((step) => step.title), recipe.steps.map((step) => step.title), `${recipe.id}:${method.id} is a real alternative`);
      for (const step of method.steps) {
        assert.ok(step.ingredientAmounts?.length, `${recipe.id}:${method.id}:${step.title} amounts`);
        assert.ok(step.cues.length > 0, `${recipe.id}:${method.id}:${step.title} cue`);
      }
    }
  }
});

test('recipes without finished-dish images remain explicitly unavailable', () => {
  assert.equal(getRecipe('green-egg-toast')!.image, undefined);
  assert.equal(Boolean(getRecipe('lemon-herb-chicken')!.image), true);
  assert.equal(Boolean(getRecipe('tomato-basil-pasta')!.image), true);
});