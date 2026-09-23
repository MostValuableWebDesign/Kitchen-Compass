import type { DiscoveredRecipe, RecipeDiscoveryFilters, RecipeDiscoveryInventory, RecipeDiscoveryPreferences } from '@workspace/api-client-react';
import type { HealthScoreCalculation, NutritionCalculation } from '@workspace/recipe-calculations';
import type { Recipe } from '@/data/recipes';
import { ingredientIdentitiesMatch, recipeMatchesPreferences, recipeReadiness, type InventoryCandidate, type RecipePreferenceInput, type ReservationRecord } from '@/lib/kitchenLogic';

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

export function recipeTitleKey(recipe: Pick<Recipe, 'title'>) {
  return recipe.title.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function novelRecipes(existing: Recipe[], candidates: Recipe[]) {
  const versions = new Set(existing.map(recipeVersion));
  const titles = new Set(existing.map(recipeTitleKey));
  return candidates.filter((recipe) => {
    const version = recipeVersion(recipe);
    const title = recipeTitleKey(recipe);
    if (versions.has(version) || titles.has(title)) return false;
    versions.add(version);
    titles.add(title);
    return true;
  });
}

export function recipesNeedingImages(recipes: Recipe[]) {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const version = recipeVersion(recipe);
    if (recipe.image || seen.has(version)) return false;
    seen.add(version);
    return true;
  }).slice(0, 8);
}

export function matchingSavedRecipes(
  saved: Recipe[],
  inventory: InventoryCandidate[],
  preferences: RecipePreferenceInput & { servings: number },
  filters: RecipeFilterState,
  reservations: ReservationRecord[],
) {
  return saved.filter((recipe) => {
    if (recipe.source !== 'server-ai' || !recipeMatchesPreferences(recipe, {
      ...preferences,
      dietaryRestrictions: filters.dietaryPreference
        ? [...preferences.dietaryRestrictions, filters.dietaryPreference]
        : preferences.dietaryRestrictions,
    })) return false;
    if (filters.mealType !== 'Any' && recipe.meal !== filters.mealType) return false;
    if (filters.cuisine.trim() && !recipe.cuisine.toLowerCase().includes(filters.cuisine.trim().toLowerCase())) return false;
    if (filters.maxMinutes !== undefined && recipe.prep + recipe.cook > filters.maxMinutes) return false;
    if (filters.equipment && !recipe.equipment.includes(filters.equipment)) return false;
    if (filters.minHealthScore !== undefined && (recipe.healthScore.score === undefined || recipe.healthScore.score < filters.minHealthScore)) return false;
    const readiness = recipeReadiness(recipe, inventory, preferences.allergies, preferences.servings, reservations);
    return readiness.missingIngredients.length <= 2
      && (!inventory.length || recipe.ingredients.some((item) => inventory.some((stock) => ingredientIdentitiesMatch(item.name, stock))));
  });
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
    equipment: recipe.equipment ?? [],
    healthScore: recipe.healthScore as HealthScoreCalculation,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      amount: `${ingredient.quantity} ${ingredient.unit}`,
    })),
    nutrition: recipe.nutrition as NutritionCalculation,
    steps: recipe.steps.map((step, index) => ({
      ...step,
      order: step.order ?? index + 1,
      ingredients: step.ingredients ?? [],
      cues: step.cues ?? [],
      mistakes: step.mistakes ?? [],
    })),
    allergens: recipe.allergens,
    allergenInfo: recipe.allergenInfo,
    sourceVersion: recipe.recipeVersion,
    recipeVersion: recipe.recipeVersion,
    source: 'server-ai',
    storageInstructions: recipe.storageInstructions,
    reheatingInstructions: recipe.reheatingInstructions,
    servingSuggestions: recipe.servingSuggestions,
    commonMistakes: recipe.commonMistakes,
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
  const nutrition = nutritionRecord !== null
    && (nutritionRecord.status === 'calculated' || nutritionRecord.status === 'insufficient-information')
    && Array.isArray(nutritionRecord.coveredIngredients)
    && Array.isArray(nutritionRecord.uncoveredIngredients)
    && typeof nutritionRecord.ingredientCoverage === 'number'
    && isRecord(nutritionRecord.source)
    && typeof nutritionRecord.source.id === 'string'
    && typeof nutritionRecord.source.label === 'string';
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
    isRecord(item)
    && typeof item.order === 'number'
    && typeof item.title === 'string'
    && typeof item.body === 'string'
    && Array.isArray(item.ingredients)
    && Array.isArray(item.ingredientAmounts)
    && Array.isArray(item.cues)
    && Array.isArray(item.mistakes),
  );
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.sourceVersion === 'string'
    && typeof value.recipeVersion === 'string'
    && ingredients
    && steps
    && Array.isArray(value.allergens)
    && (value.allergenInfo === 'complete' || (value.source === 'published' && value.allergenInfo === 'incomplete'))
    && nutrition
    && isRecord(value.healthScore)
    && (value.healthScore.status === 'calculated' || value.healthScore.status === 'insufficient-information')
    && nutrition
    && (value.source === 'server-ai' || value.source === 'published' || value.source === 'curated' || value.source === undefined)
    && (value.sourceUrl === undefined || typeof value.sourceUrl === 'string');
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
  excludeRecipeTitles: string[] = [],
  excludeArchivedRecipeTitles: string[] = [],
): {
  inventory: RecipeDiscoveryInventory[];
  preferences: RecipeDiscoveryPreferences;
  filters: RecipeDiscoveryFilters;
  variationSeed: string;
  excludeRecipeVersions: string[];
  excludeRecipeTitles: string[];
  excludeArchivedRecipeTitles: string[];
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
    excludeRecipeTitles,
    excludeArchivedRecipeTitles,
  };
}
