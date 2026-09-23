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

export function findExternalRecipes(
  ingredients: string[],
  allergies: string[],
  signal?: AbortSignal,
  searchAnchors?: string[],
  excludedRecipeIds: string[] = [],
  excludedRecipeTitles: string[] = [],
) {
  return customFetch<ExternalRecipesResponse>("/api/recipes/external", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ingredients,
      allergies,
      ...(searchAnchors?.length ? { searchAnchors } : {}),
      excludedRecipeIds,
      excludedRecipeTitles,
    }),
  });
}
