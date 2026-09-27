import { createHash } from "node:crypto";
import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { kidFriendlyScore } from "./kidFriendly";
import type { ExternalRecipe } from "./externalRecipes";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import { MAX_PROVIDER_SEARCH_ANCHORS } from "./providerSearchLimits";
import {
  recordCandidateRemoval,
  type RecipeNormalizationFailure,
  type RecipeSearchDiagnostics,
} from "./recipeSearchDiagnostics";

type EdamamRecipe = {
  uri?: string;
  label?: string;
  image?: string;
  source?: string;
  url?: string;
  ingredientLines?: string[];
  ingredients?: Array<{ food?: string; text?: string }>;
};

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

function identity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function edamamConfigured() {
  return Boolean(process.env.EDAMAM_APP_ID?.trim() && process.env.EDAMAM_APP_KEY?.trim());
}

export function normalizeEdamamRecipe(
  raw: EdamamRecipe,
  pantry: string[],
  allergies: string[],
  onFailure?: (reason: RecipeNormalizationFailure) => void,
): ExternalRecipe | null {
  if (!raw.uri?.trim() || !raw.label?.trim()) {
    onFailure?.("invalid");
    return null;
  }
  const sourceUrl = httpsUrl(raw.url);
  const imageUrl = httpsUrl(raw.image);
  if (!sourceUrl || !imageUrl) {
    onFailure?.("invalid");
    return null;
  }
  const ingredients = (raw.ingredients ?? []).flatMap((item) => item?.food?.trim()
    ? [{ name: item.food.trim(), measure: item.text?.trim() ?? "" }]
    : []);
  if (!ingredients.length) {
    onFailure?.("invalid");
    return null;
  }
  if (requestedAllergenConflicts(assessRecipeAllergens([
    ...ingredients.flatMap((item) => [item.name, item.measure]), ...(raw.ingredientLines ?? []),
  ], []), allergies)) {
    onFailure?.("allergy");
    return null;
  }
  const pantryIds = new Set(pantry.map(identity));
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const seen = new Set<string>();
  for (const ingredient of ingredients) {
    const key = identity(ingredient.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (pantryIds.has(key)) matchedIngredients.push(ingredient.name);
    else if (!isNonCountedMissingIngredient(ingredient.name)) missingIngredients.push(ingredient.name);
  }
  // Keep only an opaque identifier for exclusions. Edamam recipe details stay in this response.
  const id = `edamam:${createHash("sha256").update(raw.uri).digest("hex")}`;
  return {
    id,
    title: raw.label.trim(),
    imageUrl,
    provider: "Edamam",
    sourceName: raw.source?.trim() || new URL(sourceUrl).hostname.replace(/^www\./, ""),
    sourceUrl,
    ingredients,
    instructions: "", // Public web recipes supply a source link, not licensed cooking instructions.
    matchedIngredients,
    missingIngredients,
    safetyVerified: false,
  };
}

export async function searchEdamamRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>;
  excludedTitles: Set<string>; audience: "general" | "kids";
}, diagnostics?: RecipeSearchDiagnostics): Promise<ExternalRecipe[]> {
  const appId = process.env.EDAMAM_APP_ID?.trim();
  const appKey = process.env.EDAMAM_APP_KEY?.trim();
  if (!appId || !appKey) throw new Error("Edamam is not configured");
  const url = new URL("https://api.edamam.com/api/recipes/v2");
  url.searchParams.set("type", "public");
  url.searchParams.set("q", input.anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS).join(" "));
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  for (const field of ["uri", "label", "image", "source", "url", "ingredientLines", "ingredients"]) url.searchParams.append("field", field);
  const response = await fetch(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Edamam responded ${response.status}`);
  const data = await response.json() as { hits?: Array<{ recipe?: EdamamRecipe }> };
  if (!Array.isArray(data.hits)) throw new Error("Edamam search returned an invalid response");
  const hits = data.hits;
  const selectedHits = hits.slice(0, 30);
  if (diagnostics) diagnostics.candidatesReceived += hits.length;
  recordCandidateRemoval(diagnostics, "candidateLimit", hits.length - selectedHits.length);

  const qualified: ExternalRecipe[] = [];
  for (const hit of selectedHits) {
    if (!hit?.recipe) {
      recordCandidateRemoval(diagnostics, "invalid");
      continue;
    }
    const recipe = normalizeEdamamRecipe(hit.recipe, input.pantry, input.allergies, (reason) => {
      recordCandidateRemoval(diagnostics, reason);
    });
    if (!recipe) continue;
    if (!recipe.matchedIngredients.length) {
      recordCandidateRemoval(diagnostics, "noPantryMatch");
      continue;
    }
    if (recipe.missingIngredients.length > 7) {
      recordCandidateRemoval(diagnostics, "tooManyMissing");
      continue;
    }
    if (input.excludedIds.has(recipe.id) || input.excludedTitles.has(titleKey(recipe.title))) {
      recordCandidateRemoval(diagnostics, "excluded");
      continue;
    }
    if (input.audience === "kids" && kidFriendlyScore(recipe.title, recipe.ingredients.map((item) => item.name)) <= 0) {
      recordCandidateRemoval(diagnostics, "notKidFriendly");
      continue;
    }
    qualified.push(recipe);
  }

  qualified.sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length || a.missingIngredients.length - b.missingIngredients.length);
  const results = qualified.slice(0, input.audience === "kids" ? 12 : 30);
  recordCandidateRemoval(diagnostics, "resultLimit", qualified.length - results.length);
  if (diagnostics) diagnostics.eligible = results.length;
  return results;
}
