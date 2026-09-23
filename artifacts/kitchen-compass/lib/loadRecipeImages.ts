import { findRecipeImages } from '@workspace/api-client-react';
import type { Recipe } from '@/data/recipes';
import { recipeVersion, recipesNeedingImages } from '@/lib/recipeDiscovery';
import { saveGeneratedRecipeImage } from '@/lib/recipeImages';

export async function loadRecipeImages(
  recipes: Recipe[],
  saveImage: (version: string, image: string, source: 'TheMealDB' | 'AI-generated') => void,
) {
  const missing = recipesNeedingImages(recipes);
  if (!missing.length) return 0;
  let saved = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125_000);
  try {
    const response = await findRecipeImages(missing.map((recipe) => ({
      recipeVersion: recipeVersion(recipe),
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients.map((ingredient) => ingredient.name),
    })), controller.signal);
    for (const result of response.images) {
      try {
        if (result.source === 'TheMealDB' && result.imageUrl?.startsWith('https://')) {
          saveImage(result.recipeVersion, result.imageUrl, result.source);
          saved += 1;
        } else if (result.source === 'AI-generated' && result.imageBase64) {
          saveImage(result.recipeVersion, saveGeneratedRecipeImage(result.recipeVersion, result.imageBase64), result.source);
          saved += 1;
        }
      } catch {
        // An image failure does not discard the validated recipe.
      }
    }
    return saved;
  } finally {
    clearTimeout(timeout);
  }
}
