import { customFetch } from "./custom-fetch";

export type ExternalRecipe = {
  id: string;
  title: string;
  imageUrl?: string;
  provider: "TheMealDB" | "FatSecret" | "Spoonacular" | "Edamam";
  sourceName?: string;
  sourceUrl: string;
  ingredients: Array<{ name: string; measure: string }>;
  instructions: string;
  matchedIngredients: string[];
  missingIngredients: string[];
  safetyVerified: false;
};

export type ExternalRecipesResponse = {
  recipes: ExternalRecipe[];
  provider: "Multiple sources";
  providersUnavailable: Array<"Edamam" | "Spoonacular" | "TheMealDB">;
  sourceResults: Array<{ provider: "Edamam" | "Spoonacular" | "TheMealDB"; status: "found" | "no_results" | "unavailable" | "not_configured"; count: number }>;
  safetyNotice: string;
};

export function findExternalRecipes(
  ingredients: string[],
  allergies: string[],
  signal?: AbortSignal,
  searchAnchors?: string[],
  excludedRecipeIds: string[] = [],
  excludedRecipeTitles: string[] = [],
  audience: "general" | "kids" = "general",
  course?: "main" | "side",
  mainRecipe?: { title: string; ingredientNames: string[] },
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
      audience,
      ...(course ? { course } : {}),
      ...(mainRecipe ? { mainRecipe } : {}),
    }),
  });
}
