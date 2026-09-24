import type {
  CompletedMeal,
  Ingredient,
  Leftover,
  PlannedMeal,
  Preferences,
  ShoppingListState,
  ThemePreference,
} from '@/context/KitchenContext';
import { normalizeConfirmedDate, normalizeIngredientName, parseQuantityText, type ReservationRecord } from '@/lib/kitchenLogic';
import { parseCachedRecipes } from '@/lib/recipeDiscovery';
import { parseArchivedRecipes, parseExternalRecipe, type ArchivedRecipe } from '@/lib/recipeArchive';
import type { Recipe } from '@/data/recipes';
import type { ExternalRecipe } from '@workspace/api-client-react';
import { parseSavedSpaceScans, type SavedSpaceScan } from '@/lib/spaceScans';

export type PersistedKitchenState = {
  ingredients: Ingredient[];
  spaceScans: SavedSpaceScan[];
  preferences: Preferences;
  plan: PlannedMeal[];
  reservations: ReservationRecord[];
  completedMeals: CompletedMeal[];
  leftovers: Leftover[];
  shoppingList: ShoppingListState;
  savedRecipes: Recipe[];
  archivedRecipes: ArchivedRecipe[];
  savedKidPublishedRecipes: ExternalRecipe[];
  favoriteRecipeVersions: string[];
  onboardingComplete: boolean;
  reminders: import('@/lib/reminders').ReminderSettings;
  theme: ThemePreference;
};

export const defaultPreferences: Preferences = {
  householdSize: 2,
  servings: 2,
  allergies: [],
  dietaryRestrictions: [],
  dislikes: [],
  cuisines: [],
  skill: 'Comfortable',
  cookTime: 45,
  equipment: ['Stovetop', 'Oven'],
  nutrition: [],
};

export function emptyPersistedKitchenState(): PersistedKitchenState {
  return {
    ingredients: [],
    spaceScans: [],
    preferences: defaultPreferences,
    plan: [],
    reservations: [],
    completedMeals: [],
    leftovers: [],
    shoppingList: { checkedIds: [], manualItems: [] },
    savedRecipes: [],
    archivedRecipes: [],
    savedKidPublishedRecipes: [],
    favoriteRecipeVersions: [],
    onboardingComplete: false,
    reminders: { enabled: false, hour: 18, minute: 0 },
    theme: 'light',
  };
}

export function serializePersistedKitchenState(state: PersistedKitchenState) {
  return JSON.stringify(state);
}

export function removeSavedScanPhotos(state: PersistedKitchenState): PersistedKitchenState {
  return {
    ...state,
    ingredients: state.ingredients.map(({ photoUri: _photoUri, ...ingredient }) => ingredient),
  };
}

type LegacyState = {
  ingredients?: unknown;
  inventory?: unknown;
  preferences?: Partial<Preferences>;
  plan?: unknown;
};

