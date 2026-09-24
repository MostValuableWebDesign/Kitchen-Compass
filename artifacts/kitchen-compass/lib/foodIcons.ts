import { normalizeIngredientName } from '@/lib/kitchenLogic';

export type FoodIconName =
  | 'food-apple'
  | 'food-drumstick'
  | 'food-steak'
  | 'food-turkey'
  | 'food-hot-dog'
  | 'food-croissant'
  | 'pot-steam'
  | 'spoon-sugar'
  | 'fish'
  | 'egg'
  | 'bread-slice'
  | 'carrot'
  | 'corn'
  | 'cheese'
  | 'noodles'
  | 'rice'
  | 'leaf'
  | 'mushroom'
  | 'fruit-cherries'
  | 'fruit-citrus'
  | 'fruit-grapes'
  | 'fruit-watermelon'
  | 'fruit-pineapple'
  | 'fruit-pear'
  | 'peanut'
  | 'grain'
  | 'oil'
  | 'soy-sauce'
  | 'cow'
  | 'chili-mild'
  | 'food-variant'
  | 'shaker'
  | 'illustration-avocado'
  | 'illustration-tomato'
  | 'illustration-broccoli'
  | 'illustration-garlic'
  | 'illustration-basil'
  | 'illustration-parsley'
  | 'illustration-spinach'
  | 'illustration-onion'
  | 'illustration-cucumber'
  | 'illustration-potato'
  | 'illustration-banana'
  | 'illustration-peach'
  | 'illustration-mango'
  | 'illustration-kiwi'
  | 'illustration-coconut'
  | 'illustration-strawberry'
  | 'illustration-blueberry'
  | 'illustration-raspberry'
  | 'illustration-lemon'
  | 'illustration-lime'
  | 'illustration-orange'
  | 'illustration-lettuce'
  | 'illustration-kale'
  | 'illustration-cabbage'
  | 'illustration-celery'
  | 'illustration-zucchini'
  | 'illustration-squash'
  | 'illustration-cauliflower'
  | 'illustration-asparagus'
  | 'illustration-peas'
  | 'illustration-cilantro'
  | 'illustration-mint'
  | 'illustration-rosemary'
  | 'illustration-ginger'
  | 'illustration-turmeric'
  | 'illustration-shrimp'
  | 'illustration-crab'
  | 'illustration-shellfish'
  | 'illustration-milk'
  | 'illustration-yogurt'
  | 'illustration-butter'
  | 'illustration-beans'
  | 'illustration-tofu'
  | 'illustration-almond'
  | 'illustration-bacon'
  | 'illustration-sauce'
  | 'illustration-honey'
  | 'illustration-oats'
  | 'illustration-bell-pepper'
  | 'illustration-chicken-breast'
  | 'illustration-salmon';

export type FoodIconTone = 'leaf' | 'citrus' | 'berry' | 'ocean' | 'grain' | 'neutral';

export type FoodIconVisual = {
  icon: FoodIconName;
  tone: FoodIconTone;
};

