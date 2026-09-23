import type { ExternalRecipe } from '@workspace/api-client-react';
import type { Recipe } from '@/data/recipes';
import { recipeTitleKey, recipeVersion } from '@/lib/recipeDiscovery';

export type ArchivedRecipe = {
  key: string;
  title: string;
  archivedAt: string;
  recipeVersion?: string;
  externalRecipe?: ExternalRecipe;
};

export function archiveKey(title: string) {
  return recipeTitleKey({ title });
}

export function isArchivedRecipe(recipe: Pick<Recipe, 'title' | 'sourceVersion' | 'recipeVersion'>, archived: ArchivedRecipe[]) {
  return archived.some((entry) => entry.key === archiveKey(recipe.title) || entry.recipeVersion === recipeVersion(recipe));
}

export function isArchivedPublished(recipe: Pick<ExternalRecipe, 'id' | 'title'>, archived: ArchivedRecipe[]) {
  return archived.some((entry) => entry.key === archiveKey(recipe.title) || entry.externalRecipe?.id === recipe.id);
}

export function archiveLocalRecipe(archived: ArchivedRecipe[], recipe: Recipe, archivedAt = new Date().toISOString()) {
  const key = archiveKey(recipe.title);
  if (!key || archived.some((entry) => entry.key === key)) return archived;
  return [...archived, { key, title: recipe.title, recipeVersion: recipeVersion(recipe), archivedAt }];
}

export function archivePublishedRecipe(archived: ArchivedRecipe[], recipe: ExternalRecipe, archivedAt = new Date().toISOString()) {
  const key = archiveKey(recipe.title);
  if (!key || archived.some((entry) => entry.key === key)) return archived;
  return [...archived, { key, title: recipe.title, externalRecipe: recipe, archivedAt }];
}

export function restoreArchivedRecipe(archived: ArchivedRecipe[], key: string) {
  return archived.filter((entry) => entry.key !== key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function parseExternalRecipe(value: unknown): ExternalRecipe | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string'
    || value.provider !== 'TheMealDB' || typeof value.sourceUrl !== 'string'
    || !value.sourceUrl.startsWith('https://') || typeof value.instructions !== 'string'
    || value.safetyVerified !== false || !Array.isArray(value.ingredients)
    || !value.ingredients.every((item) => isRecord(item) && typeof item.name === 'string' && typeof item.measure === 'string')
    || !Array.isArray(value.matchedIngredients) || !value.matchedIngredients.every((item) => typeof item === 'string')
    || !Array.isArray(value.missingIngredients) || !value.missingIngredients.every((item) => typeof item === 'string')) return undefined;
  return {
    id: value.id,
    title: value.title,
    provider: 'TheMealDB',
    sourceUrl: value.sourceUrl,
    ...(typeof value.imageUrl === 'string' && value.imageUrl.startsWith('https://') ? { imageUrl: value.imageUrl } : {}),
    ingredients: value.ingredients as ExternalRecipe['ingredients'],
    instructions: value.instructions,
    matchedIngredients: value.matchedIngredients as string[],
    missingIngredients: value.missingIngredients as string[],
    safetyVerified: false,
  };
}

export function parseArchivedRecipes(value: unknown): ArchivedRecipe[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()) return [];
    const key = archiveKey(item.title);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const externalRecipe = parseExternalRecipe(item.externalRecipe);
    return [{
      key,
      title: item.title.trim(),
      archivedAt: typeof item.archivedAt === 'string' ? item.archivedAt : '',
      ...(typeof item.recipeVersion === 'string' ? { recipeVersion: item.recipeVersion } : {}),
      ...(externalRecipe && archiveKey(externalRecipe.title) === key ? { externalRecipe } : {}),
    }];
  });
}
