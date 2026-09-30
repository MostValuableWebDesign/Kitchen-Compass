import { createHash } from "node:crypto";
import { assessRecipeAllergens, requestedAllergenConflicts, recipeSearchFoodTerm } from "@workspace/recipe-calculations";
import type { ExternalRecipe } from "./externalRecipes";
import { kidFriendlyScore } from "./kidFriendly";
import { matchesPantryIngredient, recipeIngredientIdentity as identity } from "./recipeIngredientMatch";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import { MAX_COUNTED_MISSING_INGREDIENTS } from "./providerSearchLimits";
import { recordCandidateRemoval, type RecipeNormalizationFailure, type RecipeSearchDiagnostics } from "./recipeSearchDiagnostics";

export function apiNinjasConfigured() {
  return Boolean(process.env.API_NINJAS_API_KEY?.trim());
}

export function apiNinjasSearchParams(anchors: readonly string[]) {
  const foods = [...new Set(anchors.map(recipeSearchFoodTerm).filter((food): food is string => Boolean(food)))];
  if (!foods.length) return undefined;
  const premium = process.env.API_NINJAS_RECIPE_SEARCH_MODE === "ingredients";
  return new URLSearchParams(premium
    ? { ingredients: foods.slice(0, 5).join(","), limit: "10" }
    : { title: foods[0]!, limit: "5" });
}

export function normalizeApiNinjasRecipe(raw: unknown, pantry: string[], allergies: string[], onFailure?: (reason: RecipeNormalizationFailure) => void): ExternalRecipe | null {
  const invalid = () => { onFailure?.("invalid"); return null; };
  if (!raw || typeof raw !== "object") return invalid();
  const value = raw as Record<string, unknown>;
  if (typeof value.title !== "string" || !value.title.trim() || !Array.isArray(value.ingredients) || !value.ingredients.length
    || !Array.isArray(value.instructions) || !value.instructions.length
    || !value.instructions.every((step) => typeof step === "string" && step.trim())) return invalid();
  const ingredients: ExternalRecipe["ingredients"] = [];
  const safetyNames: string[] = [];
  for (const item of value.ingredients) {
    if (!item || typeof item !== "object") return invalid();
    const ingredient = item as Record<string, unknown>;
    if (typeof ingredient.name !== "string" || !ingredient.name.trim() || typeof ingredient.quantity !== "number"
      || !Number.isFinite(ingredient.quantity) || ingredient.quantity < 0 || typeof ingredient.unit !== "string") return invalid();
    const originalName = ingredient.name.trim();
    // Preparation notes and embedded package quantities are common in the v3 response.
    const name = originalName.split(";")[0]!.trim().replace(/^\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|pound|pounds|g|kg)\s+(?:can\s+)?/i, "");
    if (!name) return invalid();
    ingredients.push({ name, measure: `${ingredient.quantity} ${ingredient.unit} ${originalName}`.trim() });
    safetyNames.push(originalName);
  }
  if (requestedAllergenConflicts(assessRecipeAllergens(safetyNames, []), allergies)) {
    onFailure?.("allergy"); return null;
  }
  const pantryIds = new Set(pantry.map(identity));
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const seen = new Set<string>();
  for (const { name } of ingredients) {
    const key = identity(name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (matchesPantryIngredient(name, pantryIds)) matchedIngredients.push(name);
    else if (!isNonCountedMissingIngredient(name)) missingIngredients.push(name);
  }
  const title = value.title.trim();
  const instructions = (value.instructions as string[]).map((step) => step.trim()).join("\n");
  const id = `api-ninjas:${createHash("sha256").update(JSON.stringify([title.toLowerCase(), ingredients, instructions])).digest("hex")}`;
  // This provider has no recipe permalink. The app displays its instructions in the current session.
  return { id, title, provider: "API Ninjas", sourceName: "API Ninjas", sourceUrl: "", ingredients, instructions,
    matchedIngredients, missingIngredients, safetyVerified: false };
}

export async function searchApiNinjasRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>; excludedTitles: Set<string>; audience: "general" | "kids";
}, diagnostics?: RecipeSearchDiagnostics): Promise<ExternalRecipe[]> {
  const key = process.env.API_NINJAS_API_KEY?.trim();
  if (!key) throw new Error("API Ninjas is not configured");
  const params = apiNinjasSearchParams(input.anchors);
  if (!params) return [];
  const response = await fetch(`https://api.api-ninjas.com/v3/recipe?${params}`, {
    headers: { "X-Api-Key": key, accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`API Ninjas responded ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("API Ninjas returned an invalid response");
  if (diagnostics) diagnostics.candidatesReceived += data.length;
  const limit = Number(params.get("limit"));
  recordCandidateRemoval(diagnostics, "candidateLimit", Math.max(0, data.length - limit));
  const recipes: ExternalRecipe[] = [];
  const seen = new Set<string>();
  for (const raw of data.slice(0, limit)) {
    const recipe = normalizeApiNinjasRecipe(raw, input.pantry, input.allergies, (reason) => recordCandidateRemoval(diagnostics, reason));
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
