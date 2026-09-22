import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  buildReservations,
  applyCookingTransaction,
  applyLeftoverCookingTransaction,
  consumeLeftover,
  generatePlanIncrementally,
  inventoryAfterReservations,
  ingredientRowsMatch,
  movePlannedMeals,
  normalizeIngredientName,
  normalizeConfirmedDate,
  parseQuantityText,
  rankPlanRecipes,
  type Deduction,
  type MealSlot,
  type ReservationRecord,
} from '@/lib/kitchenLogic';
import type { Recipe } from '@/data/recipes';
import { defaultPreferences, migrateV1KitchenState, parsePersistedKitchenState, type PersistedKitchenState } from '@/lib/kitchenPersistence';
import { mergeRecipes, recipeVersion } from '@/lib/recipeDiscovery';
import { getAvailableRecipes, lookupPlannedRecipe } from '@/lib/recipeLookup';
import { defaultReminderSettings, syncDailyReminder, type ReminderScheduler, type ReminderSettings } from '@/lib/reminders';
import { SCAN_ACCESS_TOKEN_STORAGE_KEY } from '@/lib/scanAccessToken';
import { deleteScanPhoto, deleteScanPhotos } from '@/lib/scanPhotos';

const reminderScheduler: ReminderScheduler = {
  getPermissionsAsync: Notifications.getPermissionsAsync,
  requestPermissionsAsync: Notifications.requestPermissionsAsync,
  cancelAllScheduledNotificationsAsync: Notifications.cancelAllScheduledNotificationsAsync,
  scheduleNotificationAsync: ({ content, trigger }) => Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: trigger.hour,
      minute: trigger.minute,
    },
  }),
};

export type StorageLocation = 'Refrigerator' | 'Freezer' | 'Pantry';
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';

export interface Ingredient {
  id: string;
  name: string;
  normalizedName?: string;
  location: StorageLocation;
  quantity?: string;
  quantityValue?: number;
  unit?: string;
  quantityKnown?: boolean;
  status: 'fresh' | 'low' | 'used';
  confidence?: 'confirmed' | 'uncertain';
  expires?: string;
  dateConfirmed?: boolean;
  dateKind?: 'expiration' | 'best-before';
  photoUri?: string;
  source?: 'manual' | 'scan' | 'purchase';
  sourceScanId?: string;
  sourcePhotoId?: string;
  reviewedAt?: string;
}

export interface Preferences {
  householdSize: number;
  servings: number;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikes: string[];
  cuisines: string[];
  skill: 'Beginner' | 'Comfortable' | 'Confident';
  cookTime: number;
  equipment: string[];
  nutrition: string[];
}

export interface PlannedMeal {
  id: string;
  day: string;
  meal: MealType;
  recipeId: string;
  recipeVersion?: string;
  servings: number;
  leftoverId?: string;
  needsConfirmation?: boolean;
  confirmationReasons?: string[];
  shortageReasons?: string[];
}

export interface CompletedMeal {
  transactionId: string;
  plannedMealId: string;
  recipeId: string;
  servings: number;
  completedAt: string;
}

export interface Leftover {
  id: string;
  transactionId: string;
  recipeId: string;
  recipeVersion?: string;
  portions: number;
  preparedAt: string;
  useBy: string;
  storageLocation: StorageLocation;
  reheatingInstructions: string;
}

export interface ShoppingListState {
  checkedIds: string[];
  manualItems: string[];
}

export type PurchaseRow = {
  name: string;
  quantity: string;
  location: StorageLocation;
  confirmed: boolean;
};

export type CookPreview = {
  transactionId: string;
  plannedMealId: string;
  recipeId: string;
  servings: number;
  deductions: Array<Deduction & { ingredientName: string; inventoryName: string }>;
};

