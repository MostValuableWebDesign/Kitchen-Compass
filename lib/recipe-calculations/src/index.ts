export type NutritionAmounts = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
  addedSugar: number;
  saturatedFat: number;
};

export type NutritionDisplay = Pick<NutritionAmounts, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sodium'>;

export type NutritionReferenceSource = {
  id: string;
  label: string;
};

export type NutritionCoverage = {
  coveredIngredients: string[];
  uncoveredIngredients: string[];
  ingredientCoverage: number;
  source: NutritionReferenceSource;
};

export type NutritionCalculation = NutritionCoverage & {
  status: 'calculated' | 'insufficient-information';
  perServing?: NutritionAmounts;
  total?: NutritionAmounts;
  vegetableServingsPerServing?: number;
};

export type ScoreFactor = {
  key: 'vegetables' | 'fiber' | 'protein' | 'sodium' | 'added-sugar' | 'saturated-fat';
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  points: number;
  detail: string;
};

export type HealthScoreCalculation = {
  status: 'calculated' | 'insufficient-information';
  score?: number;
  note: string;
  factors: ScoreFactor[];
};

export {
  assessIngredientAllergens,
  assessRecipeAllergens,
  hasUnknownAllergenInformation,
  normalizeAllergen,
  requestedAllergenConflicts,
  type CommonAllergen,
  type IngredientAllergenAssessment,
  type RecipeAllergenAssessment,
} from './allergenSafety';

type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  required?: boolean;
};

type ReferenceEntry = {
  names: string[];
  unit: string;
  amounts: NutritionAmounts;
  vegetableServings: number;
  source: NutritionReferenceSource;
};

const bundledSource: NutritionReferenceSource = {
  id: 'bundled-ingredient-reference-v1',
  label: 'Bundled ingredient reference table; unsupported ingredients are not estimated.',
};

/**
 * These are deliberately bundled, named reference entries rather than AI
 * estimates. Values are normalized to the stated unit and are only used when
 * the recipe ingredient name and quantity unit are both supported.
 */
const references: ReferenceEntry[] = [
  { names: ['chicken', 'chicken breast'], unit: 'breast', amounts: { calories: 284, protein: 53.4, carbs: 0, fat: 6.2, fiber: 0, sodium: 140, addedSugar: 0, saturatedFat: 1.7 }, vegetableServings: 0, source: bundledSource },
  { names: ['lemon'], unit: 'fruit', amounts: { calories: 17, protein: 0.6, carbs: 5.4, fat: 0.2, fiber: 1.6, sodium: 1, addedSugar: 0, saturatedFat: 0, }, vegetableServings: 0, source: bundledSource },
  { names: ['broccoli'], unit: 'cup', amounts: { calories: 31, protein: 2.5, carbs: 6, fat: 0.3, fiber: 2.4, sodium: 30, addedSugar: 0, saturatedFat: 0.1 }, vegetableServings: 1, source: bundledSource },
  { names: ['olive oil'], unit: 'tbsp', amounts: { calories: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0, sodium: 0, addedSugar: 0, saturatedFat: 1.9 }, vegetableServings: 0, source: bundledSource },
  { names: ['garlic'], unit: 'clove', amounts: { calories: 4, protein: 0.2, carbs: 1, fat: 0, fiber: 0.1, sodium: 1, addedSugar: 0, saturatedFat: 0 }, vegetableServings: 0.05, source: bundledSource },
  { names: ['parsley', 'fresh parsley'], unit: 'tbsp', amounts: { calories: 1, protein: 0.1, carbs: 0.2, fat: 0, fiber: 0.1, sodium: 2, addedSugar: 0, saturatedFat: 0 }, vegetableServings: 0.05, source: bundledSource },
  { names: ['pasta'], unit: 'oz', amounts: { calories: 99, protein: 3.5, carbs: 20.2, fat: 0.6, fiber: 1.2, sodium: 1, addedSugar: 0, saturatedFat: 0.1 }, vegetableServings: 0, source: bundledSource },
  { names: ['tomato', 'canned tomatoes'], unit: 'oz', amounts: { calories: 5, protein: 0.2, carbs: 1.1, fat: 0.1, fiber: 0.3, sodium: 15, addedSugar: 0, saturatedFat: 0 }, vegetableServings: 0.125, source: bundledSource },
  { names: ['basil'], unit: 'handful', amounts: { calories: 1, protein: 0.1, carbs: 0.2, fat: 0, fiber: 0.1, sodium: 0, addedSugar: 0, saturatedFat: 0 }, vegetableServings: 0.1, source: bundledSource },
  { names: ['parmesan'], unit: 'tbsp', amounts: { calories: 21, protein: 1.9, carbs: 0.2, fat: 1.4, fiber: 0, sodium: 76, addedSugar: 0, saturatedFat: 0.9 }, vegetableServings: 0, source: bundledSource },
  { names: ['egg'], unit: 'egg', amounts: { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fiber: 0, sodium: 71, addedSugar: 0, saturatedFat: 1.6 }, vegetableServings: 0, source: bundledSource },
  { names: ['avocado'], unit: 'fruit', amounts: { calories: 322, protein: 4, carbs: 17, fat: 29.5, fiber: 13.5, sodium: 14, addedSugar: 0, saturatedFat: 4.3 }, vegetableServings: 2, source: bundledSource },
  { names: ['bread'], unit: 'slice', amounts: { calories: 79, protein: 2.7, carbs: 14.3, fat: 1, fiber: 0.8, sodium: 147, addedSugar: 1.4, saturatedFat: 0.3 }, vegetableServings: 0, source: bundledSource },
];

