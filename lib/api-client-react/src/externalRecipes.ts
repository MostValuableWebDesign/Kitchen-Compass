import { customFetch } from "./custom-fetch";

export type ExternalRecipe = {
  id: string;
  title: string;
  imageUrl?: string;
  provider: "TheMealDB";
  sourceUrl: string;
  ingredients: Array<{ name: string; measure: string }>;
  instructions: string;
  matchedIngredients: string[];
  missingIngredients: string[];
  safetyVerified: false;
};

export type ExternalRecipesResponse = {
  recipes: ExternalRecipe[];
  provider: "TheMealDB";
  safetyNotice: string;
};

export function findExternalRecipes(ingredients: string[], allergies: string[]) {
  return customFetch<ExternalRecipesResponse>("/api/recipes/external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, allergies }),
  });
}
