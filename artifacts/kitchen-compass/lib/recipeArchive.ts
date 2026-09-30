import type { ExternalRecipe } from '@workspace/api-client-react';
import type { Recipe } from '@/data/recipes';
import { recipeTitleKey, recipeVersion } from '@/lib/recipeDiscovery';

export type ArchivedRecipe = {
  key: string;
  title: string;
  archivedAt: string;
  recipeVersion?: string;
  externalRecipe?: ExternalRecipe;
  externalProvider?: 'FatSecret' | 'Spoonacular' | 'API Ninjas';
  externalId?: string;
};

export function archiveKey(title: string) {
  return recipeTitleKey({ title });
}

export function isArchivedRecipe(recipe: Pick<Recipe, 'title' | 'sourceVersion' | 'recipeVersion'>, archived: ArchivedRecipe[]) {
  return archived.some((entry) => entry.key === archiveKey(recipe.title) || entry.recipeVersion === recipeVersion(recipe));
}

export function isArchivedPublished(recipe: Pick<ExternalRecipe, 'id' | 'title'>, archived: ArchivedRecipe[]) {
  return archived.some((entry) => entry.key === archiveKey(recipe.title) || entry.externalRecipe?.id === recipe.id
    || (entry.externalProvider && (entry.externalId === recipe.id || archiveKey(entry.title) === archiveKey(recipe.title))));
}

export function archiveLocalRecipe(archived: ArchivedRecipe[], recipe: Recipe, archivedAt = new Date().toISOString()) {
  const key = archiveKey(recipe.title);
  if (!key || archived.some((entry) => entry.key === key)) return archived;
  return [...archived, { key, title: recipe.title, recipeVersion: recipeVersion(recipe), archivedAt }];
}

export function archivePublishedRecipe(archived: ArchivedRecipe[], recipe: ExternalRecipe, archivedAt = new Date().toISOString()) {
  if (recipe.provider === 'API Ninjas') {
    if (archived.some((entry) => entry.key === recipe.id)) return archived;
    return [...archived, { key: recipe.id, title: 'Archived API Ninjas recipe', externalProvider: recipe.provider, externalId: recipe.id, archivedAt }];
  }
  if (recipe.provider === 'FatSecret' || recipe.provider === 'Spoonacular') {
    const key = recipe.id;
    if (archived.some((entry) => entry.key === key)) return archived;
    const title = recipe.provider === 'Spoonacular' ? recipe.title : `${recipe.provider} recipe #${recipe.id.split(':')[1]}`;
    return [...archived, { key, title, externalProvider: recipe.provider, externalId: recipe.id, archivedAt }];
  }
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
  return value.flatMap((item): ArchivedRecipe[] => {
    if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()) return [];
    if (item.externalProvider === 'API Ninjas' && typeof item.externalId === 'string' && /^api-ninjas:[a-f0-9]{64}$/.test(item.externalId)) {
      if (seen.has(item.externalId)) return [];
      seen.add(item.externalId);
      return [{ key: item.externalId, title: 'Archived API Ninjas recipe', externalProvider: 'API Ninjas', externalId: item.externalId,
        archivedAt: typeof item.archivedAt === 'string' ? item.archivedAt : '' }];
    }
    const key = archiveKey(item.title);
    const onlineProvider = item.externalProvider === 'FatSecret' ? 'FatSecret' : item.externalProvider === 'Spoonacular' ? 'Spoonacular' : undefined;
    if (onlineProvider && typeof item.externalId === 'string'
      && new RegExp(`^${onlineProvider.toLowerCase()}:\\d+$`).test(item.externalId)) {
      if (seen.has(item.externalId)) return [];
      seen.add(item.externalId);
      return [{ key: item.externalId, title: onlineProvider === 'Spoonacular' ? item.title.trim() : `${onlineProvider} recipe #${item.externalId.split(':')[1]}`, externalProvider: onlineProvider, externalId: item.externalId,
        archivedAt: typeof item.archivedAt === 'string' ? item.archivedAt : '' }];
    }
    if (item.externalProvider || !key || seen.has(key)) return [];
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
