import type { Recipe } from '@/data/recipes';
import type { ExternalRecipe } from '@workspace/api-client-react';
import { assessRecipeAllergens, requestedAllergenConflicts } from '@workspace/recipe-calculations';
import { normalizeIngredientName } from '@/lib/kitchenLogic';

// Familiar formats can appear in both sections so an existing saved recipe is
// reused without generating a second version. This is not a taste guarantee.
export function isKidFriendlyRecipe(recipe: Recipe) {
  if (recipe.audience === 'kids') return true;
  if (/\b(spicy|hot sauce|chili|chilli|cayenne|jalape[nñ]o|habanero)\b/i.test(recipe.title)
    || recipe.ingredients.some((item) => /\b(cayenne|jalape[nñ]o|habanero|hot sauce)\b/i.test(item.name))) return false;
  return /\b(pasta|spaghetti|noodles?|pizza|quesadilla|grilled cheese|sandwich|wrap|burrito|pancakes?|waffles?|french toast|oatmeal|scrambled eggs?|chicken (?:bites|tenders|strips|nuggets)|meatballs?|rice bowls?)\b/i.test(recipe.title);
}

export function publishedRecipeAllowed(recipe: ExternalRecipe, allergies: string[], dislikes: string[]) {
  if (requestedAllergenConflicts(assessRecipeAllergens(recipe.ingredients.map((item) => item.name), []), allergies)) return false;
  const avoided = new Set(dislikes.map(normalizeIngredientName));
  return !recipe.ingredients.some((item) => avoided.has(normalizeIngredientName(item.name)));
}
