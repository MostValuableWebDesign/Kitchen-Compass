import { normalizeIngredientName } from '@/lib/kitchenLogic';

export type FoodIconName =
  | 'food-apple'
  | 'food-drumstick'
  | 'food-steak'
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
  | 'illustration-avocado'
  | 'illustration-tomato'
  | 'illustration-broccoli'
  | 'illustration-garlic'
  | 'illustration-basil'
  | 'illustration-parsley'
  | 'illustration-spinach'
  | 'illustration-onion'
  | 'illustration-cucumber'
  | 'illustration-potato';

export type FoodIconTone = 'leaf' | 'citrus' | 'berry' | 'ocean' | 'grain' | 'neutral';

export type FoodIconVisual = {
  icon: FoodIconName;
  tone: FoodIconTone;
};

export function foodIconForIngredient(name: string): FoodIconVisual {
  const value = normalizeIngredientName(name);
  if (/\b(chicken|turkey|duck)\b/.test(value)) return { icon: 'food-drumstick', tone: 'berry' };
  if (/\b(beef|steak|pork|bacon|ham|lamb|sausage|venison)\b/.test(value)) return { icon: 'food-steak', tone: 'berry' };
  if (/\b(salmon|tuna|cod|tilapia|trout|fish|shrimp|prawn|crab|lobster|scallop|mussel|clam|oyster)\b/.test(value)) return { icon: 'fish', tone: 'ocean' };
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
  if (/\b(oranges?|lemons?|limes?|citrus)\b/.test(value)) return { icon: 'fruit-citrus', tone: 'citrus' };
  if (/\b(grapes?)\b/.test(value)) return { icon: 'fruit-grapes', tone: 'berry' };
  if (/\b(cherries|berries|strawberries|blueberries|raspberries)\b/.test(value)) return { icon: 'fruit-cherries', tone: 'berry' };
  if (/\b(watermelons?)\b/.test(value)) return { icon: 'fruit-watermelon', tone: 'leaf' };
  if (/\b(pineapples?)\b/.test(value)) return { icon: 'fruit-pineapple', tone: 'citrus' };
  if (/\b(pears?)\b/.test(value)) return { icon: 'fruit-pear', tone: 'leaf' };
  if (/\b(carrots?)\b/.test(value)) return { icon: 'carrot', tone: 'citrus' };
  if (/\b(corn)\b/.test(value)) return { icon: 'corn', tone: 'citrus' };
  if (/\b(mushrooms?)\b/.test(value)) return { icon: 'mushroom', tone: 'grain' };
  if (/\b(chilies|chillis|chili|chilli|jalapeños?|peppers?)\b/.test(value)) return { icon: 'chili-mild', tone: 'berry' };
  if (/\b(kale|lettuce|celery|zucchini|squash|cabbage|cauliflower|asparagus|peas)\b/.test(value)) return { icon: 'leaf', tone: 'leaf' };
  if (/\b(basil|parsley|cilantro|thyme|rosemary|oregano|mint|dill|ginger|turmeric)\b/.test(value)) return { icon: 'leaf', tone: 'leaf' };
  if (/\b(milk)\b/.test(value) && !/\b(coconut|almond|oat|soy) milk\b/.test(value)) return { icon: 'cow', tone: 'citrus' };
  if (/\b(cheese|cheddar|mozzarella|parmesan|yogurt|yoghurt|butter|cream)\b/.test(value)) return { icon: 'cheese', tone: 'citrus' };
  if (/\b(breads?|toast|tortillas?|croissants?)\b/.test(value)) return { icon: 'bread-slice', tone: 'grain' };
  if (/\b(rice)\b/.test(value)) return { icon: 'rice', tone: 'grain' };
  if (/\b(pasta|noodles?)\b/.test(value)) return { icon: 'noodles', tone: 'grain' };
  if (/\b(flour|oats?|oatmeal|quinoa|cereal|couscous|barley)\b/.test(value)) return { icon: 'grain', tone: 'grain' };
  if (/\b(beans?|lentils?|chickpeas?|tofu|peanuts?|almonds?|walnuts?|cashews?|pecans?)\b/.test(value)) return { icon: 'peanut', tone: 'grain' };
  if (/\b(olive oil|oil)\b/.test(value)) return { icon: 'oil', tone: 'citrus' };
  if (/\b(soy sauce)\b/.test(value)) return { icon: 'soy-sauce', tone: 'grain' };
  if (/\b(stock|broth|sauce|dressing|vinegar|syrup|honey|sugar|jam|mustard|mayonnaise|salt|pepper|spices?)\b/.test(value)) return { icon: 'food-variant', tone: 'neutral' };
  return { icon: 'food-variant', tone: 'neutral' };
}