interface KitchenContextValue {
  ingredients: Ingredient[];
  preferences: Preferences;
  plan: PlannedMeal[];
  reservations: ReservationRecord[];
  reservationWarnings: string[];
  completedMeals: CompletedMeal[];
  leftovers: Leftover[];
  shoppingList: ShoppingListState;
  savedRecipes: Recipe[];
  favoriteRecipeVersions: string[];
  onboardingComplete: boolean;
  reminders: ReminderSettings;
  hydrated: boolean;
  storageError: string | null;
  retryHydration: () => void;
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  addPurchasedItems: (rows: PurchaseRow[]) => void;
  updateIngredient: (id: string, changes: Partial<Ingredient>) => void;
  removeIngredient: (id: string) => void;
  toggleLow: (id: string) => void;
  setPreferences: (changes: Partial<Preferences>) => void;
  completeOnboarding: (changes: Preferences) => void;
  setReminderSettings: (changes: Partial<ReminderSettings>) => Promise<boolean>;
  clearSavedScanPhotos: () => void;
  eraseAllData: () => Promise<void>;
  setMeal: (day: string, meal: MealType, recipeId: string, servings?: number, recipeVersion?: string) => void;
  removeMeal: (day: string, meal: MealType) => void;
  generatePlan: (days?: string[], meals?: MealType[]) => void;
  swapMeal: (day: string, meal: MealType) => void;
  moveMeal: (source: MealSlot, target: MealSlot) => void;
  planLeftover: (day: string, meal: MealType, leftoverId: string, portions?: number) => boolean;
  setShoppingList: (changes: Partial<ShoppingListState>) => void;
  saveDiscoveredRecipes: (nextRecipes: Recipe[]) => void;
  toggleFavoriteRecipe: (recipe: Recipe) => void;
  previewCook: (plannedMealId: string, actualServings?: number) => CookPreview | null;
  completeCook: (input: {
    transactionId: string;
    plannedMealId: string;
    recipeId: string;
    servings: number;
    deductions: Deduction[];
    leftoverPortions: number;
  }) => boolean;
}

export const STORAGE_KEY = 'kitchen-compass-state-v2';
export const LEGACY_STORAGE_KEY = 'kitchen-compass-state-v1';
const KitchenContext = createContext<KitchenContextValue | null>(null);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeIngredient(ingredient: Ingredient) {
  const parsed = parseQuantityText(ingredient.quantity);
  const confirmedDate = ingredient.dateConfirmed ? normalizeConfirmedDate(ingredient.expires) : undefined;
  return {
    ...ingredient,
    normalizedName: normalizeIngredientName(ingredient.name),
    ...parsed,
    ...(confirmedDate ? { expires: confirmedDate, dateConfirmed: true } : { expires: undefined, dateConfirmed: false }),
  };
}

