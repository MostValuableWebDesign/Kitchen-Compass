export type InventoryCandidate = {
  id?: string;
  name: string;
  normalizedName?: string;
  status: 'fresh' | 'low' | 'used';
  confidence?: 'confirmed' | 'uncertain';
  quantityValue?: number;
  unit?: string;
  quantityKnown?: boolean;
  expires?: string;
  dateConfirmed?: boolean;
};

export type ReservationRecord = {
  id: string;
  plannedMealId: string;
  inventoryId?: string;
  leftoverId?: string;
  ingredientName: string;
  normalizedName: string;
  quantity?: number;
  unit?: string;
  quantityKnown: boolean;
  shortageQuantity?: number;
  shortageUnit?: string;
};

import {
  assessRecipeAllergens,
  hasUnknownAllergenInformation,
  requestedAllergenConflicts,
} from '@workspace/recipe-calculations';

export type RecipeSafetyInput = {
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
  ingredients?: RecipeIngredientInput[];
  substitutions?: Array<{ to: string }>;
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

export function canCombineIngredientQuantities(
  existing: { quantityKnown?: boolean; quantityValue?: number; unit?: string },
  incoming: { quantityKnown?: boolean; quantityValue?: number; unit?: string },
) {
  if (!existing.quantityKnown || !incoming.quantityKnown
    || existing.quantityValue === undefined || incoming.quantityValue === undefined
    || !existing.unit || !incoming.unit) return false;
  const converted = canonicalUnit(existing.unit) === canonicalUnit(incoming.unit)
    ? incoming.quantityValue
    : convertQuantity(incoming.quantityValue, incoming.unit, existing.unit);
  return converted !== null && Number.isFinite(converted);
}

export function addKitchenIngredient<T extends {
  id: string;
  name: string;
  normalizedName?: string;
  location: string;
  status: 'fresh' | 'low' | 'used';
  quantity?: string;
  quantityValue?: number;
  unit?: string;
  quantityKnown?: boolean;
}>(rows: T[], incoming: T, additionalStock = false): T[] {
  const index = rows.findIndex((row) => ingredientRowsMatch(row, incoming));
  if (index < 0) return [...rows, incoming];
  const existing = rows[index];
  if (existing.status === 'used') {
    const next = [...rows];
    next[index] = { ...incoming, id: existing.id };
    return next;
  }
  if (!additionalStock || !canCombineIngredientQuantities(existing, incoming)
    || existing.quantityValue === undefined || incoming.quantityValue === undefined
    || !existing.unit || !incoming.unit) return rows;
  const converted = canonicalUnit(existing.unit) === canonicalUnit(incoming.unit)
    ? incoming.quantityValue
    : convertQuantity(incoming.quantityValue, incoming.unit, existing.unit);
  if (converted === null || !Number.isFinite(converted)) return rows;
  const total = Number((existing.quantityValue + converted).toFixed(3));
  const next = [...rows];
  next[index] = { ...existing, status: 'fresh', quantityValue: total, quantity: `${total} ${existing.unit}` };
  return next;
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
  const assessment = assessRecipeAllergens(recipe.ingredients ?? [], recipe.allergens, recipe.substitutions);
  return requestedAllergenConflicts(assessment, allergies);
}

export type RecipeReadinessResult = {
  ready: boolean;
  missingIngredients: string[];
  insufficientIngredients: string[];
  quantityCheckIngredients: string[];
  shortageDetails: Array<{ ingredientName: string; quantity: number; unit: string }>;
  allergenConflict: boolean;
  allergenIncomplete: boolean;
};

export type RecipeAvailabilityLabel = 'Ready to cook' | 'Almost ready' | 'Check quantities' | 'Not enough quantity' | 'Missing ingredients' | 'Not safe';

export function recipeAvailabilityLabel(result: RecipeReadinessResult): RecipeAvailabilityLabel {
  if (result.allergenConflict || result.allergenIncomplete) return 'Not safe';
  if (result.ready) return 'Ready to cook';
  if (result.quantityCheckIngredients.length) return 'Check quantities';
  if (result.insufficientIngredients.length) return 'Not enough quantity';
  if (result.missingIngredients.length <= 2) return 'Almost ready';
  return 'Missing ingredients';
}

export function recipeReadiness(
  recipe: RecipeSafetyInput & { servings?: number; ingredients: RecipeIngredientInput[] },
  inventory: InventoryCandidate[],
  allergies: string[],
  targetServings = 1,
  reservations: ReservationRecord[] = [],
  plannedMealId?: string,
): RecipeReadinessResult {
  const allergenAssessment = assessRecipeAllergens(recipe.ingredients, recipe.allergens, recipe.substitutions);
  const result: RecipeReadinessResult = {
    ready: true,
    missingIngredients: [],
    insufficientIngredients: [],
    quantityCheckIngredients: [],
    shortageDetails: [],
    allergenConflict: requestedAllergenConflicts(allergenAssessment, allergies),
    allergenIncomplete: recipe.allergenInfo !== 'complete' || hasUnknownAllergenInformation(allergenAssessment),
  };
  if (result.allergenConflict || result.allergenIncomplete) result.ready = false;

  for (const ingredient of recipe.ingredients.filter((item) => item.required !== false)) {
    const identity = normalizeIngredientName(ingredient.name);
    const matches = inventory.filter((item) => ingredientIdentitiesMatch(ingredient.name, item));
    const demand = ingredient.quantity === undefined || !ingredient.unit
      ? undefined
      : scaleQuantity(ingredient.quantity, recipe.servings ?? 1, targetServings);
    if (!matches.length) {
      result.missingIngredients.push(ingredient.name);
      if (demand !== undefined && ingredient.unit) {
        result.shortageDetails.push({ ingredientName: ingredient.name, quantity: demand, unit: ingredient.unit });
      }
      continue;
    }
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
    else if (available < demand) {
      result.insufficientIngredients.push(ingredient.name);
      result.shortageDetails.push({ ingredientName: ingredient.name, quantity: Number((demand - available).toFixed(2)), unit: ingredient.unit! });
    }
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
    substitutions?: Array<{ to: string }>;
    dietaryTags?: string[];
    dislikeTags?: string[];
    nutritionTags?: string[];
  },
  preferences: RecipePreferenceInput,
) {
  const allergenAssessment = assessRecipeAllergens(recipe.ingredients, recipe.allergens, recipe.substitutions);
  if (requestedAllergenConflicts(allergenAssessment, preferences.allergies)
    || recipe.allergenInfo !== 'complete'
    || hasUnknownAllergenInformation(allergenAssessment)) return false;
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

export type PlannedRecipeInput = { id: string; recipeId: string; recipeVersion?: string; servings: number; leftoverId?: string };
type ReservationRecipe = {
  id: string;
  sourceVersion?: string;
  recipeVersion?: string;
  servings: number;
  ingredients: Array<{ name: string; quantity: number; unit: string; required?: boolean }>;
};

export type MealSlot = { day: string; meal: 'Breakfast' | 'Lunch' | 'Dinner' };

export function movePlannedMeals<T extends MealSlot & { id: string }>(plan: T[], source: MealSlot, target: MealSlot) {
  if (source.day === target.day && source.meal === target.meal) return plan;
  const sourceMeal = plan.find((item) => item.day === source.day && item.meal === source.meal);
  if (!sourceMeal) return plan;
  const targetMeal = plan.find((item) => item.day === target.day && item.meal === target.meal);
  return plan.map((item) => {
    if (item.id === sourceMeal.id) return { ...item, day: target.day, meal: target.meal };
    if (targetMeal && item.id === targetMeal.id) return { ...item, day: source.day, meal: source.meal };
    return item;
  });
}

export function replacePlanSlots<T extends MealSlot>(plan: T[], slots: MealSlot[], replacements: T[]) {
  const selected = new Set(slots.map((slot) => `${slot.day}-${slot.meal}`));
  return [...plan.filter((item) => !selected.has(`${item.day}-${item.meal}`)), ...replacements];
}

export function consumeLeftover<T extends { id: string; portions: number }>(leftovers: T[], leftoverId: string, portions: number) {
  if (!Number.isFinite(portions) || portions <= 0) return { consumed: false, leftovers };
  const target = leftovers.find((item) => item.id === leftoverId);
  if (!target || target.portions < portions) return { consumed: false, leftovers };
  const remaining = Number((target.portions - portions).toFixed(2));
  return {
    consumed: true,
    leftovers: remaining > 0
      ? leftovers.map((item) => item.id === leftoverId ? { ...item, portions: remaining } : item)
      : leftovers.filter((item) => item.id !== leftoverId),
  };
}

export function applyLeftoverCookingTransaction<T extends { id: string; portions: number }>(
  leftovers: T[],
  completedTransactionIds: string[],
  transactionId: string,
  leftoverId: string,
  portions: number,
) {
  if (completedTransactionIds.includes(transactionId)) return { applied: false, leftovers, completedTransactionIds };
  const result = consumeLeftover(leftovers, leftoverId, portions);
  if (!result.consumed) return { applied: false, leftovers, completedTransactionIds };
  return { applied: true, leftovers: result.leftovers, completedTransactionIds: [...completedTransactionIds, transactionId] };
}

type PlanRecipeShape = {
  id: string;
  servings: number;
  meal: string;
  cook: number;
  equipment: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string; required?: boolean }>;
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
  cuisine: string;
  difficulty: string;
  dietaryTags?: string[];
  dislikeTags?: string[];
  nutritionTags?: string[];
};

export function rankPlanRecipes<T extends PlanRecipeShape>(
  candidates: T[],
  inventory: InventoryCandidate[],
  preferences: RecipePreferenceInput,
  targetServings: number,
  usedRecipeIds: string[] = [],
) {
  return candidates
    .filter((recipe) => recipeMatchesPreferences(recipe, preferences))
    .map((recipe) => {
      const readiness = recipeReadiness(recipe, inventory, preferences.allergies, targetServings);
      const soonIngredients = recipe.ingredients.filter((ingredient) => inventory.some((item) =>
        ingredientIdentitiesMatch(ingredient.name, item)
        && item.id
        && item.status !== 'used'
        && confirmedDateStatus(item.dateConfirmed ? item.expires : undefined) === 'soon',
      )).length;
      const required = recipe.ingredients.filter((ingredient) => ingredient.required !== false);
      const availableIngredients = required.length - readiness.missingIngredients.length - readiness.insufficientIngredients.length;
      const duplicatePenalty = usedRecipeIds.includes(recipe.id) ? 22 : 0;
      const score = (readiness.ready ? 80 : 0)
        + availableIngredients * 12
        + soonIngredients * 18
        - readiness.missingIngredients.length * 4
        - readiness.insufficientIngredients.length * 3
        - readiness.quantityCheckIngredients.length
        - duplicatePenalty
        - recipe.cook / 10;
      return {
        recipe,
        score,
        needsConfirmation: readiness.quantityCheckIngredients.length > 0,
        confirmationReasons: readiness.quantityCheckIngredients,
        shortageReasons: readiness.shortageDetails.map((shortage) => `${shortage.ingredientName}: ${shortage.quantity} ${shortage.unit} short`),
      };
    })
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
}

export type GeneratedPlanMeal = MealSlot & PlannedRecipeInput & {
  needsConfirmation?: boolean;
  confirmationReasons?: string[];
  shortageReasons?: string[];
};

export function generatePlanIncrementally<T extends PlanRecipeShape>(
  current: GeneratedPlanMeal[],
  requestedDays: string[],
  requestedMeals: string[],
  candidates: T[],
  inventory: InventoryCandidate[],
  preferences: RecipePreferenceInput,
  targetServings: number,
  leftovers: Array<{ id: string; portions: number }> = [],
  reservationRecipes: T[] = candidates,
) {
  const next = replacePlanSlots(current, requestedDays.flatMap((day) => requestedMeals.map((meal) => ({ day, meal: meal as MealSlot['meal'] }))), []);
  for (const day of requestedDays) {
    for (const meal of requestedMeals) {
      const usedRecipeIds = next.map((item) => item.recipeId);
      const baseReservations = buildReservations(next, reservationRecipes, inventory, leftovers).reservations;
      const remainingInventory = inventoryAfterReservations(inventory, baseReservations);
      const ranked = rankPlanRecipes(
        candidates.filter((recipe) => meal === 'Breakfast' ? recipe.meal === 'Breakfast' : recipe.meal !== 'Breakfast'),
        remainingInventory,
        preferences,
        targetServings,
        usedRecipeIds,
      );
      const best = ranked[0];
      if (!best) continue;
      next.push({
        id: `${day}-${meal}`,
        day,
        meal: meal as MealSlot['meal'],
        recipeId: best.recipe.id,
        servings: targetServings,
        ...(best.needsConfirmation ? { needsConfirmation: true, confirmationReasons: best.confirmationReasons } : {}),
        ...(best.shortageReasons.length ? { shortageReasons: best.shortageReasons } : {}),
      });
    }
  }
  return next;
}

export function buildReservations(
  plan: PlannedRecipeInput[],
  recipes: ReservationRecipe[],
  inventory: InventoryCandidate[],
  leftovers: Array<{ id: string; portions: number }> = [],
) {
  const reservations: ReservationRecord[] = [];
  const warnings: string[] = [];
  const leftoverReserved = new Map<string, number>();
  for (const planned of plan) {
    if (planned.leftoverId) {
      const leftover = leftovers.find((item) => item.id === planned.leftoverId);
      if (!leftover) continue;
      const alreadyReserved = leftoverReserved.get(planned.leftoverId) ?? 0;
      const allocation = Math.min(planned.servings, Math.max(0, leftover.portions - alreadyReserved));
      if (allocation > 0) {
        reservations.push({
          id: `${planned.id}-leftover-${planned.leftoverId}`,
          plannedMealId: planned.id,
          leftoverId: planned.leftoverId,
          ingredientName: 'leftover portions',
          normalizedName: `leftover-${planned.leftoverId}`,
          quantity: allocation,
          unit: 'portion',
          quantityKnown: true,
        });
        leftoverReserved.set(planned.leftoverId, alreadyReserved + allocation);
      }
      if (allocation < planned.servings) {
        warnings.push(`${planned.id}: leftover portions short by ${Number((planned.servings - allocation).toFixed(2))}`);
      }
      continue;
    }
    const recipe = recipes.find((item) => item.id === planned.recipeId && (!planned.recipeVersion || item.recipeVersion === planned.recipeVersion || item.sourceVersion === planned.recipeVersion));
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
          ...(hasUnknown ? {} : { quantity: 0, unit: ingredient.unit, shortageQuantity: remaining, shortageUnit: ingredient.unit }),
          quantityKnown: !hasUnknown,
        });
        warnings.push(`${planned.id}: ${ingredient.name} ${hasUnknown ? 'needs a quantity check' : `short by ${Number(remaining.toFixed(2))} ${ingredient.unit}`}`);
      }
    }
  }
  return { reservations, warnings };
}

export function inventoryAfterReservations<T extends InventoryCandidate>(inventory: T[], reservations: ReservationRecord[]) {
  return inventory.map((item) => {
    if (!item.id || item.quantityKnown !== true || item.quantityValue === undefined || !item.unit) return item;
    const reserved = reservations
      .filter((reservation) => reservation.inventoryId === item.id && reservation.quantityKnown && reservation.quantity !== undefined && reservation.unit)
      .reduce((sum, reservation) => sum + (convertQuantity(reservation.quantity!, reservation.unit!, item.unit!) ?? 0), 0);
    if (reserved <= 0) return item;
    const remaining = Number(Math.max(0, item.quantityValue - reserved).toFixed(2));
    return { ...item, quantityValue: remaining, quantity: `${remaining} ${canonicalUnit(item.unit)}` };
  });
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
    if (planned.leftoverId) continue;
    const recipe = recipes.find((item) => item.id === planned.recipeId && (!planned.recipeVersion || item.recipeVersion === planned.recipeVersion || item.sourceVersion === planned.recipeVersion));
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