export function foodIconForIngredient(name: string): FoodIconVisual {
  const cleanedName = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const value = normalizeIngredientName(cleanedName);
  if (/\b(soy sauce)\b/.test(value)) return { icon: 'soy-sauce', tone: 'grain' };
  if (/\b(sauce|dressing|vinegar|jam|mustard|mayonnaise)\b/.test(value)) return { icon: 'illustration-sauce', tone: 'grain' };
  if (/\b(stock|broth)\b/.test(value)) return { icon: 'pot-steam', tone: 'grain' };
  if (/\b(chicken breasts?)\b/.test(cleanedName)) return { icon: 'illustration-chicken-breast', tone: 'berry' };
  if (/\b(salmon)\b/.test(value)) return { icon: 'illustration-salmon', tone: 'berry' };
  if (/\b(shrimps?|prawns?)\b/.test(value)) return { icon: 'illustration-shrimp', tone: 'berry' };
  if (/\b(crabs?|lobsters?)\b/.test(value)) return { icon: 'illustration-crab', tone: 'berry' };
  if (/\b(scallops?|mussels?|clams?|oysters?)\b/.test(value)) return { icon: 'illustration-shellfish', tone: 'ocean' };
  if (/\b(tuna|cod|tilapia|trout|fish)\b/.test(value)) return { icon: 'fish', tone: 'ocean' };
  if (/\b(turkey)\b/.test(value)) return { icon: 'food-turkey', tone: 'berry' };
  if (/\b(sausage|hot dog)\b/.test(value)) return { icon: 'food-hot-dog', tone: 'berry' };
  if (/\b(chicken|duck)\b/.test(value)) return { icon: 'food-drumstick', tone: 'berry' };
  if (/\b(bacon)\b/.test(value)) return { icon: 'illustration-bacon', tone: 'berry' };
  if (/\b(beef|steak|pork|ham|lamb|venison)\b/.test(value)) return { icon: 'food-steak', tone: 'berry' };
  if (/\b(eggs?)\b/.test(value)) return { icon: 'egg', tone: 'citrus' };
  if (/\b(avocados?)\b/.test(value)) return { icon: 'illustration-avocado', tone: 'leaf' };
  if (/\b(tomato(?:es)?)\b/.test(value)) return { icon: 'illustration-tomato', tone: 'berry' };
  if (/\b(broccoli)\b/.test(value)) return { icon: 'illustration-broccoli', tone: 'leaf' };
  if (/\b(garlic)\b/.test(value)) return { icon: 'illustration-garlic', tone: 'citrus' };
  if (/\b(basil)\b/.test(value)) return { icon: 'illustration-basil', tone: 'leaf' };
  if (/\b(parsley)\b/.test(value)) return { icon: 'illustration-parsley', tone: 'leaf' };
  if (/\b(spinach)\b/.test(value)) return { icon: 'illustration-spinach', tone: 'leaf' };
  if (/\b(onions?)\b/.test(value)) return { icon: 'illustration-onion', tone: 'citrus' };
  if (/\b(cucumbers?)\b/.test(value)) return { icon: 'illustration-cucumber', tone: 'leaf' };
  if (/\b(potato(?:es)?)\b/.test(value)) return { icon: 'illustration-potato', tone: 'grain' };
  if (/\b(apples?)\b/.test(value)) return { icon: 'food-apple', tone: 'berry' };
  if (/\b(lemons?)\b/.test(value)) return { icon: 'illustration-lemon', tone: 'citrus' };
  if (/\b(limes?)\b/.test(value)) return { icon: 'illustration-lime', tone: 'leaf' };
  if (/\b(oranges?)\b/.test(value)) return { icon: 'illustration-orange', tone: 'citrus' };
  if (/\b(citrus)\b/.test(value)) return { icon: 'fruit-citrus', tone: 'citrus' };
  if (/\b(grapes?)\b/.test(value)) return { icon: 'fruit-grapes', tone: 'berry' };
  if (/\b(strawberr(?:y|ies))\b/.test(value)) return { icon: 'illustration-strawberry', tone: 'berry' };
  if (/\b(blueberr(?:y|ies))\b/.test(value)) return { icon: 'illustration-blueberry', tone: 'berry' };
  if (/\b(raspberr(?:y|ies))\b/.test(value)) return { icon: 'illustration-raspberry', tone: 'berry' };
  if (/\b(cherr(?:y|ies)|berries)\b/.test(value)) return { icon: 'fruit-cherries', tone: 'berry' };
  if (/\b(bananas?)\b/.test(value)) return { icon: 'illustration-banana', tone: 'citrus' };
  if (/\b(peach(?:es)?)\b/.test(value)) return { icon: 'illustration-peach', tone: 'berry' };
  if (/\b(mango(?:es|s)?)\b/.test(value)) return { icon: 'illustration-mango', tone: 'citrus' };
  if (/\b(kiwis?)\b/.test(value)) return { icon: 'illustration-kiwi', tone: 'leaf' };
  if (/\b(coconut milk)\b/.test(value)) return { icon: 'illustration-milk', tone: 'citrus' };
  if (/\b(coconuts?)\b/.test(value)) return { icon: 'illustration-coconut', tone: 'grain' };
  if (/\b(watermelons?)\b/.test(value)) return { icon: 'fruit-watermelon', tone: 'leaf' };
  if (/\b(pineapples?)\b/.test(value)) return { icon: 'fruit-pineapple', tone: 'citrus' };
  if (/\b(pears?)\b/.test(value)) return { icon: 'fruit-pear', tone: 'leaf' };
  if (/\b(carrots?)\b/.test(value)) return { icon: 'carrot', tone: 'citrus' };
  if (/\b(corn)\b/.test(value)) return { icon: 'corn', tone: 'citrus' };
  if (/\b(mushrooms?)\b/.test(value)) return { icon: 'mushroom', tone: 'grain' };
  if (/\b(black pepper|peppercorns?)\b/.test(value)) return { icon: 'shaker', tone: 'neutral' };
  if (/\b(chilies|chillis|chili|chilli|jalapenos?)\b/.test(value)) return { icon: 'chili-mild', tone: 'berry' };
  if (/\b(peppers?)\b/.test(value)) return { icon: 'illustration-bell-pepper', tone: 'berry' };
  if (/\b(lettuce)\b/.test(value)) return { icon: 'illustration-lettuce', tone: 'leaf' };
  if (/\b(kale)\b/.test(value)) return { icon: 'illustration-kale', tone: 'leaf' };
  if (/\b(cabbage)\b/.test(value)) return { icon: 'illustration-cabbage', tone: 'leaf' };
  if (/\b(celery)\b/.test(value)) return { icon: 'illustration-celery', tone: 'leaf' };
  if (/\b(zucchini)\b/.test(value)) return { icon: 'illustration-zucchini', tone: 'leaf' };
  if (/\b(squash)\b/.test(value)) return { icon: 'illustration-squash', tone: 'citrus' };
  if (/\b(cauliflower)\b/.test(value)) return { icon: 'illustration-cauliflower', tone: 'leaf' };
  if (/\b(asparagus)\b/.test(value)) return { icon: 'illustration-asparagus', tone: 'leaf' };
  if (/\b(peas?)\b/.test(value)) return { icon: 'illustration-peas', tone: 'leaf' };
  if (/\b(cilantro|coriander leaves)\b/.test(value)) return { icon: 'illustration-cilantro', tone: 'leaf' };
  if (/\b(mint)\b/.test(value)) return { icon: 'illustration-mint', tone: 'leaf' };
  if (/\b(rosemary|thyme|oregano|dill)\b/.test(value)) return { icon: 'illustration-rosemary', tone: 'leaf' };
  if (/\b(ginger)\b/.test(value)) return { icon: 'illustration-ginger', tone: 'grain' };
  if (/\b(turmeric)\b/.test(value)) return { icon: 'illustration-turmeric', tone: 'citrus' };
  if (/\b(milk|cream)\b/.test(value)) return { icon: 'illustration-milk', tone: 'citrus' };
  if (/\b(yogurt|yoghurt)\b/.test(value)) return { icon: 'illustration-yogurt', tone: 'citrus' };
  if (/\b(peanut butter)\b/.test(value)) return { icon: 'peanut', tone: 'grain' };
  if (/\b(almond butter)\b/.test(value)) return { icon: 'illustration-almond', tone: 'grain' };
  if (/\b(butter)\b/.test(value)) return { icon: 'illustration-butter', tone: 'citrus' };
  if (/\b(cheese|cheddar|mozzarella|parmesan)\b/.test(value)) return { icon: 'cheese', tone: 'citrus' };
  if (/\b(croissants?)\b/.test(value)) return { icon: 'food-croissant', tone: 'grain' };
  if (/\b(breads?|toast|tortillas?)\b/.test(value)) return { icon: 'bread-slice', tone: 'grain' };
  if (/\b(rice)\b/.test(value)) return { icon: 'rice', tone: 'grain' };
  if (/\b(pasta|noodles?)\b/.test(value)) return { icon: 'noodles', tone: 'grain' };
  if (/\b(oats?|oatmeal)\b/.test(value)) return { icon: 'illustration-oats', tone: 'grain' };
  if (/\b(flour|quinoa|cereal|couscous|barley)\b/.test(value)) return { icon: 'grain', tone: 'grain' };
  if (/\b(tofu)\b/.test(value)) return { icon: 'illustration-tofu', tone: 'grain' };
  if (/\b(beans?|lentils?|chickpeas?)\b/.test(value)) return { icon: 'illustration-beans', tone: 'grain' };
  if (/\b(almonds?|walnuts?|cashews?|pecans?)\b/.test(value)) return { icon: 'illustration-almond', tone: 'grain' };
  if (/\b(peanuts?)\b/.test(value)) return { icon: 'peanut', tone: 'grain' };
  if (/\b(olive oil|oil)\b/.test(value)) return { icon: 'oil', tone: 'citrus' };
  if (/\b(honey|syrup)\b/.test(value)) return { icon: 'illustration-honey', tone: 'citrus' };
  if (/\b(sugar)\b/.test(value)) return { icon: 'spoon-sugar', tone: 'grain' };
  if (/\b(salt|pepper|cumin|paprika|cinnamon|spices?)\b/.test(value)) return { icon: 'shaker', tone: 'neutral' };
  return { icon: 'food-variant', tone: 'neutral' };
}