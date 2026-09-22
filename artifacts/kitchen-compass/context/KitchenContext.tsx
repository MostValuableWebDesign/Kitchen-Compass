import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  buildReservations,
  canonicalUnit,
  deductInventory,
  normalizeIngredientName,
  type Deduction,
  type ReservationRecord,
} from '@/lib/kitchenLogic';
import { recipes } from '@/data/recipes';

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
  photoUri?: string;
}

export interface Preferences {
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
  servings: number;
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
  hydrated: boolean;
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  addPurchasedItems: (rows: PurchaseRow[]) => void;
  updateIngredient: (id: string, changes: Partial<Ingredient>) => void;
  removeIngredient: (id: string) => void;
  toggleLow: (id: string) => void;
  setPreferences: (changes: Partial<Preferences>) => void;
  setMeal: (day: string, meal: MealType, recipeId: string, servings?: number) => void;
  removeMeal: (day: string, meal: MealType) => void;
  setShoppingList: (changes: Partial<ShoppingListState>) => void;
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

const STORAGE_KEY = 'kitchen-compass-state-v2';
const defaultPreferences: Preferences = {
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

const KitchenContext = createContext<KitchenContextValue | null>(null);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseQuantity(quantity?: string) {
  if (!quantity?.trim()) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
  if (!match) return { quantityValue: undefined, unit: undefined, quantityKnown: false };
  return { quantityValue: Number(match[1]), unit: canonicalUnit(match[2]), quantityKnown: Boolean(match[2]) };
}

function normalizeIngredient(ingredient: Ingredient) {
  const parsed = parseQuantity(ingredient.quantity);
  return {
    ...ingredient,
    normalizedName: normalizeIngredientName(ingredient.name),
    ...(ingredient.quantity === undefined ? {} : parsed),
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as Partial<{
          ingredients: Ingredient[];
          preferences: Preferences;
          plan: PlannedMeal[];
          reservations: ReservationRecord[];
          completedMeals: CompletedMeal[];
          leftovers: Leftover[];
          shoppingList: ShoppingListState;
        }>;
        setIngredients((saved.ingredients ?? []).map(normalizeIngredient));
        setPreferencesState({ ...defaultPreferences, ...(saved.preferences ?? {}) });
        setPlan((saved.plan ?? []).map((meal) => ({ ...meal, servings: meal.servings || saved.preferences?.servings || defaultPreferences.servings })));
        setReservations(saved.reservations ?? []);
        setCompletedMeals(saved.completedMeals ?? []);
        setLeftovers(saved.leftovers ?? []);
        setShoppingListState(saved.shoppingList ?? { checkedIds: [], manualItems: [] });
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      ingredients,
      preferences,
      plan,
      reservations,
      completedMeals,
      leftovers,
      shoppingList,
    })).catch(() => undefined);
  }, [hydrated, ingredients, preferences, plan, reservations, completedMeals, leftovers, shoppingList]);

  useEffect(() => {
    if (!hydrated) return;
    const built = buildReservations(plan, recipes, ingredients);
    setReservations(built.reservations);
    setReservationWarnings(built.warnings);
  }, [hydrated, plan, ingredients]);

  const value = useMemo<KitchenContextValue>(() => ({
    ingredients,
    preferences,
    plan,
    reservations,
    reservationWarnings,
    completedMeals,
    leftovers,
    shoppingList,
    hydrated,
    addIngredient: (ingredient) => {
      setIngredients((current) => {
        const incoming = normalizeIngredient({ ...ingredient, id: createId() });
        const existingIndex = current.findIndex((item) => (item.normalizedName ?? normalizeIngredientName(item.name)) === incoming.normalizedName && item.location === ingredient.location);
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
        const parsed = parseQuantity(row.quantity);
        if (!parsed.quantityKnown) return;
        setIngredients((current) => [...current, normalizeIngredient({
          id: createId(),
          name: row.name.trim(),
          quantity: row.quantity.trim(),
          location: row.location,
          status: 'fresh',
          confidence: 'confirmed',
        })]);
      });
    },
    updateIngredient: (id, changes) => setIngredients((current) => current.map((item) => item.id === id ? normalizeIngredient({ ...item, ...changes }) : item)),
    removeIngredient: (id) => setIngredients((current) => current.filter((item) => item.id !== id)),
    toggleLow: (id) => setIngredients((current) => current.map((item) => item.id === id ? { ...item, status: item.status === 'low' ? 'fresh' : 'low' } : item)),
    setPreferences: (changes) => setPreferencesState((current) => ({ ...current, ...changes })),
    setMeal: (day, meal, recipeId, servings = preferences.servings) => setPlan((current) => [
      ...current.filter((item) => !(item.day === day && item.meal === meal)),
      { id: `${day}-${meal}`, day, meal, recipeId, servings: Math.max(1, servings) },
    ]),
    removeMeal: (day, meal) => setPlan((current) => current.filter((item) => !(item.day === day && item.meal === meal))),
    setShoppingList: (changes) => setShoppingListState((current) => ({ ...current, ...changes })),
    previewCook: (plannedMealId, actualServings = plan.find((meal) => meal.id === plannedMealId)?.servings ?? preferences.servings) => {
      const planned = plan.find((meal) => meal.id === plannedMealId);
      if (!planned) return null;
      const recipe = recipes.find((item) => item.id === planned.recipeId);
      if (!recipe) return null;
      const mealReservations = reservations.filter((reservation) => reservation.plannedMealId === plannedMealId && reservation.quantityKnown && reservation.inventoryId);
      return {
        transactionId: `cook-${plannedMealId}`,
        plannedMealId,
        recipeId: recipe.id,
        servings: actualServings,
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
      setIngredients((current) => deductInventory(current.filter((item): item is Ingredient & { id: string } => Boolean(item.id)), input.deductions));
      setCompletedMeals((current) => [...current, { transactionId: input.transactionId, plannedMealId: input.plannedMealId, recipeId: input.recipeId, servings: input.servings, completedAt: new Date().toISOString() }]);
      if (input.leftoverPortions > 0) {
        const recipe = recipes.find((item) => item.id === input.recipeId);
        setLeftovers((current) => [...current, { id: createId(), transactionId: input.transactionId, recipeId: input.recipeId, portions: input.leftoverPortions, preparedAt: new Date().toISOString(), useBy: new Date(Date.now() + 3 * 86_400_000).toISOString(), storageLocation: 'Refrigerator', reheatingInstructions: recipe?.reheatingInstructions ?? 'Reheat until steaming hot.' }]);
      }
      setReservations((current) => current.filter((reservation) => reservation.plannedMealId !== input.plannedMealId));
      setPlan((current) => current.filter((meal) => meal.id !== input.plannedMealId));
      return true;
    },
  }), [completedMeals, hydrated, ingredients, leftovers, plan, preferences, reservationWarnings, reservations, shoppingList]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const context = useContext(KitchenContext);
  if (!context) throw new Error('useKitchen must be used within KitchenProvider');
  return context;
}