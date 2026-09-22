import { recipes, type Recipe } from '@/data/recipes';
import type { PlannedMeal } from '@/context/KitchenContext';
import { mergeRecipes, recipeVersion } from '@/lib/recipeDiscovery';

export function getAvailableRecipes(savedRecipes: Recipe[]) {
  return mergeRecipes(recipes, savedRecipes);
}

export function lookupRecipe(
  recipeId: string | undefined,
  savedRecipes: Recipe[],
  expectedVersion?: string,
) {
  if (!recipeId) return undefined;
  const candidates = getAvailableRecipes(savedRecipes).filter((recipe) => recipe.id === recipeId);
  if (expectedVersion) return candidates.find((recipe) => recipeVersion(recipe) === expectedVersion);
  return candidates[0];
}

export function lookupPlannedRecipe(plannedMeal: Pick<PlannedMeal, 'recipeId' | 'recipeVersion'> | undefined, savedRecipes: Recipe[]) {
  return plannedMeal ? lookupRecipe(plannedMeal.recipeId, savedRecipes, plannedMeal.recipeVersion) : undefined;
}