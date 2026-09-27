const preparedFood = /\b(broth|stock|bouillon|seasoning|flavou?r(?:ing|ed)?|sauce|gravy|marinade|soup|base|powder|extract|concentrate)\b/i;

const proteins: Array<[RegExp, string]> = [
  [/\b(chicken|hen)\b/i, 'chicken'], [/\b(beef|steak|veal)\b/i, 'beef'],
  [/\bturkey\b/i, 'turkey'], [/\b(pork|bacon|ham|prosciutto)\b/i, 'pork'],
  [/\bsausage\b/i, 'sausage'],
  [/\blamb\b/i, 'lamb'], [/\bduck\b/i, 'duck'],
  [/\b(salmon|tuna|cod|tilapia|trout|halibut|fish)\b/i, 'fish'],
  [/\b(shrimp|prawn|crab|lobster|scallop|clam|mussel)\b/i, 'seafood'],
];

const mealFoods: Array<[RegExp, string]> = [
  [/\b(pasta|spaghetti|fettuccine|linguine|penne|rigatoni|rotini|macaroni|noodles?|ramen)\b/i, 'pasta'],
  [/\b(sweet potato(?:es)?)\b/i, 'sweet potato'],
  [/\b(potato(?:es)?)\b/i, 'potato'],
  [/\brice\b/i, 'rice'], [/\bquinoa\b/i, 'quinoa'],
  [/\bcouscous\b/i, 'couscous'], [/\bbarley\b/i, 'barley'],
  [/\bbroccoli\b/i, 'broccoli'], [/\bcauliflower\b/i, 'cauliflower'],
  [/\b(tomato(?:es)?)\b/i, 'tomato'], [/\b(onion|onions)\b/i, 'onion'],
  [/\b(carrots?)\b/i, 'carrot'], [/\bspinach\b/i, 'spinach'], [/\bkale\b/i, 'kale'],
  [/\basparagus\b/i, 'asparagus'], [/\bzucchini\b/i, 'zucchini'],
  [/\beggplant\b/i, 'eggplant'], [/\bcabbage\b/i, 'cabbage'],
  [/\blettuce\b/i, 'lettuce'], [/\bsquash\b/i, 'squash'], [/\bcelery\b/i, 'celery'],
  [/\b(mushrooms?)\b/i, 'mushroom'], [/\bbeans?\b/i, 'beans'], [/\blentils?\b/i, 'lentils'], [/\bchickpeas?\b/i, 'chickpeas'],
  [/\bcorn\b/i, 'corn'], [/\bpeas?\b/i, 'peas'], [/\b(eggs?)\b/i, 'egg'],
  [/\b(cheese|cheddar|mozzarella|parmesan)\b/i, 'cheese'],
  [/\b(bread|tortillas?)\b/i, 'bread'], [/\boats?\b/i, 'oats'],
  [/\bavocados?\b/i, 'avocado'],
  [/\bapples?\b/i, 'apple'], [/\bbananas?\b/i, 'banana'],
  [/\bstrawberr(?:y|ies)\b/i, 'strawberry'], [/\bblueberr(?:y|ies)\b/i, 'blueberry'],
];

export function isPreparedFoodIngredient(name: string): boolean {
  return preparedFood.test(name);
}

export function primaryProteinSearchTerm(name: string): string | null {
  if (isPreparedFoodIngredient(name)) return null;
  return proteins.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

// Use a short, recognized food term instead of a package label for paid recipe search.
export function recipeSearchFoodTerm(name: string): string | null {
  if (isPreparedFoodIngredient(name)) return null;
  const specific = /\b(salmon|tuna|cod|tilapia|trout|halibut|shrimp|prawn|crab|lobster|scallop)\b/i.exec(name);
  return specific?.[1]?.toLowerCase()
    ?? primaryProteinSearchTerm(name)
    ?? mealFoods.find(([pattern]) => pattern.test(name))?.[1]
    ?? null;
}
