import { customFetch } from "./custom-fetch";

export type ExternalRecipe = {
  id: string;
  title: string;
  imageUrl?: string;
  provider: "TheMealDB" | "FatSecret" | "Spoonacular";
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
  providersUnavailable: Array<"Spoonacular" | "TheMealDB">;
  sourceResults: Array<{ provider: "Spoonacular" | "TheMealDB"; status: "found" | "no_results" | "unavailable" | "not_configured" | "not_searched"; count: number }>;
  resultCounts?: { eligible: number; duplicates: number; capped: number; returned: number; limit: number };
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
  dislikes: string[] = [],
) {
  return customFetch<ExternalRecipesResponse>("/api/recipes/external", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ingredients,
      allergies,
      dislikes: dislikes.map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 80).slice(0, 30),
      ...(searchAnchors?.length ? { searchAnchors } : {}),
      excludedRecipeIds,
      excludedRecipeTitles,
      audience,
      ...(course ? { course } : {}),
      ...(mainRecipe ? { mainRecipe } : {}),
    }),
  });
}