export function supportedNutritionInputs() {
  return references.map((entry) => ({ name: entry.names[0], unit: entry.unit }));
}

const aliases: Record<string, string> = {
  eggs: 'egg',
  'chicken breast': 'chicken breast',
  'fresh parsley': 'fresh parsley',
  'canned tomatoes': 'canned tomatoes',
  tomatoes: 'tomato',
};

function normalizeName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
  return aliases[normalized] ?? (normalized.endsWith('s') && !normalized.endsWith('ss') ? normalized.slice(0, -1) : normalized);
}

function normalizeUnit(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  const singular = normalized.endsWith('s') && normalized !== 'tbsp' ? normalized.slice(0, -1) : normalized;
  return ({
    tablespoons: 'tbsp',
    tablespoon: 'tbsp',
    teaspoons: 'tsp',
    teaspoon: 'tsp',
    pounds: 'lb',
    pound: 'lb',
    ounces: 'oz',
    ounce: 'oz',
    kilograms: 'kg',
    kilogram: 'kg',
    grams: 'g',
    gram: 'g',
    liters: 'l',
    liter: 'l',
    milliliters: 'ml',
    milliliter: 'ml',
    cups: 'cup',
    cloves: 'clove',
    eggs: 'egg',
    slices: 'slice',
    fruits: 'fruit',
    handfuls: 'handful',
  } as Record<string, string>)[singular] ?? singular;
}

type UnitFamily = 'weight' | 'volume' | 'count';

function unitInfo(unit: string): { family: UnitFamily; factor: number } | undefined {
  switch (normalizeUnit(unit)) {
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
    default: return undefined;
  }
}

function convert(quantity: number, fromUnit: string, toUnit: string) {
  const from = unitInfo(fromUnit);
  const to = unitInfo(toUnit);
  if (!from || !to || from.family !== to.family) return undefined;
  return quantity * from.factor / to.factor;
}

function round(value: number) {
  return Number(value.toFixed(1));
}

function findReference(name: string) {
  const normalized = normalizeName(name);
  return references.find((entry) => entry.names.map(normalizeName).includes(normalized));
}

