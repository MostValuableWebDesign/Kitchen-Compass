import { recipeSearchFoodTerm } from "@workspace/recipe-calculations";
import type { ExternalRecipe } from "./externalRecipes";
import { kidFriendlyScore } from "./kidFriendly";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import { MAX_COUNTED_MISSING_INGREDIENTS, MAX_PROVIDER_SEARCH_ANCHORS, MAX_TOTAL_PUBLISHED_RECIPES } from "./providerSearchLimits";
import { normalizeStructuredOnlineRecipe } from "./structuredOnlineRecipe";
import { recordCandidateRemoval, type RecipeNormalizationFailure, type RecipeSearchDiagnostics } from "./recipeSearchDiagnostics";

export function recipeApiConfigured() {
  return Boolean(process.env.RECIPEAPI_API_KEY?.trim());
}

export function recipeApiSearchParams(anchors: readonly string[], course?: "main" | "side") {
  const ingredients = [...new Set(anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS)
    .filter((name) => name.trim() && !isNonCountedMissingIngredient(name))
    .map((name) => recipeSearchFoodTerm(name) ?? name.trim().toLowerCase()))];
  if (!ingredients.length) return undefined;
  const requested = Number(process.env.RECIPEAPI_PER_PAGE ?? 10);
  const perPage = Number.isInteger(requested) && requested > 0 ? Math.min(MAX_TOTAL_PUBLISHED_RECIPES, requested) : 10;
  const params = new URLSearchParams({ ingredients: ingredients.join(","), per_page: String(perPage), page: "1" });
  if (course) params.set("meal_type", course === "side" ? "side_dish" : "main");
  return params;
}

export function normalizeRecipeApiRecipe(raw: unknown, pantry: string[], allergies: string[], onFailure?: (reason: RecipeNormalizationFailure) => void): ExternalRecipe | null {
  if (!raw || typeof raw !== "object") { onFailure?.("invalid"); return null; }
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id <= 0) { onFailure?.("invalid"); return null; }
  return normalizeStructuredOnlineRecipe({ ...value, title: value.name }, pantry, allergies,
    { provider: "RecipeAPI.io", idPrefix: "recipeapi", id: `recipeapi:${value.id}` }, onFailure);
}

export async function searchRecipeApiRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>; excludedTitles: Set<string>; audience: "general" | "kids"; course?: "main" | "side";
}, diagnostics?: RecipeSearchDiagnostics): Promise<ExternalRecipe[]> {
  const key = process.env.RECIPEAPI_API_KEY?.trim();
  if (!key) throw new Error("RecipeAPI.io is not configured");
  const params = recipeApiSearchParams(input.anchors, input.course);
  if (!params) return [];
  const response = await fetch(`https://recipeapi.io/api/v1/recipes?${params}`, {
    headers: { Authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RecipeAPI.io responded ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>).data)) throw new Error("RecipeAPI.io returned an invalid response");
  const data = (payload as { data: unknown[] }).data;
  if (diagnostics) diagnostics.candidatesReceived += data.length;
  const limit = Number(params.get("per_page"));
  recordCandidateRemoval(diagnostics, "candidateLimit", Math.max(0, data.length - limit));
  const recipes: ExternalRecipe[] = [];
  const seen = new Set<string>();
  for (const raw of data.slice(0, limit)) {
    const recipe = normalizeRecipeApiRecipe(raw, input.pantry, input.allergies, (reason) => recordCandidateRemoval(diagnostics, reason));
    if (!recipe) continue;
    const titleKey = recipe.title.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
    const reject = !recipe.matchedIngredients.length ? "noPantryMatch"
      : recipe.missingIngredients.length > MAX_COUNTED_MISSING_INGREDIENTS ? "tooManyMissing"
      : input.excludedIds.has(recipe.id) || input.excludedTitles.has(titleKey) ? "excluded"
      : seen.has(recipe.id) ? "duplicate"
      : input.audience === "kids" && kidFriendlyScore(recipe.title, recipe.ingredients.map((item) => item.name)) <= 0 ? "notKidFriendly" : undefined;
    if (reject) { recordCandidateRemoval(diagnostics, reject); continue; }
    seen.add(recipe.id);
    recipes.push(recipe);
  }
  if (diagnostics) diagnostics.eligible = recipes.length;
  return recipes;
}
