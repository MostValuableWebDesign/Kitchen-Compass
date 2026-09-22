import { scaleNutrition, scaleQuantity } from '@/lib/kitchenLogic';
import { calculateHealthScore, calculateRecipeNutrition, type HealthScoreCalculation, type NutritionAmounts, type NutritionCalculation } from '@workspace/recipe-calculations';

export interface RecipeIngredient {
  name: string;
  amount: string;
  quantity: number;
  unit: string;
  required?: boolean;
}

export interface RecipeSubstitution {
  from: string;
  to: string;
  reason: string;
  validated: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  meal: string;
  servings: number;
  prep: number;
  cook: number;
  difficulty: string;
  equipment: string[];
  healthScore: HealthScoreCalculation;
  image?: number;
  ingredients: RecipeIngredient[];
  nutrition: NutritionCalculation;
  steps: { title: string; body: string; duration?: number; temperature?: string; ingredients?: string[] }[];
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
  sourceVersion: string;
  recipeVersion?: string;
  source?: 'curated' | 'server-ai';
  storageInstructions: string;
  reheatingInstructions: string;
  substitutions?: RecipeSubstitution[];
  dietaryTags?: string[];
  dislikeTags?: string[];
  nutritionTags?: string[];
}

const rawRecipes: Array<Omit<Recipe, 'nutrition' | 'healthScore'>> = [
  {
    id: 'lemon-herb-chicken',
    title: 'Lemon herb chicken',
    description: 'Bright, juicy chicken with crisp-edged vegetables and a pan sauce.',
    cuisine: 'Mediterranean',
    meal: 'Dinner',
    servings: 2,
    prep: 10,
    cook: 25,
    difficulty: 'Easy',
    equipment: ['Stovetop', 'Oven'],
    image: require('../assets/images/lemon-chicken.jpg'),
    ingredients: [
      { name: 'chicken breast', amount: '2 (12 oz)', quantity: 2, unit: 'breast', required: true },
      { name: 'lemon', amount: '1', quantity: 1, unit: 'fruit', required: true },
      { name: 'broccoli', amount: '2 cups', quantity: 2, unit: 'cup', required: true },
      { name: 'olive oil', amount: '1 tbsp', quantity: 1, unit: 'tbsp', required: true },
      { name: 'garlic', amount: '2 cloves', quantity: 2, unit: 'clove', required: true },
      { name: 'fresh parsley', amount: '2 tbsp', quantity: 2, unit: 'tbsp', required: false },
    ],
    steps: [
      { title: 'Prep the kitchen', body: 'Heat the oven to 425°F. Wash and cut the broccoli into bite-size florets. Pat the chicken dry so it browns instead of steaming.' },
      { title: 'Season the chicken', body: 'Rub 1 tablespoon olive oil, the zest of 1 lemon, 2 minced garlic cloves, salt, and pepper over both chicken breasts.', ingredients: ['chicken breast', 'lemon', 'olive oil', 'garlic'] },
      { title: 'Sear and roast', body: 'Sear chicken in an oven-safe pan over medium-high heat for 3 minutes per side. Add broccoli, then roast until the thickest part reaches 165°F, about 18–20 minutes.', duration: 20, temperature: '425°F / 220°C', ingredients: ['chicken breast', 'broccoli'] },
      { title: 'Finish and serve', body: 'Rest chicken for 5 minutes. Squeeze the remaining lemon over the pan and scatter with parsley. Slice against the grain and spoon pan juices over top.', duration: 5, ingredients: ['lemon', 'fresh parsley'] },
    ],
    allergens: [],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Refrigerate within 2 hours for up to 3 days.',
    reheatingInstructions: 'Reheat covered until the center reaches 165°F.',
    dietaryTags: ['high-protein'],
    nutritionTags: ['More vegetables', 'More protein'],
  },
  {
    id: 'tomato-basil-pasta',
    title: 'Tomato basil pasta',
    description: 'A weeknight bowl with silky tomato sauce and fresh basil.',
    cuisine: 'Italian',
    meal: 'Dinner',
    servings: 2,
    prep: 5,
    cook: 18,
    difficulty: 'Easy',
    equipment: ['Stovetop'],
    image: require('../assets/images/tomato-pasta.jpg'),
    ingredients: [
      { name: 'pasta', amount: '6 oz', quantity: 6, unit: 'oz', required: true },
      { name: 'canned tomatoes', amount: '1 (14 oz) can', quantity: 14, unit: 'oz', required: true },
      { name: 'garlic', amount: '2 cloves', quantity: 2, unit: 'clove', required: true },
      { name: 'olive oil', amount: '1 tbsp', quantity: 1, unit: 'tbsp', required: true },
      { name: 'basil', amount: '1 handful', quantity: 1, unit: 'handful', required: false },
      { name: 'parmesan', amount: '2 tbsp', quantity: 2, unit: 'tbsp', required: false },
    ],
    steps: [
      { title: 'Boil the pasta', body: 'Bring a large pot of water to a boil. Salt it lightly, add 6 oz pasta, and cook until just tender. Reserve ½ cup pasta water before draining.', duration: 10, ingredients: ['pasta'] },
      { title: 'Build the sauce', body: 'Warm 1 tablespoon olive oil in a skillet. Cook 2 sliced garlic cloves for 30 seconds, then add canned tomatoes. Simmer until slightly thickened.', duration: 8, ingredients: ['canned tomatoes', 'garlic', 'olive oil'] },
      { title: 'Bring it together', body: 'Toss pasta into the sauce, adding reserved pasta water a splash at a time until glossy. Turn off the heat and fold in basil.', ingredients: ['pasta', 'basil'] },
      { title: 'Serve', body: 'Finish with parmesan if desired. Eat immediately for the best texture; refrigerate leftovers within 2 hours.', ingredients: ['parmesan'] },
    ],
    allergens: ['wheat', 'milk'],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Refrigerate within 2 hours for up to 3 days.',
    reheatingInstructions: 'Reheat with a splash of water until steaming hot.',
    dietaryTags: ['vegetarian'],
    nutritionTags: ['More vegetables'],
  },
  {
    id: 'green-egg-toast',
    title: 'Green egg toast',
    description: 'Creamy avocado, soft eggs, and chili on crunchy toast.',
    cuisine: 'Modern',
    meal: 'Breakfast',
    servings: 1,
    prep: 5,
    cook: 8,
    difficulty: 'Easy',
    equipment: ['Stovetop'],
    ingredients: [
      { name: 'eggs', amount: '2', quantity: 2, unit: 'egg', required: true },
      { name: 'avocado', amount: '½', quantity: 0.5, unit: 'fruit', required: true },
      { name: 'bread', amount: '1 slice', quantity: 1, unit: 'slice', required: true },
      { name: 'lemon', amount: '½', quantity: 0.5, unit: 'fruit', required: false },
    ],
    steps: [
      { title: 'Toast the bread', body: 'Toast 1 slice of bread until deeply golden and crisp.' },
      { title: 'Cook the eggs', body: 'Cook 2 eggs in a lightly oiled pan over medium heat until the whites are set and the yolks are cooked to your liking.', duration: 5, ingredients: ['eggs'] },
      { title: 'Top and season', body: 'Mash ½ avocado with lemon, salt, and pepper. Spread over toast and top with eggs.' , ingredients: ['avocado', 'lemon'] },
    ],
    allergens: ['egg', 'wheat'],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Best served immediately; refrigerate cooked eggs within 2 hours.',
    reheatingInstructions: 'Reheat eggs gently until steaming; toast is best made fresh.',
    dietaryTags: ['vegetarian'],
    nutritionTags: ['More vegetables', 'More protein'],
  },
];

