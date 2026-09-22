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

export interface StepIngredient {
  name: string;
  quantity: number;
  unit: string;
  note?: string;
}

export interface TemperatureReading {
  fahrenheit: number;
  celsius: number;
}

export interface RecipeStep {
  order: number;
  title: string;
  body: string;
  duration?: number;
  temperature?: TemperatureReading | string;
  ingredients: string[];
  ingredientAmounts?: StepIngredient[];
  cues: string[];
  safetyTemperature?: {
    food: string;
    temperature: TemperatureReading;
  };
  mistakes: string[];
}

export interface RecipeMethod {
  id: string;
  title: string;
  description: string;
  equipment: string[];
  steps: RecipeStep[];
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
  steps: RecipeStep[];
  methods?: RecipeMethod[];
  allergens: string[];
  allergenInfo: 'complete' | 'incomplete';
  sourceVersion: string;
  recipeVersion?: string;
  source?: 'curated' | 'server-ai';
  storageInstructions: string;
  reheatingInstructions: string;
  servingSuggestions?: string[];
  commonMistakes?: string[];
  substitutions?: RecipeSubstitution[];
  dietaryTags?: string[];
  dislikeTags?: string[];
  nutritionTags?: string[];
}

export function celsiusFromFahrenheit(fahrenheit: number) {
  return Math.round((fahrenheit - 32) * 5 / 9);
}

export function temperatureReading(fahrenheit: number): TemperatureReading {
  return { fahrenheit, celsius: celsiusFromFahrenheit(fahrenheit) };
}

export function formatTemperature(temperature: TemperatureReading | string | undefined, unit: 'F' | 'C') {
  if (!temperature) return '';
  if (typeof temperature === 'string') return temperature;
  return unit === 'F' ? `${temperature.fahrenheit}°F` : `${temperature.celsius}°C`;
}

