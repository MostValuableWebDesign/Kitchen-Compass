import type { Ingredient } from '@/context/KitchenContext';

export const MAX_PUBLISHED_SEARCH_INGREDIENTS = 64;
export const MAX_PUBLISHED_SEARCH_ANCHORS = 30;

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
  'id' | 'name' | 'location' | 'status' | 'confidence' | 'quantityKnown' | 'quantityValue' | 'source' | 'expires' | 'dateConfirmed'
>;
export type DishFocus = 'general' | 'main' | 'side';

export const publishedIngredientCategories = [
  'Meat & seafood',
  'Fruits',
  'Vegetables',
  'Dairy & eggs',
  'Grains & bakery',
  'Pantry & condiments',
  'Other',
] as const;
export type PublishedIngredientCategory = typeof publishedIngredientCategories[number];

function normalizeIngredient(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized.endsWith('s') && !normalized.endsWith('ss') ? normalized.slice(0, -1) : normalized;
}

export function publishedIngredientCategory(name: string): PublishedIngredientCategory {
  const identity = normalizeIngredient(name);
  const matches = (terms: string[]) => terms.some((term) => identity === term || identity.includes(` ${term}`) || identity.includes(`${term} `));
  if (matches(['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'steak', 'bacon', 'sausage', 'ham', 'meat'])) return 'Meat & seafood';
  if (matches(['apple', 'avocado', 'banana', 'lemon', 'lime', 'orange', 'berry', 'strawberry', 'blueberry', 'mango', 'pineapple', 'peach', 'pear', 'grape', 'coconut'])) return 'Fruits';
  if (matches(['carrot', 'tomato', 'onion', 'garlic', 'broccoli', 'bell pepper', 'spinach', 'mushroom', 'cabbage', 'lettuce', 'celery', 'zucchini', 'eggplant', 'corn', 'pea', 'bean', 'asparagus', 'cauliflower', 'green bean'])) return 'Vegetables';
  if (matches(['milk', 'cream', 'cheese', 'butter', 'yogurt', 'egg', 'parmesan', 'mozzarella'])) return 'Dairy & eggs';
  if (matches(['rice', 'pasta', 'noodle', 'bread', 'flour', 'tortilla', 'couscous', 'quinoa', 'oat', 'potato', 'sweet potato'])) return 'Grains & bakery';
  if (matches(['salt', 'pepper', 'oil', 'sugar', 'vinegar', 'sauce', 'stock', 'water', 'spice'])) return 'Pantry & condiments';
  return 'Other';
}

function isConfirmedAvailable(ingredient: PublishedSearchIngredient) {
  if (ingredient.status === 'used' || ingredient.confidence !== 'confirmed') return false;
  if (ingredient.quantityKnown === true && ingredient.quantityValue === 0) return false;
  if (typeof ingredient.name !== 'string') return false;
  const name = normalizeIngredient(ingredient.name);
  return Boolean(name) && ingredient.name.trim().length <= 80;
}

function isSearchAnchor(ingredient: PublishedSearchIngredient) {
  return isConfirmedAvailable(ingredient) && !commonSeasonings.has(normalizeIngredient(ingredient.name));
}

function scoreIngredient(ingredient: PublishedSearchIngredient, focus: DishFocus, mainIngredients: ReadonlySet<string>, today: Date) {
  const category = publishedIngredientCategory(ingredient.name);
  const categoryScores: Record<DishFocus, Record<PublishedIngredientCategory, number>> = {
    general: { 'Meat & seafood': 12, Vegetables: 10, 'Grains & bakery': 9, 'Dairy & eggs': 8, Fruits: 6, 'Pantry & condiments': 1, Other: 4 },
    main: { 'Meat & seafood': 22, Vegetables: 11, 'Grains & bakery': 12, 'Dairy & eggs': 11, Fruits: 4, 'Pantry & condiments': 1, Other: 5 },
    side: { 'Meat & seafood': -8, Vegetables: 18, 'Grains & bakery': 15, 'Dairy & eggs': 8, Fruits: 9, 'Pantry & condiments': 1, Other: 4 },
  };
  let score = categoryScores[focus][category];
  if (ingredient.quantityKnown === true || (typeof ingredient.quantityValue === 'number' && ingredient.quantityValue > 0)) score += 4;
  if (ingredient.status === 'fresh') score += 3;
  else if (ingredient.status === 'low') score -= 3;
  if (ingredient.source === 'manual' || ingredient.source === 'scan') score += 1;
  if (ingredient.dateConfirmed && ingredient.expires) {
    const days = Math.ceil((new Date(`${ingredient.expires}T12:00:00`).getTime() - today.getTime()) / 86_400_000);
    if (Number.isFinite(days) && days >= 0 && days <= 3) score += 8;
    else if (Number.isFinite(days) && days > 3 && days <= 7) score += 4;
    else if (Number.isFinite(days) && days < 0) score -= 15;
  }
  if (focus === 'side' && mainIngredients.has(normalizeIngredient(ingredient.name))) score -= 12;
  return score;
}

export function rankPublishedSearchIngredients(ingredients: readonly PublishedSearchIngredient[], focus: DishFocus = 'general', mainIngredientNames: readonly string[] = [], today = new Date()) {
  const mainIngredients = new Set(mainIngredientNames.map(normalizeIngredient));
  const bestByName = new Map<string, { ingredient: PublishedSearchIngredient; index: number; score: number }>();
  ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => isSearchAnchor(ingredient))
    .forEach(({ ingredient, index }) => {
      const name = normalizeIngredient(ingredient.name);
      const score = scoreIngredient(ingredient, focus, mainIngredients, today);
      const previous = bestByName.get(name);
      if (!previous || score > previous.score) bestByName.set(name, { ingredient, index, score });
    });
  const remaining = [...bestByName.values()];
  const ranked: PublishedSearchIngredient[] = [];
  const categoryCounts = new Map<PublishedIngredientCategory, number>();
  while (remaining.length) {
    remaining.sort((a, b) => {
      const aCategory = publishedIngredientCategory(a.ingredient.name);
      const bCategory = publishedIngredientCategory(b.ingredient.name);
      const adjustedA = a.score - 3 * (categoryCounts.get(aCategory) ?? 0);
      const adjustedB = b.score - 3 * (categoryCounts.get(bCategory) ?? 0);
      return adjustedB - adjustedA || a.index - b.index;
    });
    const next = remaining.shift()!;
    const category = publishedIngredientCategory(next.ingredient.name);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    ranked.push(next.ingredient);
  }
  return ranked;
}

export function buildPublishedRecipeSearch(
  ingredients: readonly PublishedSearchIngredient[],
  selectedIds: readonly string[] = [],
  options: { manualSelection?: boolean; focus?: DishFocus; mainIngredientNames?: string[] } = {},
) {
  const ranked = rankPublishedSearchIngredients(ingredients, options.focus ?? 'general', options.mainIngredientNames ?? []);
  const selected = new Set(selectedIds);
  const pinned = selectedIds
    .map((id) => ranked.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is PublishedSearchIngredient => Boolean(ingredient));
  const automatic = ranked.filter((ingredient) => !selected.has(ingredient.id));
  const anchors = (options.manualSelection ? pinned : [...pinned, ...automatic]).slice(0, MAX_PUBLISHED_SEARCH_ANCHORS);
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
