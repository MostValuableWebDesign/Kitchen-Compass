import type {
  CompletedMeal,
  Ingredient,
  Leftover,
  PlannedMeal,
  Preferences,
  ShoppingListState,
} from '@/context/KitchenContext';
import { canonicalUnit, normalizeIngredientName, type ReservationRecord } from '@/lib/kitchenLogic';

export type PersistedKitchenState = {
  ingredients: Ingredient[];
  preferences: Preferences;
  plan: PlannedMeal[];
  reservations: ReservationRecord[];
  completedMeals: CompletedMeal[];
  leftovers: Leftover[];
  shoppingList: ShoppingListState;
};

export const defaultPreferences: Preferences = {
  servings: 2,
  allergies: [],
  dietaryRestrictions: [],
  dislikes: [],
  cuisines: ['Mediterranean'],
  skill: 'Comfortable',
  cookTime: 45,
  equipment: ['Stovetop', 'Oven'],
  nutrition: ['More vegetables'],
};

type LegacyState = {
  ingredients?: unknown;
  inventory?: unknown;
  preferences?: Partial<Preferences>;
  plan?: unknown;
};

function parseQuantity(quantity?: string) {
  if (!quantity?.trim()) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
  if (!match || !match[2]) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  return { quantityValue: Number(match[1]), unit: canonicalUnit(match[2]), quantityKnown: true };
}

function normalizeStoredIngredient(value: unknown, index: number): Ingredient {
  if (!value || typeof value !== 'object') throw new Error(`Saved ingredient ${index + 1} is invalid.`);
  const item = value as Partial<Ingredient>;
  if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Saved ingredient ${index + 1} has no name.`);
  const parsed = parseQuantity(item.quantity);
  const quantityKnown = item.quantityKnown === true
    && typeof item.quantityValue === 'number'
    && Number.isFinite(item.quantityValue)
    && typeof item.unit === 'string'
    && Boolean(canonicalUnit(item.unit));
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `migrated-ingredient-${index + 1}`,
    name: item.name,
    normalizedName: normalizeIngredientName(item.name),
    location: item.location === 'Freezer' || item.location === 'Pantry' ? item.location : 'Refrigerator',
    ...(quantityKnown
      ? { quantity: item.quantity ?? `${item.quantityValue} ${item.unit}`, quantityValue: item.quantityValue, unit: canonicalUnit(item.unit), quantityKnown: true }
      : item.quantity !== undefined
        ? parsed
        : { quantityKnown: false }),
    status: item.status === 'low' || item.status === 'used' ? item.status : 'fresh',
    confidence: item.confidence === 'uncertain' ? 'uncertain' : 'confirmed',
    ...(typeof item.expires === 'string' ? { expires: item.expires } : {}),
    ...(typeof item.photoUri === 'string' ? { photoUri: item.photoUri } : {}),
    ...(item.source === 'scan' || item.source === 'purchase' || item.source === 'manual' ? { source: item.source } : {}),
    ...(typeof item.sourceScanId === 'string' ? { sourceScanId: item.sourceScanId } : {}),
    ...(typeof item.sourcePhotoId === 'string' ? { sourcePhotoId: item.sourcePhotoId } : {}),
    ...(typeof item.reviewedAt === 'string' ? { reviewedAt: item.reviewedAt } : {}),
  };
}

function normalizePlan(value: unknown, servings: number): PlannedMeal[] {
  if (!Array.isArray(value)) throw new Error('Saved meal plan is invalid.');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Saved meal ${index + 1} is invalid.`);
    const meal = entry as Partial<PlannedMeal>;
    if (typeof meal.day !== 'string' || typeof meal.meal !== 'string' || typeof meal.recipeId !== 'string') {
      throw new Error(`Saved meal ${index + 1} is incomplete.`);
    }
    const mealType = meal.meal === 'Breakfast' || meal.meal === 'Lunch' || meal.meal === 'Dinner' ? meal.meal : null;
    if (!mealType) throw new Error(`Saved meal ${index + 1} has an invalid meal type.`);
    return {
      id: typeof meal.id === 'string' && meal.id ? meal.id : `${meal.day}-${mealType}`,
      day: meal.day,
      meal: mealType,
      recipeId: meal.recipeId,
      servings: typeof meal.servings === 'number' && meal.servings > 0 ? meal.servings : servings,
    };
  });
}

function normalizePreferences(value: Partial<Preferences> | undefined, defaults: Preferences): Preferences {
  const merged = { ...defaults, ...(value ?? {}) };
  return {
    servings: typeof merged.servings === 'number' && merged.servings > 0 ? merged.servings : defaults.servings,
    allergies: Array.isArray(merged.allergies) ? merged.allergies : defaults.allergies,
    dietaryRestrictions: Array.isArray(merged.dietaryRestrictions) ? merged.dietaryRestrictions : defaults.dietaryRestrictions,
    dislikes: Array.isArray(merged.dislikes) ? merged.dislikes : defaults.dislikes,
    cuisines: Array.isArray(merged.cuisines) ? merged.cuisines : defaults.cuisines,
    skill: merged.skill === 'Beginner' || merged.skill === 'Confident' ? merged.skill : defaults.skill,
    cookTime: typeof merged.cookTime === 'number' && merged.cookTime > 0 ? merged.cookTime : defaults.cookTime,
    equipment: Array.isArray(merged.equipment) ? merged.equipment : defaults.equipment,
    nutrition: Array.isArray(merged.nutrition) ? merged.nutrition : defaults.nutrition,
  };
}

export function parsePersistedKitchenState(value: string, defaults: Preferences): PersistedKitchenState {
  const saved = JSON.parse(value) as Partial<PersistedKitchenState> & LegacyState;
  if (!saved || typeof saved !== 'object') throw new Error('Saved kitchen data is not an object.');
  const preferences = normalizePreferences(saved.preferences, defaults);
  const ingredients = (Array.isArray(saved.ingredients) ? saved.ingredients : Array.isArray(saved.inventory) ? saved.inventory : [])
    .map(normalizeStoredIngredient);
  return {
    ingredients,
    preferences,
    plan: normalizePlan(saved.plan ?? [], preferences.servings),
    reservations: Array.isArray(saved.reservations) ? saved.reservations as ReservationRecord[] : [],
    completedMeals: Array.isArray(saved.completedMeals) ? saved.completedMeals as CompletedMeal[] : [],
    leftovers: Array.isArray(saved.leftovers) ? saved.leftovers as Leftover[] : [],
    shoppingList: saved.shoppingList && typeof saved.shoppingList === 'object'
      ? {
        checkedIds: Array.isArray(saved.shoppingList.checkedIds) ? saved.shoppingList.checkedIds : [],
        manualItems: Array.isArray(saved.shoppingList.manualItems) ? saved.shoppingList.manualItems : [],
      }
      : { checkedIds: [], manualItems: [] },
  };
}

export function migrateV1KitchenState(value: string, defaults: Preferences) {
  return parsePersistedKitchenState(value, defaults);
}