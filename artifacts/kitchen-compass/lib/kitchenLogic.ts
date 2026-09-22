export type InventoryCandidate = {
  name: string;
  normalizedName?: string;
  status: 'fresh' | 'low' | 'used';
  confidence?: 'confirmed' | 'uncertain';
};

export type RecipeSafetyInput = {
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
};

export type RecipeIngredientInput = {
  name: string;
  required?: boolean;
};

const aliases: Record<string, string> = {
  eggs: 'egg',
  'chicken breast': 'chicken',
  'fresh parsley': 'parsley',
  basil: 'basil',
  'canned tomatoes': 'tomato',
  tomatoes: 'tomato',
  avocado: 'avocado',
  bread: 'bread',
  pasta: 'pasta',
  parmesan: 'parmesan',
  garlic: 'garlic',
  lemon: 'lemon',
  broccoli: 'broccoli',
  'olive oil': 'olive oil',
};

export function normalizeIngredientName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
  return aliases[normalized] ?? normalized;
}

export function ingredientIdentitiesMatch(recipeName: string, inventory: InventoryCandidate) {
  const recipeIdentity = normalizeIngredientName(recipeName);
  const inventoryIdentity = normalizeIngredientName(inventory.normalizedName ?? inventory.name);
  return recipeIdentity === inventoryIdentity
    && inventory.status !== 'used'
    && inventory.confidence === 'confirmed';
}

export function recipeHasAllergyConflict(recipe: RecipeSafetyInput, allergies: string[]) {
  const requested = allergies.map(normalizeIngredientName);
  return recipe.allergens.some((allergen) => requested.includes(normalizeIngredientName(allergen)));
}

export function recipeReadiness(
  recipe: RecipeSafetyInput & { ingredients: RecipeIngredientInput[] },
  inventory: InventoryCandidate[],
  allergies: string[],
) {
  if (recipeHasAllergyConflict(recipe, allergies)) return { ready: false, allergenConflict: true, allergenIncomplete: false };
  const allergenIncomplete = recipe.allergenInfo !== 'complete';
  const requiredIngredients = recipe.ingredients.filter((ingredient) => ingredient.required !== false);
  const ready = !allergenIncomplete && requiredIngredients.every((ingredient) => inventory.some((item) => ingredientIdentitiesMatch(ingredient.name, item)));
  return { ready, allergenConflict: false, allergenIncomplete };
}

export function scaleQuantity(quantity: number, sourceServings: number, targetServings: number) {
  if (sourceServings <= 0 || targetServings <= 0) throw new Error('Serving counts must be positive.');
  return Number((quantity * targetServings / sourceServings).toFixed(2));
}

export function scaleNutrition<T extends Record<string, number>>(nutrition: T, sourceServings: number, targetServings: number): T {
  return Object.fromEntries(Object.entries(nutrition).map(([key, value]) => [key, scaleQuantity(value, sourceServings, targetServings)])) as T;
}

type PlannedRecipeInput = {
  recipeId: string;
};

type ShoppingRecipeInput = {
  id: string;
  servings: number;
  ingredients: Array<{ name: string; quantity: number; unit: string; required?: boolean }>;
};

export type ShoppingNeed = {
  id: string;
  name: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
  quantityCheckNeeded: boolean;
  category: 'Produce' | 'Protein' | 'Pantry' | 'Dairy & eggs' | 'Other';
};

function unitFamily(unit: string) {
  const normalized = unit.toLowerCase();
  if (['tsp', 'tbsp'].includes(normalized)) return 'spoon';
  if (['g', 'kg', 'oz', 'lb'].includes(normalized)) return 'weight';
  if (['ml', 'l', 'cup'].includes(normalized)) return 'volume';
  if (['egg', 'count', 'fruit', 'slice', 'clove', 'breast', 'handful'].includes(normalized)) return 'count';
  return normalized;
}

function categoryFor(name: string): ShoppingNeed['category'] {
  const identity = normalizeIngredientName(name);
  if (['lemon', 'broccoli', 'avocado', 'tomato', 'basil', 'parsley'].includes(identity)) return 'Produce';
  if (['chicken'].includes(identity)) return 'Protein';
  if (['egg', 'parmesan'].includes(identity)) return 'Dairy & eggs';
  if (['pasta', 'bread', 'garlic', 'olive oil'].includes(identity)) return 'Pantry';
  return 'Other';
}

export function calculateShoppingNeeds(
  plan: PlannedRecipeInput[],
  recipes: ShoppingRecipeInput[],
  inventory: Array<InventoryCandidate & { quantityValue?: number; unit?: string; quantityKnown?: boolean }>,
  targetServings: number,
) {
  const demand = new Map<string, { name: string; quantity: number; unit: string; quantityKnown: boolean }>();
  for (const planned of plan) {
    const recipe = recipes.find((item) => item.id === planned.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.required === false) continue;
      const normalizedName = normalizeIngredientName(ingredient.name);
      const scaled = scaleQuantity(ingredient.quantity, recipe.servings, targetServings);
      const existing = demand.get(normalizedName);
      if (!existing) demand.set(normalizedName, { name: ingredient.name, quantity: scaled, unit: ingredient.unit, quantityKnown: true });
      else if (unitFamily(existing.unit) === unitFamily(ingredient.unit) && existing.unit === ingredient.unit) existing.quantity += scaled;
      else existing.quantityKnown = false;
    }
  }

  return [...demand.entries()].map(([normalizedName, need]) => {
    const matchingInventory = inventory.filter((item) => normalizeIngredientName(item.normalizedName ?? item.name) === normalizedName && item.status !== 'used' && item.confidence === 'confirmed');
    const unknownInventory = matchingInventory.some((item) => item.quantityKnown !== true || item.quantityValue === undefined);
    const usableInventory = matchingInventory.filter((item) => item.quantityKnown === true && item.quantityValue !== undefined && item.unit && unitFamily(item.unit) === unitFamily(need.unit) && item.unit === need.unit);
    const covered = usableInventory.reduce((sum, item) => sum + (item.quantityValue ?? 0), 0);
    const remaining = Math.max(0, need.quantity - covered);
    return {
      id: normalizedName,
      name: need.name,
      normalizedName,
      ...(remaining > 0 ? { quantity: Number(remaining.toFixed(2)), unit: need.unit } : {}),
      quantityCheckNeeded: unknownInventory || !usableInventory.length && matchingInventory.length > 0,
      category: categoryFor(need.name),
    } satisfies ShoppingNeed;
  }).filter((item) => item.quantityCheckNeeded || item.quantity !== undefined);
}