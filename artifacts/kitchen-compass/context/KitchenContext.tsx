import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeIngredientName } from '@/lib/kitchenLogic';

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
}

interface KitchenContextValue {
  ingredients: Ingredient[];
  preferences: Preferences;
  plan: PlannedMeal[];
  hydrated: boolean;
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  updateIngredient: (id: string, changes: Partial<Ingredient>) => void;
  removeIngredient: (id: string) => void;
  toggleLow: (id: string) => void;
  setPreferences: (changes: Partial<Preferences>) => void;
  setMeal: (day: string, meal: MealType, recipeId: string) => void;
  removeMeal: (day: string, meal: MealType) => void;
  markCooked: (recipeIngredientNames: string[]) => void;
}

const STORAGE_KEY = 'kitchen-compass-state-v1';
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
  return { quantityValue: Number(match[1]), unit: match[2]?.toLowerCase(), quantityKnown: true };
}

export function KitchenProvider({ children }: { children: ReactNode }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preferences, setPreferencesState] = useState<Preferences>(defaultPreferences);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as Partial<{ ingredients: Ingredient[]; preferences: Preferences; plan: PlannedMeal[] }>;
        setIngredients(saved.ingredients ?? []);
        setPreferencesState({ ...defaultPreferences, ...(saved.preferences ?? {}) });
        setPlan(saved.plan ?? []);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ingredients, preferences, plan })).catch(() => undefined);
  }, [hydrated, ingredients, preferences, plan]);

  const value = useMemo<KitchenContextValue>(() => ({
    ingredients,
    preferences,
    plan,
    hydrated,
    addIngredient: (ingredient) => {
      setIngredients((current) => {
        const normalizedName = normalizeIngredientName(ingredient.name);
        const parsed = parseQuantity(ingredient.quantity);
        const incoming = { ...ingredient, normalizedName, ...parsed };
        const existingIndex = current.findIndex((item) => (item.normalizedName ?? normalizeIngredientName(item.name)) === normalizedName && item.location === ingredient.location);
        if (existingIndex < 0) return [...current, { ...incoming, id: createId() }];
        const existing = current[existingIndex];
        const sameUnit = existing.quantityKnown && incoming.quantityKnown && existing.unit === incoming.unit;
        if (sameUnit && existing.quantityValue !== undefined && incoming.quantityValue !== undefined) {
          const next = [...current];
          next[existingIndex] = {
            ...existing,
            ...ingredient,
            normalizedName,
            quantityValue: existing.quantityValue + incoming.quantityValue,
            quantity: `${existing.quantityValue + incoming.quantityValue}${incoming.unit ? ` ${incoming.unit}` : ''}`,
            unit: incoming.unit,
            quantityKnown: true,
            confidence: ingredient.confidence ?? existing.confidence,
          };
          return next;
        }
        if (!existing.quantityKnown && !incoming.quantityKnown) {
          const next = [...current];
          next[existingIndex] = { ...existing, ...ingredient, normalizedName, confidence: ingredient.confidence ?? existing.confidence };
          return next;
        }
        // Preserve both rows when quantities cannot be safely combined. Never overwrite stock.
        return [...current, { ...incoming, id: createId() }];
      });
    },
    updateIngredient: (id, changes) => setIngredients((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item)),
    removeIngredient: (id) => setIngredients((current) => current.filter((item) => item.id !== id)),
    toggleLow: (id) => setIngredients((current) => current.map((item) => item.id === id ? { ...item, status: item.status === 'low' ? 'fresh' : 'low' } : item)),
    setPreferences: (changes) => setPreferencesState((current) => ({ ...current, ...changes })),
    setMeal: (day, meal, recipeId) => setPlan((current) => [
      ...current.filter((item) => !(item.day === day && item.meal === meal)),
      { id: `${day}-${meal}`, day, meal, recipeId },
    ]),
    removeMeal: (day, meal) => setPlan((current) => current.filter((item) => !(item.day === day && item.meal === meal))),
    markCooked: (recipeIngredientNames) => setIngredients((current) => current.map((item) => {
      const matches = recipeIngredientNames.some((name) => item.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(item.name.toLowerCase()));
      return matches ? { ...item, status: 'used' } : item;
    })),
  }), [hydrated, ingredients, plan, preferences]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const context = useContext(KitchenContext);
  if (!context) throw new Error('useKitchen must be used within KitchenProvider');
  return context;
}