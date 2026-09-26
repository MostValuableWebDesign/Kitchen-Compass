import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { kidFriendlyScore } from "./kidFriendly";
import type { ExternalRecipe } from "./externalRecipes";

type FatSecretRecipe = {
  recipe_id?: string;
  recipe_name?: string;
  recipe_url?: string;
  recipe_images?: { recipe_image?: string | string[] };
  ingredients?: { ingredient?: Array<{ food_name?: string; ingredient_description?: string }> | { food_name?: string; ingredient_description?: string } };
  directions?: { direction?: Array<{ direction_number?: string; direction_description?: string }> | { direction_number?: string; direction_description?: string } };
};

let accessToken: { value: string; expiresAt: number } | undefined;
let pendingToken: Promise<string> | undefined;

export function fatSecretConfigured() {
  return Boolean(process.env.FATSECRET_CLIENT_ID?.trim() && process.env.FATSECRET_CLIENT_SECRET?.trim());
}

async function token() {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  if (pendingToken) return pendingToken;
  const id = process.env.FATSECRET_CLIENT_ID?.trim();
  const secret = process.env.FATSECRET_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("FatSecret credentials are not configured");
  pendingToken = (async () => {
    const response = await fetch("https://oauth.fatsecret.com/connect/token", {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=basic",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`FatSecret authentication responded ${response.status}`);
    const result = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof result.access_token !== "string" || !result.access_token) throw new Error("FatSecret authentication returned no token");
    accessToken = { value: result.access_token, expiresAt: Date.now() + Math.max(0, Number(result.expires_in) || 0) * 1000 };
    return accessToken.value;
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}

async function fatSecretJson(path: string, params: Record<string, string>) {
  const url = new URL(`https://platform.fatsecret.com/rest/${path}`);
  for (const [key, value] of Object.entries({ ...params, format: "json" })) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`FatSecret responded ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (payload.error) {
    const code = (payload.error as { code?: unknown }).code;
    throw new Error(`FatSecret API error${typeof code === "number" || typeof code === "string" && /^\d+$/.test(code) ? ` ${code}` : ""}`);
  }
  return payload;
}

function arrayOf<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function identity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

const seasonings = new Set(["salt", "pepper", "water", "olive oil", "vegetable oil", "sugar", "paprika", "cumin", "basil", "oregano", "garlic powder"]);

export function normalizeFatSecretRecipe(raw: FatSecretRecipe, pantry: string[], allergies: string[], fallbackImage?: string): ExternalRecipe | null {
  if (!raw.recipe_id || !/^\d+$/.test(raw.recipe_id) || !raw.recipe_name || !httpsUrl(raw.recipe_url)) return null;
  const ingredients = arrayOf(raw.ingredients?.ingredient)
    .flatMap((item) => item?.food_name ? [{ name: item.food_name.trim(), measure: item.ingredient_description?.trim() ?? "" }] : [])
    .filter((item) => item.name);
  const steps = arrayOf(raw.directions?.direction).filter((item) => item?.direction_description?.trim()).sort((a, b) => Number(a.direction_number) - Number(b.direction_number));
  if (!ingredients.length || !steps.length || requestedAllergenConflicts(assessRecipeAllergens(ingredients.flatMap((item) => [item.name, item.measure]), []), allergies)) return null;
  const pantryIds = new Set(pantry.map(identity));
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const seen = new Set<string>();
  for (const item of ingredients) {
    const key = identity(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (pantryIds.has(key)) matchedIngredients.push(item.name);
    else if (!seasonings.has(key)) missingIngredients.push(item.name);
  }
  const image = arrayOf(raw.recipe_images?.recipe_image).map(httpsUrl).find(Boolean) ?? httpsUrl(fallbackImage);
  if (!image) return null;
  return {
    id: `fatsecret:${raw.recipe_id}`,
    title: raw.recipe_name,
    ...(image ? { imageUrl: image } : {}),
    provider: "FatSecret",
    sourceUrl: httpsUrl(raw.recipe_url)!,
    ingredients,
    instructions: steps.map((item) => item.direction_description!.trim()).join("\n"),
    matchedIngredients,
    missingIngredients,
    safetyVerified: false,
  };
}

export async function searchFatSecretRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>;
  excludedTitles: Set<string>; audience: "general" | "kids";
}): Promise<ExternalRecipe[]> {
  // Search v3 matches names; try a few confirmed anchors and verify full ingredients from recipe.get.v2.
  const searchResults = await Promise.allSettled(input.anchors.slice(0, 4).map(async (anchor) => {
    const result = await fatSecretJson("recipes/search/v3", { search_expression: anchor, max_results: "10", must_have_images: "true" });
    const recipes = result.recipes as { recipe?: Array<{ recipe_id?: string; recipe_name?: string; recipe_image?: string }> | { recipe_id?: string; recipe_name?: string; recipe_image?: string } } | undefined;
    return arrayOf(recipes?.recipe);
  }));
  if (searchResults.every((result) => result.status === "rejected")) throw new Error("FatSecret searches failed");
  const searches = searchResults.map((result) => result.status === "fulfilled" ? result.value : []);
  const ids: string[] = [];
  const seen = new Set<string>();
  const images = new Map<string, string>();
  for (let index = 0; index < 10 && ids.length < 12; index += 1) {
    for (const results of searches) {
      const candidate = results[index];
      const id = candidate?.recipe_id;
      if (id && /^\d+$/.test(id) && !seen.has(id) && !input.excludedIds.has(`fatsecret:${id}`)
        && (!candidate.recipe_name || !input.excludedTitles.has(identity(candidate.recipe_name)))) {
        ids.push(id);
        seen.add(id);
        if (candidate.recipe_image) images.set(id, candidate.recipe_image);
      }
    }
  }
  const detailResults = await Promise.allSettled(ids.map(async (id) => {
    const result = await fatSecretJson("recipe/v2", { recipe_id: id });
    return normalizeFatSecretRecipe(result.recipe as FatSecretRecipe, input.pantry, input.allergies, images.get(id));
  }));
  if (ids.length && detailResults.every((result) => result.status === "rejected")) throw new Error("FatSecret recipe details failed");
  const details = detailResults.map((result) => result.status === "fulfilled" ? result.value : null);
  return details.filter((item): item is ExternalRecipe => Boolean(item))
    .filter((item) => item.missingIngredients.length <= 5 && item.matchedIngredients.length > 0)
    .filter((item) => !input.excludedTitles.has(identity(item.title)))
    .filter((item) => input.audience !== "kids" || kidFriendlyScore(item.title, item.ingredients.map((ingredient) => ingredient.name)) > 0)
    .sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length || a.missingIngredients.length - b.missingIngredients.length)
    .slice(0, input.audience === "kids" ? 12 : 30);
}