export function calculateRecipeNutrition(ingredients: Ingredient[], servings: number): NutritionCalculation {
  const coveredIngredients: string[] = [];
  const uncoveredIngredients: string[] = [];
  const total: NutritionAmounts = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, addedSugar: 0, saturatedFat: 0 };
  let vegetableServings = 0;

  if (!Number.isFinite(servings) || servings <= 0) {
    return { status: 'insufficient-information', ...coverage([], ingredients.map((ingredient) => ingredient.name), 0) };
  }

  for (const ingredient of ingredients) {
    const reference = findReference(ingredient.name);
    const quantity = reference ? convert(ingredient.quantity, ingredient.unit, reference.unit) : undefined;
    if (!reference || quantity === undefined) {
      uncoveredIngredients.push(ingredient.name);
      continue;
    }
    coveredIngredients.push(ingredient.name);
    for (const key of Object.keys(total) as Array<keyof NutritionAmounts>) total[key] += reference.amounts[key] * quantity;
    vegetableServings += reference.vegetableServings * quantity;
  }

  const complete = uncoveredIngredients.length === 0 && ingredients.length > 0;
  const result: NutritionCalculation = {
    status: complete ? 'calculated' : 'insufficient-information',
    ...coverage(coveredIngredients, uncoveredIngredients, ingredients.length),
  };
  if (complete) {
    result.total = Object.fromEntries(Object.entries(total).map(([key, value]) => [key, round(value)])) as NutritionAmounts;
    result.perServing = Object.fromEntries(Object.entries(total).map(([key, value]) => [key, round(value / servings)])) as NutritionAmounts;
    result.vegetableServingsPerServing = round(vegetableServings / servings);
  }
  return result;
}

function coverage(coveredIngredients: string[], uncoveredIngredients: string[], totalIngredients: number): NutritionCoverage {
  return {
    coveredIngredients,
    uncoveredIngredients,
    ingredientCoverage: totalIngredients ? round(coveredIngredients.length / totalIngredients) : 0,
    source: bundledSource,
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function calculateHealthScore(nutrition: NutritionCalculation): HealthScoreCalculation {
  if (nutrition.status !== 'calculated' || !nutrition.perServing || nutrition.vegetableServingsPerServing === undefined) {
    const missing = nutrition.uncoveredIngredients.length ? ` Missing reference data: ${nutrition.uncoveredIngredients.join(', ')}.` : '';
    return {
      status: 'insufficient-information',
      note: `Insufficient information to calculate the 0–100 general-health score.${missing}`,
      factors: [],
    };
  }

  // Documented rubric: vegetables 20 points, fiber 15, protein 15,
  // sodium 20, added sugar 15, and saturated fat 15. Each factor is
  // normalized per serving; allergy and dietary safety are not inputs.
  const values = nutrition.perServing;
  const definitions: Array<{ key: ScoreFactor['key']; label: string; points: number; detail: string; positive: boolean }> = [
    { key: 'vegetables', label: 'Vegetables', points: 20 * clamp(nutrition.vegetableServingsPerServing / 2), detail: `${nutrition.vegetableServingsPerServing} servings per serving (target: 2)`, positive: nutrition.vegetableServingsPerServing >= 1 },
    { key: 'fiber', label: 'Fiber', points: 15 * clamp(values.fiber / 7), detail: `${values.fiber}g per serving (target: 7g)`, positive: values.fiber >= 3.5 },
    { key: 'protein', label: 'Protein', points: 15 * clamp(values.protein / 25), detail: `${values.protein}g per serving (target: 25g)`, positive: values.protein >= 12.5 },
    { key: 'sodium', label: 'Sodium', points: 20 * clamp(1 - Math.max(0, values.sodium - 300) / 1200), detail: `${values.sodium}mg per serving (lower is better)`, positive: values.sodium <= 600 },
    { key: 'added-sugar', label: 'Added sugar', points: 15 * clamp(1 - values.addedSugar / 24), detail: `${values.addedSugar}g per serving (lower is better)`, positive: values.addedSugar <= 6 },
    { key: 'saturated-fat', label: 'Saturated fat', points: 15 * clamp(1 - values.saturatedFat / 20), detail: `${values.saturatedFat}g per serving (lower is better)`, positive: values.saturatedFat <= 5 },
  ];
  const factors = definitions.map((factor) => ({
    key: factor.key,
    label: factor.label,
    direction: factor.positive ? 'positive' as const : 'negative' as const,
    points: round(factor.points),
    detail: factor.detail,
  }));
  const score = Math.round(factors.reduce((sum, factor) => sum + factor.points, 0));
  const strongest = [...factors].sort((a, b) => b.points - a.points)[0];
  const watchOut = [...factors].sort((a, b) => a.points - b.points)[0];
  return {
    status: 'calculated',
    score,
    factors,
    note: `0–100 general-health score. ${strongest?.label ?? 'Balanced'} supports this score; ${watchOut?.label ?? 'no factor'} is the main area to watch. General-health rubric only—not allergy or medical advice.`,
  };
}
