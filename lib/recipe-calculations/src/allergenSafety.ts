export type CommonAllergen =
  | 'peanut'
  | 'milk'
  | 'wheat'
  | 'soy'
  | 'sesame'
  | 'fish'
  | 'shellfish'
  | 'egg'
  | 'tree nut';

const allergenAliases: Record<CommonAllergen, string[]> = {
  peanut: ['peanut', 'peanuts', 'peanut butter', 'groundnut', 'groundnuts', 'arachis'],
  milk: ['milk', 'dairy', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'parmesan', 'whey', 'casein', 'ghee', 'buttermilk'],
  wheat: ['wheat', 'bread', 'flour', 'pasta', 'barley', 'rye', 'gluten', 'breadcrumb', 'breadcrumbs', 'couscous', 'seitan'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'soy sauce', 'soya sauce'],
  sesame: ['sesame', 'sesame seed', 'sesame seeds', 'tahini'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'anchovies', 'sardine', 'sardines', 'mackerel', 'trout'],
  shellfish: ['shellfish', 'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'scallop', 'scallops', 'mussel', 'mussels', 'oyster', 'oysters', 'clam', 'clams'],
  egg: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue', 'albumin', 'ovalbumin'],
  'tree nut': ['tree nut', 'tree nuts', 'almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pecan', 'pecans', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'brazil nut', 'pine nut', 'marzipan', 'praline'],
};

const knownSafeIngredients = [
  'chicken', 'chicken breast', 'beef', 'pork', 'turkey', 'lamb',
  'lemon', 'lime', 'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce', 'cabbage',
  'tomato', 'tomatoes', 'basil', 'parsley', 'cilantro', 'coriander', 'rosemary', 'thyme', 'oregano',
  'avocado', 'onion', 'red onion', 'green onion', 'scallion', 'garlic', 'ginger',
  'carrot', 'celery', 'bell pepper', 'pepper', 'cucumber', 'zucchini', 'mushroom', 'mushrooms',
  'rice', 'brown rice', 'quinoa', 'oat', 'oats', 'potato', 'sweet potato', 'corn', 'cornmeal',
  'bean', 'beans', 'black bean', 'black beans', 'kidney bean', 'kidney beans', 'chickpea', 'chickpeas',
  'lentil', 'lentils', 'pea', 'peas', 'olive oil', 'canola oil', 'sugar', 'salt', 'water',
  'vinegar', 'apple cider vinegar', 'paprika', 'cumin', 'turmeric', 'chili', 'chili flake', 'chili flakes',
].map(normalizeText);

const removableDescriptors = new Set([
  'baby', 'boneless', 'canned', 'chopped', 'cooked', 'diced', 'dried', 'dry', 'fresh',
  'frozen', 'ground', 'large', 'organic', 'plain', 'raw', 'ripe', 'skinless', 'sliced',
  'small', 'whole',
]);

function normalizeText(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const words = cleaned.split(' ').map((word) => {
    if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) return word.slice(0, -1);
    return word;
  });
  return words.join(' ');
}

function containsAlias(value: string, alias: string) {
  return ` ${value} `.includes(` ${normalizeText(alias)} `);
}

function withoutDescriptors(value: string) {
  return value.split(' ').filter((word) => !removableDescriptors.has(word)).join(' ');
}

function isNonDairyMilk(value: string) {
  return /^(?:almond|oat|soy|soya|rice|coconut|cashew|hazelnut) milk$/.test(value)
    || /^(?:peanut|almond|cashew|sunflower|seed|cocoa|coconut) butter$/.test(value);
}

function ingredientAllergens(name: string): CommonAllergen[] {
  const normalized = normalizeText(name);
  return (Object.entries(allergenAliases) as Array<[CommonAllergen, string[]]>)
    .filter(([allergen, aliases]) => {
      if (allergen === 'milk' && isNonDairyMilk(normalized)) return false;
      return aliases.some((alias) => containsAlias(normalized, alias));
    })
    .map(([allergen]) => allergen);
}

function isKnownSafe(name: string) {
  const normalized = withoutDescriptors(normalizeText(name));
  return knownSafeIngredients.some((ingredient) => normalized === ingredient);
}

export function normalizeAllergen(value: string): string {
  const normalized = normalizeText(value);
  const match = (Object.entries(allergenAliases) as Array<[CommonAllergen, string[]]>)
    .find(([, aliases]) => aliases.some((alias) => normalizeText(alias) === normalized));
  return match?.[0] ?? normalized;
}

export type IngredientAllergenAssessment = {
  allergens: CommonAllergen[];
  unknownIngredients: string[];
};

export function assessIngredientAllergens(ingredients: Array<string | { name: string }>): IngredientAllergenAssessment {
  const allergens = new Set<CommonAllergen>();
  const unknownIngredients: string[] = [];
  for (const ingredient of ingredients) {
    const name = typeof ingredient === 'string' ? ingredient : ingredient.name;
    const matched = ingredientAllergens(name);
    matched.forEach((allergen) => allergens.add(allergen));
    if (!matched.length && !isKnownSafe(name)) unknownIngredients.push(name);
  }
  return { allergens: [...allergens], unknownIngredients };
}

export type RecipeAllergenAssessment = IngredientAllergenAssessment & {
  declaredAllergens: string[];
  missingDeclaredAllergens: CommonAllergen[];
};

export function assessRecipeAllergens(
  ingredients: Array<string | { name: string }>,
  declaredAllergens: string[],
  substitutions: Array<string | { name?: string; to?: string }> = [],
): RecipeAllergenAssessment {
  const ingredientAssessment = assessIngredientAllergens(ingredients);
  const substitutionNames = substitutions.flatMap((substitution) => {
    const name = typeof substitution === 'string' ? substitution : substitution.name ?? substitution.to;
    return name ? [name] : [];
  });
  const substitutionAssessment = assessIngredientAllergens(substitutionNames);
  const allergens = [...new Set([...ingredientAssessment.allergens, ...substitutionAssessment.allergens])];
  const declared = [...new Set(declaredAllergens.map(normalizeAllergen))];
  return {
    allergens,
    unknownIngredients: [...new Set([...ingredientAssessment.unknownIngredients, ...substitutionAssessment.unknownIngredients])],
    declaredAllergens: declared,
    missingDeclaredAllergens: allergens.filter((allergen) => !declared.includes(allergen)),
  };
}

export function requestedAllergenConflicts(assessment: RecipeAllergenAssessment, allergies: string[]) {
  const requested = allergies.map(normalizeAllergen);
  return assessment.allergens.some((allergen) => requested.includes(allergen))
    || assessment.declaredAllergens.some((allergen) => requested.includes(allergen));
}

export function hasUnknownAllergenInformation(assessment: RecipeAllergenAssessment) {
  return assessment.unknownIngredients.length > 0;
}