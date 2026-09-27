import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { kidFriendlyScore } from "./kidFriendly";
import type { ExternalRecipe } from "./externalRecipes";

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
  instructions?: string | null;
  analyzedInstructions?: Array<{ steps?: Array<{ step?: string }> }>;
  extendedIngredients?: Array<{ name?: string; original?: string }>;
};

export function spoonacularConfigured() {
  return Boolean(process.env.SPOONACULAR_API_KEY?.trim());
}

function identity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

const seasonings = new Set(["salt", "pepper", "water", "olive oil", "vegetable oil", "sugar", "paprika", "cumin", "basil", "oregano", "garlic powder"]);

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
): ExternalRecipe | null {
  if (!Number.isSafeInteger(detail.id) || detail.id! <= 0 || detail.id !== summary.id || !detail.title?.trim()) return null;
  const sourceUrl = httpsUrl(detail.sourceUrl);
  const imageUrl = httpsUrl(detail.image) ?? httpsUrl(summary.image);
  if (!sourceUrl || !imageUrl) return null;
  const ingredients = (detail.extendedIngredients ?? []).flatMap((item) => item?.name?.trim()
    ? [{ name: item.name.trim(), measure: item.original?.trim() ?? "" }]
    : []);
  if (!ingredients.length || requestedAllergenConflicts(assessRecipeAllergens(ingredients.flatMap((item) => [item.name, item.measure]), []), allergies)) return null;
  const steps = (detail.analyzedInstructions ?? []).flatMap((part) => part.steps ?? [])
    .flatMap((item) => item.step?.trim() ? [item.step.trim()] : []);
  const instructions = steps.length ? steps.join("\n") : (detail.instructions ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!instructions) return null;
  const pantryIds = new Set(pantry.map(identity));
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const seen = new Set<string>();
  for (const ingredient of ingredients) {
    const key = identity(ingredient.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (pantryIds.has(key)) matchedIngredients.push(ingredient.name);
    else if (!seasonings.has(key)) missingIngredients.push(ingredient.name);
  }
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  return {
    id: `spoonacular:${detail.id}`,
    title: detail.title.trim(),
    imageUrl,
    provider: "Spoonacular",
    sourceName: detail.sourceName?.trim() || host,
    sourceUrl,
    ingredients,
    instructions,
    matchedIngredients,
    missingIngredients,
    safetyVerified: false,
  };
}

export async function searchSpoonacularRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>;
  excludedTitles: Set<string>; audience: "general" | "kids"; maxCandidates?: number;
}): Promise<ExternalRecipe[]> {
  const maxCandidates = Math.max(1, Math.min(12, input.maxCandidates ?? 12));
  const rawSearch = await spoonacularJson("findByIngredients", {
    ingredients: input.anchors.slice(0, 30).join(","),
    number: String(maxCandidates * 2),
    ranking: "1",
    ignorePantry: "true",
  });
  if (!Array.isArray(rawSearch)) throw new Error("Spoonacular search returned an invalid response");
  const summaries = (rawSearch as SpoonacularSummary[]).filter((item) => Number.isSafeInteger(item?.id) && item.id! > 0
    && !input.excludedIds.has(`spoonacular:${item.id}`)
    && (!item.title || !input.excludedTitles.has(titleKey(item.title)))
    && (item.usedIngredientCount === undefined || item.usedIngredientCount > 0));
  const selected = summaries.slice(0, maxCandidates);
  if (!selected.length) return [];
  const rawDetails = await spoonacularJson("informationBulk", { ids: selected.map((item) => String(item.id)).join(","), includeNutrition: "false" });
  if (!Array.isArray(rawDetails)) throw new Error("Spoonacular details returned an invalid response");
  const byId = new Map(selected.map((item) => [item.id, item]));
  const results = (rawDetails as SpoonacularDetail[])
    .flatMap((detail) => {
      const summary = byId.get(detail?.id);
      return summary ? [normalizeSpoonacularRecipe(detail, summary, input.pantry, input.allergies)] : [];
    })
    .filter((item): item is ExternalRecipe => item !== null)
    .filter((item) => item.matchedIngredients.length > 0 && item.missingIngredients.length <= 5)
    .filter((item) => !input.excludedTitles.has(titleKey(item.title)))
    .filter((item) => input.audience !== "kids" || kidFriendlyScore(item.title, item.ingredients.map((ingredient) => ingredient.name)) > 0)
    .sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length || a.missingIngredients.length - b.missingIngredients.length);
  return results.slice(0, input.audience === "kids" ? 12 : 30);
}
