export type InventoryCandidate = {
  id?: string;
  name: string;
  normalizedName?: string;
  status: 'fresh' | 'low' | 'used';
  confidence?: 'confirmed' | 'uncertain';
  quantityValue?: number;
  unit?: string;
  quantityKnown?: boolean;
};

export type ReservationRecord = {
  id: string;
  plannedMealId: string;
  inventoryId?: string;
  ingredientName: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
  quantityKnown: boolean;
};

export type RecipeSafetyInput = {
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
};

export type RecipeIngredientInput = {
  name: string;
  required?: boolean;
  quantity?: number;
  unit?: string;
};

export type RecipePreferenceInput = {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikes: string[];
  cuisines: string[];
  skill: 'Beginner' | 'Comfortable' | 'Confident';
  cookTime: number;
  equipment: string[];
  nutrition: string[];
};

export type ConfirmedDateStatus = 'expired' | 'soon' | null;

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

export function canonicalUnit(value?: string) {
  const unit = value?.trim().toLowerCase().replace(/\.$/, '');
  if (!unit) return undefined;
  const singular = unit.endsWith('s') && unit !== 'tbsp' ? unit.slice(0, -1) : unit;
  return ({ tablespoons: 'tbsp', tablespoon: 'tbsp', teaspoons: 'tsp', teaspoon: 'tsp', pounds: 'lb', pound: 'lb', ounces: 'oz', ounce: 'oz', kilograms: 'kg', kilogram: 'kg', grams: 'g', gram: 'g', liters: 'l', liter: 'l', milliliters: 'ml', milliliter: 'ml', cups: 'cup', cloves: 'clove', breasts: 'breast', slices: 'slice', fruits: 'fruit', handfuls: 'handful', eggs: 'egg' } as Record<string, string>)[singular] ?? singular;
}

type UnitConversion = { family: 'weight' | 'volume' | 'count'; factor: number };

function unitConversion(unit?: string): UnitConversion | null {
  switch (canonicalUnit(unit)) {
    case 'g': return { family: 'weight', factor: 1 };
    case 'kg': return { family: 'weight', factor: 1000 };
    case 'oz': return { family: 'weight', factor: 28.3495 };
    case 'lb': return { family: 'weight', factor: 453.592 };
    case 'ml': return { family: 'volume', factor: 1 };
    case 'l': return { family: 'volume', factor: 1000 };
    case 'tsp': return { family: 'volume', factor: 5 };
    case 'tbsp': return { family: 'volume', factor: 15 };
    case 'cup': return { family: 'volume', factor: 240 };
    case 'count':
    case 'egg':
    case 'fruit':
    case 'slice':
    case 'clove':
    case 'breast':
    case 'handful':
      return { family: 'count', factor: 1 };
    default:
      return null;
  }
}

export function isSupportedQuantityUnit(unit?: string) {
  return unitConversion(unit) !== null;
}

export function parseQuantityText(quantity?: string) {
  if (!quantity?.trim()) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
  if (!match || !match[2]) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  const unit = canonicalUnit(match[2]);
  if (!isSupportedQuantityUnit(unit)) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  return { quantityValue: Number(match[1]), unit, quantityKnown: true };
}

export function normalizeConfirmedDate(value?: string) {
  const date = value?.trim();
  if (!date) return undefined;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return date;
}

export function confirmedDateStatus(value?: string, now = Date.now(), soonDays = 3): ConfirmedDateStatus {
  const normalized = normalizeConfirmedDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = new Date(now);
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const difference = Math.floor((target - todayStart) / 86_400_000);
  if (difference < 0) return 'expired';
  return difference <= soonDays ? 'soon' : null;
}

export function ingredientRowsMatch(
  existing: { name: string; normalizedName?: string; location: string },
  incoming: { name: string; normalizedName?: string; location: string },
) {
  return (existing.normalizedName ?? normalizeIngredientName(existing.name)) === (incoming.normalizedName ?? normalizeIngredientName(incoming.name))
    && existing.location === incoming.location;
}