function normalizeStoredIngredient(value: unknown, index: number): Ingredient {
  if (!value || typeof value !== 'object') throw new Error(`Saved ingredient ${index + 1} is invalid.`);
  const item = value as Partial<Ingredient>;
  if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Saved ingredient ${index + 1} has no name.`);
  const parsed = parseQuantityText(item.quantity);
  const quantityKnown = parsed.quantityKnown || (
    item.quantityKnown === true
      && typeof item.quantityValue === 'number'
      && Number.isFinite(item.quantityValue)
      && typeof item.unit === 'string'
      && parseQuantityText(`${item.quantityValue} ${item.unit}`).quantityKnown
  );
  const confirmedDate = item.dateConfirmed === true ? normalizeConfirmedDate(item.expires) : undefined;
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `migrated-ingredient-${index + 1}`,
    name: item.name,
    normalizedName: normalizeIngredientName(item.name),
    location: item.location === 'Freezer' || item.location === 'Pantry' ? item.location : 'Refrigerator',
    ...(quantityKnown
      ? parsed.quantityKnown
        ? { quantity: item.quantity, quantityValue: parsed.quantityValue, unit: parsed.unit, quantityKnown: true }
        : parseQuantityText(`${item.quantityValue} ${item.unit}`)
      : { quantity: item.quantity, quantityKnown: false }),
    status: item.status === 'low' || item.status === 'used' ? item.status : 'fresh',
    confidence: item.confidence === 'uncertain' ? 'uncertain' : 'confirmed',
    ...(confirmedDate ? { expires: confirmedDate, dateConfirmed: true } : {}),
    ...(item.dateKind === 'best-before' ? { dateKind: 'best-before' as const } : { dateKind: 'expiration' as const }),
    ...(typeof item.photoUri === 'string' ? { photoUri: item.photoUri } : {}),
    ...(typeof item.barcode === 'string' && /^\d{8,14}$/.test(item.barcode) ? { barcode: item.barcode } : {}),
    ...(typeof item.brand === 'string' && item.brand.trim() ? { brand: item.brand.trim() } : {}),
    ...(item.source === 'scan' || item.source === 'purchase' || item.source === 'manual' || item.source === 'barcode' ? { source: item.source } : {}),
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
      ...(typeof meal.recipeVersion === 'string' && meal.recipeVersion ? { recipeVersion: meal.recipeVersion } : {}),
      servings: typeof meal.servings === 'number' && meal.servings > 0 ? meal.servings : servings,
      ...(typeof meal.leftoverId === 'string' && meal.leftoverId ? { leftoverId: meal.leftoverId } : {}),
      ...(meal.needsConfirmation === true ? { needsConfirmation: true } : {}),
      ...(Array.isArray(meal.confirmationReasons) ? { confirmationReasons: meal.confirmationReasons.filter((reason): reason is string => typeof reason === 'string') } : {}),
    };
  });
}

function normalizePreferences(value: Partial<Preferences> | undefined, defaults: Preferences): Preferences {
  const merged = { ...defaults, ...(value ?? {}) };
  return {
    servings: typeof merged.servings === 'number' && merged.servings > 0 ? merged.servings : defaults.servings,
    householdSize: typeof merged.householdSize === 'number' && merged.householdSize > 0 ? merged.householdSize : defaults.householdSize,
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
    spaceScans: parseSavedSpaceScans(saved.spaceScans),
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
    savedRecipes: parseCachedRecipes(saved.savedRecipes),
    archivedRecipes: parseArchivedRecipes(saved.archivedRecipes),
    savedKidPublishedRecipes: Array.isArray(saved.savedKidPublishedRecipes)
      ? saved.savedKidPublishedRecipes.flatMap((item) => { const recipe = parseExternalRecipe(item); return recipe ? [recipe] : []; }).slice(0, 100)
      : [],
    favoriteRecipeVersions: Array.isArray(saved.favoriteRecipeVersions)
      ? saved.favoriteRecipeVersions.filter((value): value is string => typeof value === 'string')
      : [],
    onboardingComplete: saved.onboardingComplete !== false,
    reminders: saved.reminders && typeof saved.reminders === 'object'
      ? {
        enabled: (saved.reminders as { enabled?: unknown }).enabled === true,
        hour: typeof (saved.reminders as { hour?: unknown }).hour === 'number' ? Math.max(0, Math.min(23, (saved.reminders as { hour: number }).hour)) : 18,
        minute: typeof (saved.reminders as { minute?: unknown }).minute === 'number' ? Math.max(0, Math.min(59, (saved.reminders as { minute: number }).minute)) : 0,
      }
      : { enabled: false, hour: 18, minute: 0 },
    theme: saved.theme === 'dark' ? 'dark' : 'light',
  };
}

export function migrateV1KitchenState(value: string, defaults: Preferences) {
  return { ...parsePersistedKitchenState(value, defaults), onboardingComplete: true };
}
