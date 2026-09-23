import type { ExternalRecipe } from '@workspace/api-client-react';
import type { Recipe, RecipeIngredient } from '@/data/recipes';

function parseNumber(value: string) {
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = value.match(/^(\d+)\/(\d+)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = value.match(/^\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : 1;
}

function mapIngredient(name: string, measure: string): RecipeIngredient {
  const amount = measure.trim() || 'As needed';
  const numericPrefix = amount.match(/^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)?.[0] ?? '';
  const unit = amount.slice(numericPrefix.length).trim() || 'portion';
  return {
    name,
    amount,
    quantity: Math.max(0.01, parseNumber(amount)),
    unit,
    required: true,
  };
}

function instructionSteps(instructions: string) {
  const sections = instructions
    .split(/\r?\n+/)
    .map((section) => section.replace(/^[\s▢•-]+/, '').trim())
    .filter(Boolean);
  const bodies = sections.length ? sections : [instructions.trim()];
  return bodies.map((body, index) => ({
    order: index + 1,
    title: `Source step ${index + 1}`,
    body,
    ingredients: [],
    ingredientAmounts: [],
    cues: [],
    mistakes: [],
  }));
}

export function mapPublishedRecipe(recipe: ExternalRecipe): Recipe {
  const version = publishedRecipeVersion(recipe.id);
  const ingredients = recipe.ingredients.map((ingredient) => mapIngredient(ingredient.name, ingredient.measure));
  return {
    id: `published-${recipe.id}`,
    title: recipe.title,
    description: 'Published recipe from TheMealDB. Check the original source for serving yield, timing, equipment, safety temperatures, and preparation details.',
    cuisine: 'Published source',
    meal: 'Any meal',
    servings: 1,
    prep: 0,
    cook: 0,
    difficulty: 'Source recipe',
    equipment: [],
    healthScore: {
      status: 'insufficient-information',
      note: 'The published source does not provide enough verified data for a health score.',
      factors: [],
    },
    ...(recipe.imageUrl ? { image: recipe.imageUrl, imageSource: 'TheMealDB' as const } : {}),
    ingredients,
    nutrition: {
      status: 'insufficient-information',
      coveredIngredients: [],
      uncoveredIngredients: ingredients.map((ingredient) => ingredient.name),
      ingredientCoverage: 0,
      source: {
        id: 'published-source-unverified',
        label: 'Published source quantities have not been normalized or independently verified.',
      },
    },
    steps: instructionSteps(recipe.instructions),
    allergens: [],
    allergenInfo: 'incomplete',
    sourceVersion: version,
    recipeVersion: version,
    source: 'published',
    sourceUrl: recipe.sourceUrl,
    storageInstructions: 'Storage guidance was not verified. Check the original recipe and use standard food-safety guidance.',
    reheatingInstructions: 'Reheating guidance was not verified. Reheat leftovers to a safe temperature for the food.',
    servingSuggestions: ['Check the original published recipe before cooking.'],
    commonMistakes: ['Do not rely on this imported copy for allergen safety or required cooking temperatures.'],
  };
}

export function publishedRecipeVersion(id: string) {
  return `themealdb:${id}`;
}