export function convertQuantity(quantity: number, fromUnit?: string, toUnit?: string) {
  const from = unitConversion(fromUnit);
  const to = unitConversion(toUnit);
  if (!from || !to || from.family !== to.family) return null;
  return quantity * from.factor / to.factor;
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

export type RecipeReadinessResult = {
  ready: boolean;
  missingIngredients: string[];
  insufficientIngredients: string[];
  quantityCheckIngredients: string[];
  allergenConflict: boolean;
  allergenIncomplete: boolean;
};

export function recipeReadiness(
  recipe: RecipeSafetyInput & { servings?: number; ingredients: RecipeIngredientInput[] },
  inventory: InventoryCandidate[],
  allergies: string[],
  targetServings = 1,
  reservations: ReservationRecord[] = [],
  plannedMealId?: string,
): RecipeReadinessResult {
  const result: RecipeReadinessResult = {
    ready: true,
    missingIngredients: [],
    insufficientIngredients: [],
    quantityCheckIngredients: [],
    allergenConflict: recipeHasAllergyConflict(recipe, allergies),
    allergenIncomplete: recipe.allergenInfo !== 'complete',
  };
  if (result.allergenConflict || result.allergenIncomplete) result.ready = false;

  for (const ingredient of recipe.ingredients.filter((item) => item.required !== false)) {
    const identity = normalizeIngredientName(ingredient.name);
    const matches = inventory.filter((item) => ingredientIdentitiesMatch(ingredient.name, item));
    if (!matches.length) {
      result.missingIngredients.push(ingredient.name);
      continue;
    }
    const demand = ingredient.quantity === undefined || !ingredient.unit
      ? undefined
      : scaleQuantity(ingredient.quantity, recipe.servings ?? 1, targetServings);
    if (demand === undefined) {
      result.quantityCheckIngredients.push(ingredient.name);
      continue;
    }
    let available = 0;
    let hasUnknown = false;
    for (const item of matches) {
      if (item.quantityKnown !== true || item.quantityValue === undefined || !item.unit) {
        hasUnknown = true;
        continue;
      }
      const reserved = item.id ? reservations
        .filter((reservation) => reservation.inventoryId === item.id
          && reservation.normalizedName === identity
          && reservation.quantityKnown
          && reservation.plannedMealId !== plannedMealId)
        .reduce((sum, reservation) => {
          const converted = convertQuantity(reservation.quantity ?? 0, reservation.unit, item.unit);
          return sum + (converted ?? 0);
        }, 0) : 0;
      const converted = convertQuantity(Math.max(0, item.quantityValue - reserved), item.unit, ingredient.unit);
      if (converted === null) {
        hasUnknown = true;
      } else {
        available += converted;
      }
    }
    if (hasUnknown && available < demand) result.quantityCheckIngredients.push(ingredient.name);
    else if (available < demand) result.insufficientIngredients.push(ingredient.name);
  }
  result.ready = result.ready
    && !result.missingIngredients.length
    && !result.insufficientIngredients.length
    && !result.quantityCheckIngredients.length;
  return result;
}

export function recipeMatchesPreferences(
  recipe: {
    cuisine: string;
    cook: number;
    difficulty: string;
    equipment: string[];
    ingredients: Array<{ name: string }>;
    allergens: string[];
    allergenInfo: 'complete' | 'incomplete';
    dietaryTags?: string[];
    dislikeTags?: string[];
    nutritionTags?: string[];
  },
  preferences: RecipePreferenceInput,
) {
  if (recipeHasAllergyConflict(recipe, preferences.allergies) || recipe.allergenInfo !== 'complete') return false;
  if (preferences.cuisines.length && !preferences.cuisines.some((cuisine) => cuisine.toLowerCase() === recipe.cuisine.toLowerCase())) return false;
  if (recipe.cook > preferences.cookTime) return false;
  if (recipe.equipment.some((item) => !preferences.equipment.includes(item))) return false;
  if (preferences.skill === 'Beginner' && recipe.difficulty !== 'Easy') return false;
  if (preferences.skill === 'Comfortable' && recipe.difficulty === 'Hard') return false;
  const restrictions = preferences.dietaryRestrictions.map(normalizeIngredientName);
  const recipeIngredients = recipe.ingredients.map((item) => normalizeIngredientName(item.name));
  const meatOrFish = ['chicken', 'beef', 'pork', 'fish'];
  if (restrictions.includes('vegetarian') && recipeIngredients.some((item) => meatOrFish.includes(item))) return false;
  if (restrictions.includes('pescatarian') && recipeIngredients.some((item) => ['chicken', 'beef', 'pork'].includes(item))) return false;
  if (restrictions.includes('vegan') && recipeIngredients.some((item) => [...meatOrFish, 'egg', 'parmesan'].includes(item))) return false;
  if (restrictions.includes('gluten free') && recipeIngredients.some((item) => ['bread', 'pasta'].includes(item))) return false;
  if (restrictions.includes('dairy free') && recipeIngredients.includes('parmesan')) return false;
  const dislikes = preferences.dislikes.map(normalizeIngredientName);
  if (dislikes.some((dislike) => recipe.ingredients.some((item) => normalizeIngredientName(item.name) === dislike) || recipe.dislikeTags?.map(normalizeIngredientName).includes(dislike))) return false;
  if (preferences.nutrition.length && recipe.nutritionTags && !preferences.nutrition.some((item) => recipe.nutritionTags?.includes(item))) return false;
  return true;
}

type PlannedRecipeInput = { id: string; recipeId: string; servings: number };
type ReservationRecipe = {
  id: string;
  servings: number;
  ingredients: Array<{ name: string; quantity: number; unit: string; required?: boolean }>;
};

export function buildReservations(
  plan: PlannedRecipeInput[],
  recipes: ReservationRecipe[],
  inventory: InventoryCandidate[],
) {
  const reservations: ReservationRecord[] = [];
  const warnings: string[] = [];
  for (const planned of plan) {
    const recipe = recipes.find((item) => item.id === planned.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients.filter((item) => item.required !== false)) {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const demand = scaleQuantity(ingredient.quantity, recipe.servings, planned.servings);
      let remaining = demand;
      const candidates = inventory.filter((item) => ingredientIdentitiesMatch(ingredient.name, item));
      for (const item of candidates) {
        if (remaining <= 0) break;
        if (!item.id || item.quantityKnown !== true || item.quantityValue === undefined || !item.unit) continue;
        const alreadyReserved = reservations
          .filter((reservation) => reservation.inventoryId === item.id && reservation.quantityKnown)
          .reduce((sum, reservation) => sum + convertQuantity(reservation.quantity ?? 0, reservation.unit, item.unit)!, 0);
        const available = Math.max(0, item.quantityValue - alreadyReserved);
        const compatible = convertQuantity(available, item.unit, ingredient.unit);
        if (compatible === null) continue;
        const allocation = Math.min(remaining, compatible);
        reservations.push({
          id: `${planned.id}-${normalizedName}-${item.id}`,
          plannedMealId: planned.id,
          inventoryId: item.id,
          ingredientName: ingredient.name,
          normalizedName,
          quantity: allocation,
          unit: ingredient.unit,
          quantityKnown: true,
        });
        remaining -= allocation;
      }
      if (remaining > 0) {
        const hasUnknown = candidates.some((item) => item.quantityKnown !== true || item.quantityValue === undefined || !item.unit);
        reservations.push({
          id: `${planned.id}-${normalizedName}-unknown`,
          plannedMealId: planned.id,
          ingredientName: ingredient.name,
          normalizedName,
          quantityKnown: false,
        });
        warnings.push(`${planned.id}: ${ingredient.name} ${hasUnknown ? 'needs a quantity check' : 'is overallocated'}`);
      }
    }
  }
  return { reservations, warnings };
}

export type ShoppingNeed = {
  id: string;
  name: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
  quantityCheckNeeded: boolean;
  quantityCheckReasons: Array<'unknown-inventory' | 'incompatible-unit'>;
  category: 'Produce' | 'Protein' | 'Pantry' | 'Dairy & eggs' | 'Other';
};

function categoryFor(name: string): ShoppingNeed['category'] {
  const identity = normalizeIngredientName(name);
  if (['lemon', 'broccoli', 'avocado', 'tomato', 'basil', 'parsley'].includes(identity)) return 'Produce';
  if (identity === 'chicken') return 'Protein';
  if (['egg', 'parmesan'].includes(identity)) return 'Dairy & eggs';
  if (['pasta', 'bread', 'garlic', 'olive oil'].includes(identity)) return 'Pantry';
  return 'Other';
}

export function calculateShoppingNeeds(
  plan: PlannedRecipeInput[],
  recipes: ReservationRecipe[],
  inventory: InventoryCandidate[],
  targetServings: number,
  _reservations: ReservationRecord[] = [],
) {
  const demand = new Map<string, { name: string; quantity: number; unit: string }>();
  for (const planned of plan) {
    const recipe = recipes.find((item) => item.id === planned.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients.filter((item) => item.required !== false)) {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const scaled = scaleQuantity(ingredient.quantity, recipe.servings, planned.servings || targetServings);
      const existing = demand.get(normalizedName);
      if (!existing) demand.set(normalizedName, { name: ingredient.name, quantity: scaled, unit: ingredient.unit });
      else {
        const converted = convertQuantity(scaled, ingredient.unit, existing.unit);
        if (converted === null) existing.quantity = Number.NaN;
        else existing.quantity += converted;
      }
    }
  }
  return [...demand.entries()].map(([normalizedName, need]) => {
    const matching = inventory.filter((item) => ingredientIdentitiesMatch(need.name, item));
    let covered = 0;
    const quantityCheckReasons = new Set<'unknown-inventory' | 'incompatible-unit'>();
    for (const item of matching) {
      if (item.quantityKnown !== true || item.quantityValue === undefined || !item.unit) {
        quantityCheckReasons.add('unknown-inventory');
        continue;
      }
      const converted = convertQuantity(item.quantityValue, item.unit, need.unit);
      if (converted === null) quantityCheckReasons.add('incompatible-unit');
      else covered += converted;
    }
    const remaining = Number.isNaN(need.quantity) ? undefined : Math.max(0, need.quantity - covered);
    return {
      id: normalizedName,
      name: need.name,
      normalizedName,
      ...(remaining && remaining > 0 ? { quantity: Number(remaining.toFixed(2)), unit: need.unit } : {}),
      quantityCheckNeeded: quantityCheckReasons.size > 0 || Number.isNaN(need.quantity),
      quantityCheckReasons: [...quantityCheckReasons],
      category: categoryFor(need.name),
    } satisfies ShoppingNeed;
  }).filter((item) => item.quantityCheckNeeded || item.quantity !== undefined);
}

export type Deduction = { inventoryId: string; quantity: number; unit: string };

export function deductInventory<T extends InventoryCandidate & { id: string }>(inventory: T[], deductions: Deduction[]) {
  return inventory.map((item) => {
    const rowDeductions = deductions.filter((deduction) => deduction.inventoryId === item.id);
    if (!rowDeductions.length || item.quantityKnown !== true || item.quantityValue === undefined || !item.unit) return item;
    let remaining = item.quantityValue;
    for (const deduction of rowDeductions) {
      const amount = convertQuantity(deduction.quantity, deduction.unit, item.unit);
      if (amount !== null) remaining = Math.max(0, remaining - amount);
    }
    return {
      ...item,
      quantityValue: Number(remaining.toFixed(2)),
      quantityKnown: true,
      quantity: `${Number(remaining.toFixed(2))} ${canonicalUnit(item.unit)}`,
      status: remaining <= 0 ? 'used' : item.status,
    };
  });
}

export function applyCookingTransaction<T extends InventoryCandidate & { id: string }>(
  inventory: T[],
  completedTransactionIds: string[],
  transactionId: string,
  deductions: Deduction[],
) {
  if (completedTransactionIds.includes(transactionId)) {
    return { applied: false, inventory, completedTransactionIds };
  }
  return {
    applied: true,
    inventory: deductInventory(inventory, deductions),
    completedTransactionIds: [...completedTransactionIds, transactionId],
  };
}

export function scaleQuantity(quantity: number, sourceServings: number, targetServings: number) {
  if (sourceServings <= 0 || targetServings <= 0) throw new Error('Serving counts must be positive.');
  return Number((quantity * targetServings / sourceServings).toFixed(2));
}

export function scaleNutrition<T extends Record<string, number>>(nutrition: T, sourceServings: number, targetServings: number): T {
  return Object.fromEntries(Object.entries(nutrition).map(([key, value]) => [key, scaleQuantity(value, sourceServings, targetServings)])) as T;
}