import type { Ingredient } from '@/context/KitchenContext';

export const MAX_PUBLISHED_SEARCH_INGREDIENTS = 30;
export const MAX_PUBLISHED_SEARCH_ANCHORS = 10;

const commonSeasonings = new Set([
  'salt',
  'pepper',
  'black pepper',
  'white pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'sugar',
]);

export type PublishedSearchIngredient = Pick<
  Ingredient,
  'id' | 'name' | 'location' | 'status' | 'confidence' | 'quantityKnown' | 'quantityValue' | 'source'
>;

function normalizeIngredient(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized.endsWith('s') && !normalized.endsWith('ss') ? normalized.slice(0, -1) : normalized;
}

function isConfirmedAvailable(ingredient: PublishedSearchIngredient) {
  if (ingredient.status === 'used' || ingredient.confidence !== 'confirmed') return false;
  if (typeof ingredient.name !== 'string') return false;
  const name = normalizeIngredient(ingredient.name);
  return Boolean(name) && ingredient.name.trim().length <= 80;
}

function isSearchAnchor(ingredient: PublishedSearchIngredient) {
  return isConfirmedAvailable(ingredient) && !commonSeasonings.has(normalizeIngredient(ingredient.name));
}

function scoreIngredient(ingredient: PublishedSearchIngredient) {
  let score = 0;
  if (ingredient.quantityKnown === true || (typeof ingredient.quantityValue === 'number' && ingredient.quantityValue > 0)) score += 3;
  if (ingredient.source === 'manual' || ingredient.source === 'scan') score += 2;
  if (ingredient.status === 'fresh') score += 1;
  return score;
}

export function rankPublishedSearchIngredients(ingredients: readonly PublishedSearchIngredient[]) {
  const seenNames = new Set<string>();
  return ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => isSearchAnchor(ingredient))
    .filter(({ ingredient }) => {
      const name = normalizeIngredient(ingredient.name);
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .sort((left, right) => scoreIngredient(right.ingredient) - scoreIngredient(left.ingredient) || left.index - right.index)
    .map(({ ingredient }) => ingredient);
}

export function buildPublishedRecipeSearch(
  ingredients: readonly PublishedSearchIngredient[],
  selectedIds: readonly string[] = [],
) {
  const ranked = rankPublishedSearchIngredients(ingredients);
  const selected = new Set(selectedIds);
  const pinned = selectedIds
    .map((id) => ranked.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is PublishedSearchIngredient => Boolean(ingredient));
  const automatic = ranked.filter((ingredient) => !selected.has(ingredient.id));
  const anchors = [...pinned, ...automatic].slice(0, MAX_PUBLISHED_SEARCH_ANCHORS);
  const anchorNames = new Set(anchors.map((ingredient) => normalizeIngredient(ingredient.name)));
  const seenNames = new Set<string>();
  const pantry = ingredients
    .filter(isConfirmedAvailable)
    .filter((ingredient) => {
      const name = normalizeIngredient(ingredient.name);
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    });
  const orderedPantry = [
    ...anchors,
    ...pantry.filter((ingredient) => !anchorNames.has(normalizeIngredient(ingredient.name))),
  ]
    .slice(0, MAX_PUBLISHED_SEARCH_INGREDIENTS)
    .map((ingredient) => ingredient.name.trim());
  return {
    anchors: anchors.map((ingredient) => ingredient.name.trim()),
    ingredients: orderedPantry,
  };
}