export function KitchenProvider({ children }: { children: ReactNode }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preferences, setPreferencesState] = useState<Preferences>(defaultPreferences);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [reservationWarnings, setReservationWarnings] = useState<string[]>([]);
  const [completedMeals, setCompletedMeals] = useState<CompletedMeal[]>([]);
  const [leftovers, setLeftovers] = useState<Leftover[]>([]);
  const [shoppingList, setShoppingListState] = useState<ShoppingListState>({ checkedIds: [], manualItems: [] });
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [favoriteRecipeVersions, setFavoriteRecipeVersions] = useState<string[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [reminders, setReminders] = useState<ReminderSettings>(defaultReminderSettings);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    const load = async () => {
      try {
        const v2 = await AsyncStorage.getItem(STORAGE_KEY);
        let parsed: PersistedKitchenState;
        if (v2 !== null) {
          parsed = parsePersistedKitchenState(v2, defaultPreferences);
        } else {
          const v1 = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          parsed = v1
            ? migrateV1KitchenState(v1, defaultPreferences)
            : {
              ingredients: [],
              preferences: defaultPreferences,
              plan: [],
              reservations: [],
              completedMeals: [],
              leftovers: [],
              shoppingList: { checkedIds: [], manualItems: [] },
               savedRecipes: [],
               favoriteRecipeVersions: [],
               onboardingComplete: false,
               reminders: defaultReminderSettings,
            };
          // Keep v1 as a recovery copy. The migration is complete only after v2 is written.
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        if (!active) return;
        setIngredients(parsed.ingredients.map(normalizeIngredient));
        setPreferencesState(parsed.preferences);
        setPlan(parsed.plan);
        setReservations(parsed.reservations);
        setCompletedMeals(parsed.completedMeals);
        setLeftovers(parsed.leftovers);
        setShoppingListState(parsed.shoppingList);
        setSavedRecipes(parsed.savedRecipes);
        setFavoriteRecipeVersions(parsed.favoriteRecipeVersions);
        setOnboardingComplete(parsed.onboardingComplete);
        setReminders(parsed.reminders);
        setStorageError(null);
        setHydrated(true);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Saved kitchen data could not be loaded.';
        setStorageError(message);
        setHydrated(false);
        Alert.alert(
          'Kitchen data needs attention',
          'Your saved kitchen was not replaced. Retry the load, or keep this screen open and try again later.',
          [{ text: 'Retry', onPress: () => setLoadAttempt((attempt) => attempt + 1) }, { text: 'Keep open', style: 'cancel' }],
        );
      }
    };
    void load();
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!hydrated || storageError) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      ingredients,
      preferences,
      plan,
      reservations,
      completedMeals,
      leftovers,
      shoppingList,
      savedRecipes,
      favoriteRecipeVersions,
      onboardingComplete,
      reminders,
    })).catch(() => undefined);
  }, [hydrated, ingredients, preferences, plan, reservations, completedMeals, leftovers, shoppingList, savedRecipes, favoriteRecipeVersions, onboardingComplete, reminders, storageError]);

  useEffect(() => {
    if (!hydrated || !reminders.enabled) return;
    void syncDailyReminder(reminders, reminderScheduler, false).catch(() => undefined);
  }, [hydrated, reminders]);

  useEffect(() => {
    if (!hydrated) return;
    const built = buildReservations(plan, getAvailableRecipes(savedRecipes), ingredients, leftovers);
    setReservations(built.reservations);
    setReservationWarnings(built.warnings);
  }, [hydrated, plan, ingredients, leftovers, savedRecipes]);

  const value = useMemo<KitchenContextValue>(() => ({
    ingredients,
    preferences,
    plan,
    reservations,
    reservationWarnings,
    completedMeals,
    leftovers,
    shoppingList,
    savedRecipes,
    favoriteRecipeVersions,
    onboardingComplete,
    reminders,
    hydrated,
    storageError,
    retryHydration: () => setLoadAttempt((attempt) => attempt + 1),
    addIngredient: (ingredient) => {
      setIngredients((current) => {
        const incoming = normalizeIngredient({ ...ingredient, id: createId() });
        const existingIndex = current.findIndex((item) => ingredientRowsMatch(item, incoming));
        if (existingIndex < 0) return [...current, incoming];
        const existing = current[existingIndex];
        const sameUnit = existing.quantityKnown && incoming.quantityKnown && existing.unit === incoming.unit;
        if (sameUnit && existing.quantityValue !== undefined && incoming.quantityValue !== undefined) {
          const next = [...current];
          const total = existing.quantityValue + incoming.quantityValue;
          next[existingIndex] = { ...existing, ...ingredient, normalizedName: incoming.normalizedName, quantityValue: total, quantity: `${total} ${incoming.unit}`, unit: incoming.unit, quantityKnown: true, confidence: ingredient.confidence ?? existing.confidence };
          return next;
        }
        if (!existing.quantityKnown && !incoming.quantityKnown) {
          const next = [...current];
          next[existingIndex] = { ...existing, ...ingredient, normalizedName: incoming.normalizedName, confidence: ingredient.confidence ?? existing.confidence };
          return next;
        }
        return [...current, incoming];
      });
    },
    addPurchasedItems: (rows) => {
      rows.filter((row) => row.confirmed && row.name.trim()).forEach((row) => {
        const parsed = parseQuantityText(row.quantity);
        if (!parsed.quantityKnown) return;
        setIngredients((current) => [...current, normalizeIngredient({
          id: createId(),
          name: row.name.trim(),
          quantity: row.quantity.trim(),
          location: row.location,
          status: 'fresh',
          confidence: 'confirmed',
           source: 'purchase',
           reviewedAt: new Date().toISOString(),
        })]);
      });
    },
    updateIngredient: (id, changes) => setIngredients((current) => current.map((item) => {
      if (item.id !== id) return item;
      if ('photoUri' in changes && changes.photoUri !== item.photoUri) deleteScanPhoto(item.photoUri);
      return normalizeIngredient({ ...item, ...changes });
    })),
    removeIngredient: (id) => setIngredients((current) => {
      deleteScanPhoto(current.find((item) => item.id === id)?.photoUri);
      return current.filter((item) => item.id !== id);
    }),
    toggleLow: (id) => setIngredients((current) => current.map((item) => item.id === id ? { ...item, status: item.status === 'low' ? 'fresh' : 'low' } : item)),
    setPreferences: (changes) => setPreferencesState((current) => ({ ...current, ...changes })),
    completeOnboarding: (changes) => {
      setPreferencesState(changes);
      setOnboardingComplete(true);
    },
    setReminderSettings: async (changes) => {
      const next = { ...reminders, ...changes, hour: Math.max(0, Math.min(23, changes.hour ?? reminders.hour)), minute: Math.max(0, Math.min(59, changes.minute ?? reminders.minute)) };
      let result;
      try {
        result = await syncDailyReminder(next, reminderScheduler, true);
      } catch {
        setReminders({ ...next, enabled: false });
        return false;
      }
      if (!result.enabled && next.enabled) {
        setReminders({ ...next, enabled: false });
        return false;
      }
      setReminders({ ...next, enabled: result.enabled });
      return true;
    },
    clearSavedScanPhotos: () => setIngredients((current) => {
      deleteScanPhotos(current.map((item) => item.photoUri));
      return current.map((item) => item.photoUri ? { ...item, photoUri: undefined } : item);
    }),
    eraseAllData: async () => {
      await syncDailyReminder({ ...defaultReminderSettings, enabled: false }, reminderScheduler, false);
      deleteScanPhotos(ingredients.map((item) => item.photoUri));
      await AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_STORAGE_KEY, SCAN_ACCESS_TOKEN_STORAGE_KEY]);
      setIngredients([]);
      setPreferencesState(defaultPreferences);
      setPlan([]);
      setReservations([]);
      setReservationWarnings([]);
      setCompletedMeals([]);
      setLeftovers([]);
      setShoppingListState({ checkedIds: [], manualItems: [] });
      setSavedRecipes([]);
      setFavoriteRecipeVersions([]);
      setReminders(defaultReminderSettings);
      setOnboardingComplete(false);
    },
    saveDiscoveredRecipes: (nextRecipes) => setSavedRecipes((current) => mergeRecipes(current, nextRecipes).filter((recipe) => recipe.source === 'server-ai')),
    toggleFavoriteRecipe: (recipe) => setFavoriteRecipeVersions((current) => {
      const version = recipeVersion(recipe);
      return current.includes(version) ? current.filter((item) => item !== version) : [...current, version];
    }),
     setMeal: (day, meal, recipeId, servings = preferences.servings, selectedRecipeVersion) => setPlan((current) => {
       const nextServings = Math.max(1, servings);
       const basePlan = current.filter((item) => !(item.day === day && item.meal === meal));
       const availableRecipes = getAvailableRecipes(savedRecipes);
       const selectedRecipe = availableRecipes.find((recipe) => recipe.id === recipeId && (!selectedRecipeVersion || recipeVersion(recipe) === selectedRecipeVersion));
       const baseReservations = buildReservations(basePlan, availableRecipes, ingredients, leftovers).reservations;
       const remainingInventory = inventoryAfterReservations(ingredients, baseReservations);
       const ranked = selectedRecipe
         ? rankPlanRecipes([selectedRecipe], remainingInventory, preferences, nextServings, basePlan.map((item) => item.recipeId))
         : [];
       const assessment = ranked[0];
       return [
         ...basePlan,
         {
           id: `${day}-${meal}`,
           day,
           meal,
           recipeId,
           ...(selectedRecipeVersion ? { recipeVersion: selectedRecipeVersion } : {}),
           servings: nextServings,
           ...(assessment?.needsConfirmation ? { needsConfirmation: true, confirmationReasons: assessment.confirmationReasons } : {}),
           ...(assessment?.shortageReasons.length ? { shortageReasons: assessment.shortageReasons } : {}),
         },
       ];
     }),
    removeMeal: (day, meal) => setPlan((current) => current.filter((item) => !(item.day === day && item.meal === meal))),
     generatePlan: (requestedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], requestedMeals = ['Breakfast', 'Lunch', 'Dinner']) => setPlan((current) => {
        const availableRecipes = getAvailableRecipes(savedRecipes);
        return generatePlanIncrementally(current, requestedDays, requestedMeals, availableRecipes, ingredients, preferences, preferences.servings, leftovers)
          .map((meal) => {
            const recipe = availableRecipes.find((item) => item.id === meal.recipeId);
            return recipe ? { ...meal, recipeVersion: recipeVersion(recipe) } : meal;
          });
     }),
     swapMeal: (day, meal) => setPlan((current) => {
       const existing = current.find((item) => item.day === day && item.meal === meal);
        const basePlan = current.filter((item) => item.id !== existing?.id);
        const availableRecipes = getAvailableRecipes(savedRecipes);
        const baseReservations = buildReservations(basePlan, availableRecipes, ingredients, leftovers).reservations;
        const remainingInventory = inventoryAfterReservations(ingredients, baseReservations);
       const candidates = rankPlanRecipes(
           availableRecipes.filter((recipe) => meal === 'Breakfast' ? recipe.meal === 'Breakfast' : recipe.meal !== 'Breakfast'),
          remainingInventory,
         preferences,
         existing?.servings ?? preferences.servings,
          basePlan.map((item) => item.recipeId),
       );
       const next = candidates.find((item) => item.recipe.id !== existing?.recipeId) ?? candidates[0];
       if (!next) return current;
       return [
         ...current.filter((item) => !(item.day === day && item.meal === meal)),
         {
           id: existing?.id ?? `${day}-${meal}`,
           day,
           meal,
           recipeId: next.recipe.id,
           recipeVersion: recipeVersion(next.recipe),
           servings: existing?.servings ?? preferences.servings,
           ...(next.needsConfirmation ? { needsConfirmation: true, confirmationReasons: next.confirmationReasons } : {}),
            ...(next.shortageReasons.length ? { shortageReasons: next.shortageReasons } : {}),
         },
       ];
     }),
     moveMeal: (source, target) => setPlan((current) => movePlannedMeals(current, source, target)),
     planLeftover: (day, meal, leftoverId, portions = 1) => {
       const leftover = leftovers.find((item) => item.id === leftoverId);
       if (!leftover || portions <= 0 || portions > leftover.portions) return false;
        const targetId = `${day}-${meal}`;
        const alreadyPlanned = plan
          .filter((item) => item.leftoverId === leftoverId && item.id !== targetId)
          .reduce((sum, item) => sum + item.servings, 0);
        if (alreadyPlanned + portions > leftover.portions) return false;
        setPlan((current) => [
          ...current.filter((item) => !(item.day === day && item.meal === meal)),
          { id: targetId, day, meal, recipeId: leftover.recipeId, ...(leftover.recipeVersion ? { recipeVersion: leftover.recipeVersion } : {}), leftoverId, servings: portions },
        ]);
       return true;
     },
    setShoppingList: (changes) => setShoppingListState((current) => ({ ...current, ...changes })),
    previewCook: (plannedMealId, actualServings = plan.find((meal) => meal.id === plannedMealId)?.servings ?? preferences.servings) => {
      const planned = plan.find((meal) => meal.id === plannedMealId);
      if (!planned) return null;
       const recipe = lookupPlannedRecipe(planned, savedRecipes);
      if (!recipe) return null;
       const mealReservations = planned.leftoverId ? [] : reservations.filter((reservation) => reservation.plannedMealId === plannedMealId && reservation.quantityKnown && reservation.inventoryId);
      return {
        transactionId: `cook-${plannedMealId}`,
        plannedMealId,
        recipeId: recipe.id,
        servings: planned.leftoverId ? planned.servings : actualServings,
        deductions: mealReservations.flatMap((reservation) => {
          const inventory = ingredients.find((item) => item.id === reservation.inventoryId);
          return inventory && reservation.quantity !== undefined && reservation.unit ? [{ inventoryId: inventory.id, quantity: reservation.quantity, unit: reservation.unit, ingredientName: reservation.ingredientName, inventoryName: inventory.name }] : [];
        }),
      };
    },
    completeCook: (input) => {
      if (completedMeals.some((meal) => meal.transactionId === input.transactionId)) return false;
      const planItem = plan.find((meal) => meal.id === input.plannedMealId);
      if (!planItem) return false;
       const recipe = lookupPlannedRecipe(planItem, savedRecipes);
       if (!recipe || input.recipeId !== planItem.recipeId) return false;
       const plannedLeftover = planItem.leftoverId ? leftovers.find((item) => item.id === planItem.leftoverId) : undefined;
        const plannedPortions = planItem.leftoverId ? planItem.servings : input.servings;
        if (planItem.leftoverId && (!plannedLeftover || plannedPortions > plannedLeftover.portions)) return false;
        const leftoverTransaction = plannedLeftover
          ? applyLeftoverCookingTransaction(leftovers, completedMeals.map((meal) => meal.transactionId), input.transactionId, plannedLeftover.id, plannedPortions)
          : undefined;
        if (plannedLeftover && !leftoverTransaction?.applied) return false;
       const transaction = applyCookingTransaction(
        ingredients.filter((item): item is Ingredient & { id: string } => Boolean(item.id)),
        completedMeals.map((meal) => meal.transactionId),
        input.transactionId,
         planItem.leftoverId ? [] : input.deductions,
      );
      if (!transaction.applied) return false;
      setIngredients(transaction.inventory);
      setCompletedMeals((current) => current.some((meal) => meal.transactionId === input.transactionId)
        ? current
         : [...current, { transactionId: input.transactionId, plannedMealId: input.plannedMealId, recipeId: input.recipeId, servings: plannedPortions, completedAt: new Date().toISOString() }]);
        if (leftoverTransaction) {
          setLeftovers(leftoverTransaction.leftovers);
       } else if (input.leftoverPortions > 0) {
         setLeftovers((current) => [...current, { id: createId(), transactionId: input.transactionId, recipeId: input.recipeId, recipeVersion: recipeVersion(recipe), portions: input.leftoverPortions, preparedAt: new Date().toISOString(), useBy: new Date(Date.now() + 3 * 86_400_000).toISOString(), storageLocation: 'Refrigerator', reheatingInstructions: recipe.reheatingInstructions ?? 'Reheat until steaming hot.' }]);
      }
      setReservations((current) => current.filter((reservation) => reservation.plannedMealId !== input.plannedMealId));
      setPlan((current) => current.filter((meal) => meal.id !== input.plannedMealId));
      return true;
    },
  }), [completedMeals, favoriteRecipeVersions, hydrated, ingredients, leftovers, onboardingComplete, plan, preferences, reminders, reservationWarnings, reservations, savedRecipes, shoppingList, storageError]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const context = useContext(KitchenContext);
  if (!context) throw new Error('useKitchen must be used within KitchenProvider');
  return context;
}
