import type { DiscoveredRecipe, RecipeDiscoveryFilters, RecipeDiscoveryInventory, RecipeDiscoveryPreferences } from '@workspace/api-client-react';
import type { Recipe } from '@/data/recipes';

export type RecipeFilterState = {
  mealType: RecipeDiscoveryFilters['mealType'];
  cuisine: string;
  maxMinutes?: number;
  equipment?: string;
  dietaryPreference?: string;
  minHealthScore?: number;
};

export function recipeVersion(recipe: Pick<Recipe, 'sourceVersion' | 'recipeVersion'>) {
  return recipe.recipeVersion ?? recipe.sourceVersion;
}

export function mapDiscoveredRecipe(recipe: DiscoveredRecipe): Recipe {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    meal: recipe.mealType,
    servings: recipe.servings,
    prep: recipe.prepMinutes,
    cook: recipe.cookMinutes,
    difficulty: recipe.difficulty,
    equipment: recipe.equipment,
    score: recipe.healthScore,
    scoreNote: recipe.scoreNote,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      amount: `${ingredient.quantity} ${ingredient.unit}`,
    })),
    nutrition: recipe.nutrition,
    steps: recipe.steps,
    allergens: recipe.allergens,
    allergenInfo: recipe.allergenInfo,
    sourceVersion: recipe.recipeVersion,
    recipeVersion: recipe.recipeVersion,
    source: 'server-ai',
    nutritionProvenance: recipe.nutritionProvenance,
    nutritionSource: recipe.nutritionSource,
    storageInstructions: recipe.storageInstructions,
    reheatingInstructions: recipe.reheatingInstructions,
    dietaryTags: recipe.dietaryTags,
    dislikeTags: recipe.dislikeTags,
    nutritionTags: recipe.nutritionTags,
    substitutions: recipe.substitutions,
  };
}

export function mergeRecipes(curated: Recipe[], saved: Recipe[]) {
  const byVersion = new Map<string, Recipe>();
  [...curated, ...saved].forEach((recipe) => {
    const version = recipeVersion(recipe);
    if (!byVersion.has(version)) byVersion.set(version, recipe);
  });
  return [...byVersion.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isCacheableRecipe(value: unknown): value is Recipe {
  if (!isRecord(value)) return false;
  const nutritionRecord = isRecord(value.nutrition) ? value.nutrition : null;
  const nutrition = nutritionRecord !== null && ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium'].every((key) => {
    const amount = nutritionRecord[key];
    return typeof amount === 'number' && Number.isFinite(amount);
  });
  const ingredients = Array.isArray(value.ingredients) && value.ingredients.length > 0 && value.ingredients.every((item) =>
    isRecord(item)
    && typeof item.name === 'string'
    && typeof item.amount === 'string'
    && typeof item.quantity === 'number'
    && Number.isFinite(item.quantity)
    && item.quantity > 0
    && typeof item.unit === 'string'
    && typeof item.required === 'boolean',
  );
  const steps = Array.isArray(value.steps) && value.steps.length > 0 && value.steps.every((item) =>
    isRecord(item) && typeof item.title === 'string' && typeof item.body === 'string',
  );
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.sourceVersion === 'string'
    && typeof value.recipeVersion === 'string'
    && ingredients
    && steps
    && Array.isArray(value.allergens)
    && value.allergenInfo === 'complete'
    && nutrition
    && typeof value.nutritionSource === 'string'
    && (value.source === 'server-ai' || value.source === 'curated' || value.source === undefined);
}

export function parseCachedRecipes(value: unknown) {
  return Array.isArray(value) ? value.filter(isCacheableRecipe) : [];
}

export function buildRecipeDiscoveryRequest(
  inventory: RecipeDiscoveryInventory[],
  preferences: RecipeDiscoveryPreferences,
  filters: RecipeFilterState,
  variationSeed: string,
  excludeRecipeVersions: string[],
): {
  inventory: RecipeDiscoveryInventory[];
  preferences: RecipeDiscoveryPreferences;
  filters: RecipeDiscoveryFilters;
  variationSeed: string;
  excludeRecipeVersions: string[];
} {
  return {
    inventory,
    preferences,
    filters: {
      mealType: filters.mealType,
      ...(filters.cuisine.trim() ? { cuisine: filters.cuisine.trim() } : {}),
      ...(filters.maxMinutes ? { maxMinutes: filters.maxMinutes } : {}),
      ...(filters.equipment ? { equipment: [filters.equipment] } : {}),
      ...(filters.dietaryPreference ? { dietaryPreference: filters.dietaryPreference } : {}),
      ...(filters.minHealthScore !== undefined ? { minHealthScore: filters.minHealthScore } : {}),
    },
    variationSeed,
    excludeRecipeVersions,
  };
}