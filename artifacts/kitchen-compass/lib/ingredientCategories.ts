import { normalizeIngredientName } from '@/lib/kitchenLogic';

export const kitchenIngredientCategories = [
  'Meats & poultry',
  'Seafood',
  'Vegetables',
  'Fruits',
  'Dairy & eggs',
  'Beans & nuts',
  'Grains & bread',
  'Herbs & spices',
  'Pantry & condiments',
  'Other',
] as const;

export type KitchenIngredientCategory = typeof kitchenIngredientCategories[number];

export function kitchenIngredientCategory(name: string): KitchenIngredientCategory {
  const value = normalizeIngredientName(name);
  if (/\b(stock|broth|sauce|dressing|vinegar|oil|syrup|honey|sugar|jam|mustard|mayonnaise)\b/.test(value)) return 'Pantry & condiments';
  if (/\b(coconut|almond|oat|soy) milk\b/.test(value)) return 'Pantry & condiments';
  if (/\b(chicken|beef|steak|turkey|pork|bacon|ham|lamb|sausage|venison|duck)\b/.test(value)) return 'Meats & poultry';
  if (/\b(salmon|tuna|cod|tilapia|trout|fish|shrimp|prawn|crab|lobster|scallop|mussel|clam|oyster)\b/.test(value)) return 'Seafood';
  if (/\b(basil|parsley|cilantro|thyme|rosemary|oregano|mint|dill|ginger|turmeric|cumin|paprika|peppercorns?|black pepper|salt|cinnamon)\b/.test(value)) return 'Herbs & spices';
  if (/\b(broccoli|spinach|kale|lettuce|carrots?|onions?|garlic|tomatoes?|tomato|potatoes?|potato|cucumber|celery|zucchini|squash|cabbage|cauliflower|asparagus|mushrooms?|peppers?|corn|peas)\b/.test(value)) return 'Vegetables';
  if (/\b(apples?|bananas?|oranges?|lemons?|limes?|avocados?|berries|strawberries|blueberries|raspberries|grapes?|peaches?|pears?|pineapples?|mangoes?|melons?|watermelons?|cherries|kiwi|coconut)\b/.test(value)) return 'Fruits';
  if (/\b(eggs?|milk|cheese|cheddar|mozzarella|parmesan|yogurt|yoghurt|butter|cream|cottage cheese)\b/.test(value)) return 'Dairy & eggs';
  if (/\b(beans?|lentils?|chickpeas?|tofu|peanuts?|almonds?|walnuts?|cashews?|pecans?)\b/.test(value)) return 'Beans & nuts';
  if (/\b(rice|pasta|bread|flour|oats?|oatmeal|quinoa|noodles?|tortillas?|cereal|couscous|barley)\b/.test(value)) return 'Grains & bread';
  return 'Other';
}

export function groupKitchenIngredients<T extends { name: string }>(ingredients: T[]) {
  return kitchenIngredientCategories
    .map((category) => ({
      category,
      items: ingredients.filter((item) => kitchenIngredientCategory(item.name) === category)
        .sort((first, second) => first.name.localeCompare(second.name)),
    }))
    .filter((group) => group.items.length > 0);
}
