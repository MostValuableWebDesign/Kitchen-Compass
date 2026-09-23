import { customFetch } from "./custom-fetch";

export type RecipeImageRequest = {
  recipeVersion: string;
  title: string;
  description: string;
  ingredients: string[];
};

export type RecipeImageResult = {
  recipeVersion: string;
  imageUrl?: string;
  imageBase64?: string;
  source?: "TheMealDB" | "AI-generated";
};

export function findRecipeImages(recipes: RecipeImageRequest[], signal?: AbortSignal) {
  return customFetch<{ images: RecipeImageResult[] }>("/api/recipes/images", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipes }),
  });
}
