import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { kidFriendlyScore } from "./kidFriendly";
import type { ExternalRecipe } from "./externalRecipes";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import { assessPublishedRecipeIngredients, recipeIngredientIdentity as identity } from "./recipeIngredientMatch";
import { MAX_COUNTED_MISSING_INGREDIENTS, MAX_PROVIDER_SEARCH_ANCHORS, MAX_TOTAL_PUBLISHED_RECIPES } from "./providerSearchLimits";
import {
  recordCandidateRemoval,
  type RecipeNormalizationFailure,
  type RecipeSearchDiagnostics,
} from "./recipeSearchDiagnostics";

type SpoonacularSummary = {
  id?: number;
  title?: string;
  image?: string;
  usedIngredientCount?: number;
};

type SpoonacularDetail = {
  id?: number;
  title?: string;
  image?: string;
  sourceName?: string;
  sourceUrl?: string;
  spoonacularSourceUrl?: string;
  instructions?: string | null;
  analyzedInstructions?: Array<{ steps?: Array<{ step?: string }> }>;
  extendedIngredients?: Array<{ name?: string; original?: string }>;
};

export function spoonacularConfigured() {
  return Boolean(process.env.SPOONACULAR_API_KEY?.trim());
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

async function spoonacularJson(path: string, params: Record<string, string>) {
  const key = process.env.SPOONACULAR_API_KEY?.trim();
  if (!key) throw new Error("Spoonacular API key is not configured");
  const url = new URL(`https://api.spoonacular.com/recipes/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { headers: { "x-api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Spoonacular responded ${response.status}`);
  return response.json() as Promise<unknown>;
}

export function normalizeSpoonacularRecipe(
  detail: SpoonacularDetail,
  summary: SpoonacularSummary,
  pantry: string[],
  allergies: string[],
  onFailure?: (reason: RecipeNormalizationFailure) => void,
): ExternalRecipe | null {
  if (!Number.isSafeInteger(detail.id) || detail.id! <= 0 || detail.id !== summary.id || !detail.title?.trim()) {
    onFailure?.("invalid");
    return null;
  }
  const sourceUrl = httpsUrl(detail.sourceUrl) ?? httpsUrl(detail.spoonacularSourceUrl);
  const imageUrl = httpsUrl(detail.image) ?? httpsUrl(summary.image);
  if (!sourceUrl) {
    onFailure?.("invalid");
    return null;
  }
  const ingredients = (detail.extendedIngredients ?? []).flatMap((item) => item?.name?.trim()
    ? [{ name: item.name.trim(), measure: item.original?.trim() ?? "" }]
    : []);
  if (!ingredients.length) {
    onFailure?.("invalid");
    return null;
  }
  if (requestedAllergenConflicts(assessRecipeAllergens(ingredients.flatMap((item) => [item.name, item.measure]), []), allergies)) {
    onFailure?.("allergy");
    return null;
  }
  const steps = (detail.analyzedInstructions ?? []).flatMap((part) => part.steps ?? [])
    .flatMap((item) => item.step?.trim() ? [item.step.trim()] : []);
  const instructions = steps.length ? steps.join("\n") : (detail.instructions ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const { matchedIngredients, missingIngredients, possibleSubstitutions } = assessPublishedRecipeIngredients(ingredients, pantry, isNonCountedMissingIngredient);
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  return {
    id: `spoonacular:${detail.id}`,
    title: detail.title.trim(),
    ...(imageUrl ? { imageUrl } : {}),
    provider: "Spoonacular",
    sourceName: detail.sourceName?.trim() || host,
    sourceUrl,
    ingredients,
    instructions,
    matchedIngredients,
    missingIngredients,
    possibleSubstitutions,
    safetyVerified: false,
  };
}

export async function searchSpoonacularRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>;
  excludedTitles: Set<string>; audience: "general" | "kids"; maxCandidates?: number;
}, diagnostics?: RecipeSearchDiagnostics): Promise<ExternalRecipe[]> {
  const maxCandidates = Math.max(1, Math.min(12, input.maxCandidates ?? 12));
  const rawSearch = await spoonacularJson("findByIngredients", {
    ingredients: input.anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS).join(","),
    number: String(maxCandidates * 2),
    ranking: "1",
    ignorePantry: "true",
  });
  if (!Array.isArray(rawSearch)) throw new Error("Spoonacular search returned an invalid response");
  if (diagnostics) diagnostics.candidatesReceived += rawSearch.length;
  const anchorIds = new Set(input.anchors.map(identity));
  const hasUnsearchedPantry = input.pantry.some((ingredient) => !anchorIds.has(identity(ingredient)));
  const summaries: SpoonacularSummary[] = [];
  for (const item of rawSearch as SpoonacularSummary[]) {
    if (!Number.isSafeInteger(item?.id) || item.id! <= 0) {
      recordCandidateRemoval(diagnostics, "invalid");
      continue;
    }
    if (input.excludedIds.has(`spoonacular:${item.id}`) || (item.title && input.excludedTitles.has(titleKey(item.title)))) {
      recordCandidateRemoval(diagnostics, "excluded");
      continue;
    }
    if (item.usedIngredientCount !== undefined && item.usedIngredientCount <= 0 && !hasUnsearchedPantry) {
      recordCandidateRemoval(diagnostics, "noPantryMatch");
      continue;
    }
    summaries.push(item);
  }
  const selected = summaries.slice(0, maxCandidates);
  recordCandidateRemoval(diagnostics, "candidateLimit", summaries.length - selected.length);
  if (!selected.length) return [];
  const rawDetails = await spoonacularJson("informationBulk", { ids: selected.map((item) => String(item.id)).join(","), includeNutrition: "false" });
  if (!Array.isArray(rawDetails)) throw new Error("Spoonacular details returned an invalid response");
  const byId = new Map(selected.map((item) => [item.id, item]));
  const details = new Map<number, SpoonacularDetail>();
  for (const detail of rawDetails as SpoonacularDetail[]) {
    if (byId.has(detail?.id) && !details.has(detail.id!)) details.set(detail.id!, detail);
  }

  const qualified: ExternalRecipe[] = [];
  for (const summary of selected) {
    const detail = details.get(summary.id!);
    if (!detail) {
      recordCandidateRemoval(diagnostics, "invalid");
      continue;
    }
    const recipe = normalizeSpoonacularRecipe(detail, summary, input.pantry, input.allergies, (reason) => {
      recordCandidateRemoval(diagnostics, reason);
    });
    if (!recipe) continue;
    if (!recipe.matchedIngredients.length) {
      recordCandidateRemoval(diagnostics, "noPantryMatch");
      continue;
    }
    if (recipe.missingIngredients.length > MAX_COUNTED_MISSING_INGREDIENTS) {
      recordCandidateRemoval(diagnostics, "tooManyMissing");
      continue;
    }
    if (input.excludedTitles.has(titleKey(recipe.title))) {
      recordCandidateRemoval(diagnostics, "excluded");
      continue;
    }
    if (input.audience === "kids" && kidFriendlyScore(recipe.title, recipe.ingredients.map((ingredient) => ingredient.name)) <= 0) {
      recordCandidateRemoval(diagnostics, "notKidFriendly");
      continue;
    }
    qualified.push(recipe);
  }

  qualified.sort((a, b) => a.missingIngredients.length - b.missingIngredients.length
    || b.matchedIngredients.length - a.matchedIngredients.length
    || (b.possibleSubstitutions?.length ?? 0) - (a.possibleSubstitutions?.length ?? 0));
  const results = qualified.slice(0, MAX_TOTAL_PUBLISHED_RECIPES);
  recordCandidateRemoval(diagnostics, "resultLimit", qualified.length - results.length);
  if (diagnostics) diagnostics.eligible = results.length;
  return results;
}