for (const recipe of rawRecipes) {
  for (const ingredient of recipe.ingredients) {
    if (ingredient.quantity === undefined || ingredient.unit === undefined) {
      throw new Error(`Recipe ingredient ${ingredient.name} is missing a numeric quantity.`);
    }
  }
}

export const recipes: Recipe[] = rawRecipes.map((recipe) => {
  const nutrition = calculateRecipeNutrition(recipe.ingredients, recipe.servings);
  return { ...recipe, nutrition, healthScore: calculateHealthScore(nutrition) };
});

export function scaledIngredient(recipe: Recipe, ingredient: RecipeIngredient, targetServings: number) {
  return { ...ingredient, quantity: scaleQuantity(ingredient.quantity, recipe.servings, targetServings) };
}

export function scaledNutrition(recipe: Recipe, targetServings: number): NutritionCalculation {
  if (recipe.nutrition.status !== 'calculated' || !recipe.nutrition.total) return recipe.nutrition;
  const total = scaleNutrition(recipe.nutrition.total, recipe.servings, targetServings);
  const perServing = Object.fromEntries(Object.entries(total as Record<string, number>)
    .map(([key, value]) => [key, value / targetServings])) as NutritionAmounts;
  return { ...recipe.nutrition, total, perServing };
}

export function getRecipe(id?: string) {
  return recipes.find((recipe) => recipe.id === id) ?? recipes[0];
}