function step(
  order: number,
  title: string,
  body: string,
  ingredients: StepIngredient[],
  options: Omit<RecipeStep, 'order' | 'title' | 'body' | 'ingredients' | 'ingredientAmounts' | 'cues' | 'mistakes'>
    & Partial<Pick<RecipeStep, 'cues' | 'mistakes'>> = {},
): RecipeStep {
  return {
    ...options,
    order,
    title,
    body,
    ingredients: ingredients.map(({ name }) => name),
    ingredientAmounts: ingredients,
    cues: options.cues ?? [],
    mistakes: options.mistakes ?? [],
  };
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
      step(1, 'Prep the kitchen', 'Heat the oven before you start. Wash the broccoli, cut it into bite-size florets, and pat the chicken dry with paper towels so it browns instead of steaming.', [
        { name: 'broccoli', quantity: 2, unit: 'cup' },
        { name: 'chicken breast', quantity: 2, unit: 'breast' },
      ], { temperature: temperatureReading(425), cues: ['The oven is fully preheated when the heating indicator turns off or the oven beeps.'], mistakes: ['Do not rinse raw chicken; patting it dry is safer and prevents splashing.'] }),
      step(2, 'Season the chicken', 'Zest half of the lemon, then mince the garlic. Rub the oil, zest, garlic, and a generous pinch of salt and pepper over both chicken breasts. Wash your hands and the cutting board after handling the raw chicken.', [
        { name: 'chicken breast', quantity: 2, unit: 'breast' },
        { name: 'olive oil', quantity: 1, unit: 'tbsp' },
        { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'zest only' },
        { name: 'garlic', quantity: 2, unit: 'clove' },
      ], { cues: ['The chicken should look evenly coated, with no dry patches.'], mistakes: ['Use a separate board for produce, or wash the board with hot soapy water before cutting the lemon.'] }),
      step(3, 'Sear and roast', 'Heat an oven-safe skillet over medium-high heat. Sear the chicken for 3 minutes on each side. Add the broccoli around it, transfer the skillet to the oven, and roast until the thickest part of the chicken reaches the safety temperature.', [
        { name: 'chicken breast', quantity: 2, unit: 'breast' },
        { name: 'broccoli', quantity: 2, unit: 'cup' },
      ], { duration: 20, temperature: temperatureReading(425), safetyTemperature: { food: 'chicken', temperature: temperatureReading(165) }, cues: ['The chicken is done when a thermometer in the thickest center reads 165°F; the broccoli should be bright green with browned edges.'], mistakes: ['Measure the thickest breast without touching the pan. Start checking early because smaller breasts finish first.'] }),
      step(4, 'Rest and serve', 'Move the chicken to a clean plate and rest it for 5 minutes. Squeeze the remaining lemon over the skillet, scatter the parsley over the broccoli, then slice the chicken against the grain and spoon the pan juices over it.', [
        { name: 'chicken breast', quantity: 2, unit: 'breast' },
        { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'juice' },
        { name: 'fresh parsley', quantity: 2, unit: 'tbsp' },
      ], { duration: 5, cues: ['Resting keeps the juices in the chicken instead of on the cutting board.'], mistakes: ['Never put cooked chicken back on the plate that held it raw.'] }),
    ],
    methods: [{
      id: 'covered-stovetop',
      title: 'Covered stovetop',
      description: 'A complete oven-free method for a skillet with a tight-fitting lid.',
      equipment: ['Stovetop', 'Lidded skillet'],
      steps: [
        step(1, 'Prep and season', 'Cut the broccoli into small florets. Pat the chicken dry and coat it with the oil, garlic, lemon zest, and a pinch of salt and pepper.', [
          { name: 'chicken breast', quantity: 2, unit: 'breast' },
          { name: 'broccoli', quantity: 2, unit: 'cup' },
          { name: 'olive oil', quantity: 1, unit: 'tbsp' },
          { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'zest' },
          { name: 'garlic', quantity: 2, unit: 'clove' },
        ], { cues: ['The chicken should look evenly coated and the broccoli pieces should be similar in size.'], mistakes: ['Use a lidded skillet large enough for the chicken to sit in one layer.'] }),
        step(2, 'Brown the chicken', 'Heat the skillet over medium-high heat. Sear the chicken for 4 minutes on each side until golden, then lower the heat to medium-low.', [
          { name: 'chicken breast', quantity: 2, unit: 'breast' },
        ], { duration: 8, cues: ['The chicken should release from the pan when it is ready to turn.'] }),
        step(3, 'Steam until safe', 'Add the broccoli and 2 tablespoons of water. Cover immediately and cook until the chicken reaches 165°F in the center and the broccoli is tender-crisp.', [
          { name: 'chicken breast', quantity: 2, unit: 'breast' },
          { name: 'broccoli', quantity: 2, unit: 'cup' },
        ], { duration: 15, safetyTemperature: { food: 'chicken', temperature: temperatureReading(165) }, cues: ['You should see steady steam when the lid is lifted briefly.'], mistakes: ['Do not rely on the outside color; check the thickest chicken breast with a thermometer.'] }),
        step(4, 'Rest and finish', 'Rest the chicken on a clean plate for 5 minutes. Finish the broccoli with lemon juice and parsley, then slice the chicken and serve.', [
          { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'juice' },
          { name: 'fresh parsley', quantity: 2, unit: 'tbsp' },
        ], { duration: 5, cues: ['The skillet should have only a light coating of juices, not a pool of water.'] }),
      ],
    }],
    allergens: [],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Refrigerate within 2 hours for up to 3 days.',
    reheatingInstructions: 'Reheat covered until the center reaches 165°F. Add a splash of water to the skillet if the broccoli looks dry.',
    servingSuggestions: ['Serve with the pan juices and extra lemon wedges.', 'Add a simple grain or salad if you want a larger meal.'],
    commonMistakes: ['Cutting the chicken immediately instead of resting it.', 'Checking temperature at the edge instead of the thickest center.'],
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
      step(1, 'Boil the pasta', 'Bring a large pot of water to a rolling boil. Add the pasta and cook according to the package time for al dente, stirring during the first minute so it does not stick. Reserve ½ cup cooking water, then drain.', [
        { name: 'pasta', quantity: 6, unit: 'oz' },
      ], { duration: 10, cues: ['Al dente pasta is tender but still has a slight firm bite in the center.'], mistakes: ['Do not rinse the pasta; its starch helps the sauce cling.'] }),
      step(2, 'Build the sauce', 'While the pasta cooks, warm the oil in a skillet over medium heat. Add the sliced garlic and cook for 30 seconds until fragrant, not brown. Stir in the tomatoes and simmer until the sauce looks slightly thickened.', [
        { name: 'olive oil', quantity: 1, unit: 'tbsp' },
        { name: 'garlic', quantity: 2, unit: 'clove' },
        { name: 'canned tomatoes', quantity: 14, unit: 'oz' },
      ], { duration: 8, cues: ['The sauce should bubble slowly and leave a clear track when a spoon crosses the pan.'], mistakes: ['Burnt garlic will make the whole sauce bitter; lower the heat if it colors.'] }),
      step(3, 'Bring it together', 'Add the drained pasta to the skillet. Toss with the sauce, adding the reserved cooking water 1 tablespoon at a time until glossy and loose enough to coat every strand. Turn off the heat and fold in the basil.', [
        { name: 'pasta', quantity: 6, unit: 'oz' },
        { name: 'basil', quantity: 1, unit: 'handful' },
      ], { cues: ['The sauce should cling to the pasta rather than collect at the bottom of the skillet.'], mistakes: ['Add water gradually; too much at once makes the sauce thin.'] }),
      step(4, 'Finish and serve', 'Divide the pasta between two bowls and top with parmesan if using. Serve immediately while the sauce is glossy.', [
        { name: 'parmesan', quantity: 2, unit: 'tbsp', note: 'optional' },
      ], { cues: ['Fresh basil should stay bright green and fragrant.'], mistakes: ['Do not leave cooked pasta at room temperature for more than 2 hours.'] }),
    ],
    allergens: ['wheat', 'milk'],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Refrigerate within 2 hours for up to 3 days.',
    reheatingInstructions: 'Reheat in a covered skillet with 1 tablespoon of water per serving until steaming hot, then loosen with another splash if needed.',
    servingSuggestions: ['Finish with parmesan and torn basil at the table.', 'Serve with a crisp green salad.'],
    commonMistakes: ['Overcooking the pasta before it reaches the sauce.', 'Adding all the pasta water at once.'],
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
      step(1, 'Toast the bread', 'Toast the bread until deeply golden and crisp. Set it on the serving plate so it stays crunchy while you cook the eggs.', [
        { name: 'bread', quantity: 1, unit: 'slice' },
      ], { duration: 3, cues: ['The toast should feel firm at the edges and support the toppings without bending.'], mistakes: ['Do not assemble on a warm, soft plate if you want the toast to stay crisp.'] }),
      step(2, 'Cook the eggs', 'Warm a nonstick pan over medium-low heat. Crack in the eggs and cook until the whites are completely set and the yolks reach your preferred doneness. For food safety, cook until both whites and yolks are firm.', [
        { name: 'eggs', quantity: 2, unit: 'egg' },
      ], { duration: 5, safetyTemperature: { food: 'eggs', temperature: temperatureReading(160) }, cues: ['The whites should be opaque from edge to center with no clear, liquid patches.'], mistakes: ['High heat makes rubbery whites before the centers are safe; lower the burner instead.'] }),
      step(3, 'Mash the avocado', 'Scoop the avocado into a bowl. Mash it with the lemon juice and spread it over the toast in an even layer.', [
        { name: 'avocado', quantity: 0.5, unit: 'fruit' },
        { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'juice' },
      ], { cues: ['A few small avocado pieces are better than a completely smooth paste.'], mistakes: ['Add the lemon just before serving so the avocado stays fresh.'] }),
      step(4, 'Top and serve', 'Slide the cooked eggs onto the avocado toast and serve immediately. Add chili flakes or herbs only if you have them and enjoy them.', [
        { name: 'eggs', quantity: 2, unit: 'egg' },
      ], { cues: ['The finished toast should have crisp bread, creamy avocado, and set egg whites.'], mistakes: ['Use a clean spatula and plate for cooked eggs, never the raw-egg prep surface.'] }),
    ],
    methods: [{
      id: 'scrambled',
      title: 'Soft scrambled eggs',
      description: 'A complete low-heat alternative when you prefer fully set, spoonable eggs.',
      equipment: ['Stovetop', 'Nonstick skillet'],
      steps: [
        step(1, 'Toast and mash', 'Toast the bread until crisp. Mash the avocado with the lemon juice and spread it over the toast.', [
          { name: 'bread', quantity: 1, unit: 'slice' },
          { name: 'avocado', quantity: 0.5, unit: 'fruit' },
          { name: 'lemon', quantity: 0.5, unit: 'fruit', note: 'juice' },
        ], { duration: 3, cues: ['The toast should be crisp and the avocado should look bright and creamy.'] }),
        step(2, 'Scramble gently', 'Whisk the eggs in a bowl. Cook them in a nonstick skillet over low heat, stirring slowly with a spatula until no liquid egg remains and the curds are softly set.', [
          { name: 'eggs', quantity: 2, unit: 'egg' },
        ], { duration: 6, safetyTemperature: { food: 'eggs', temperature: temperatureReading(160) }, cues: ['The curds should hold their shape but still look moist, never runny.'], mistakes: ['Remove the pan from the heat before the eggs look completely dry; carryover heat finishes them.'] }),
        step(3, 'Assemble', 'Spoon the scrambled eggs over the avocado toast and serve immediately.', [
          { name: 'eggs', quantity: 2, unit: 'egg' },
        ], { cues: ['Serve while the curds are soft and the toast is crisp.'], mistakes: ['Do not let the assembled toast sit; the avocado moisture softens the bread.'] }),
      ],
    }],
    allergens: ['egg', 'wheat'],
    allergenInfo: 'complete',
    sourceVersion: 'kitchen-compass-curated-1',
    storageInstructions: 'Best served immediately; refrigerate cooked eggs within 2 hours.',
    reheatingInstructions: 'Reheat eggs gently in a covered skillet until steaming hot; make fresh toast because stored toast softens.',
    servingSuggestions: ['Add chili flakes, fresh herbs, or a small salad.', 'Serve with the toast cut in half for easier eating.'],
    commonMistakes: ['Using high heat and browning the egg whites before they set.', 'Making the avocado topping too far in advance.'],
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