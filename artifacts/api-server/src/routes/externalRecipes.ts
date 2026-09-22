import { Router, type IRouter } from "express";
import { z } from "zod";
import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { sendScanError } from "../middleware/scanSecurity";

const router: IRouter = Router();
const requestSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30),
});

type MealSummary = { idMeal?: string; strMeal?: string };
type MealDetail = Record<string, string | null> & { idMeal: string; strMeal: string };
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

function providerKey() {
  const key = process.env.THEMEALDB_API_KEY?.trim();
  if (process.env.NODE_ENV === "production") return key && key !== "1" ? key : null;
  return key || "1";
}

function ingredientIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
}

const commonSeasonings = new Set(["salt", "pepper", "water", "olive oil", "vegetable oil", "sugar"]);

function interleaveMealIds(searches: MealSummary[][], limit: number) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; ids.length < limit && searches.some((results) => index < results.length); index += 1) {
    for (const results of searches) {
      const id = results[index]?.idMeal;
      if (id && !seen.has(id)) { ids.push(id); seen.add(id); }
      if (ids.length >= limit) break;
    }
  }
  return ids;
}

function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch { return undefined; }
}

async function providerJson(url: string): Promise<{ meals: unknown }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`TheMealDB responded ${response.status}`);
  return response.json() as Promise<{ meals: unknown }>;
}

export function normalizeExternalMeal(meal: MealDetail, pantry: string[], allergies: string[]): ExternalRecipe | null {
  if (!meal.idMeal || !meal.strMeal || !meal.strInstructions?.trim()) return null;
  const ingredients = Array.from({ length: 20 }, (_, index) => ({
    name: meal[`strIngredient${index + 1}`]?.trim() ?? "",
    measure: meal[`strMeasure${index + 1}`]?.trim() ?? "",
  })).filter((item) => item.name);
  if (!ingredients.length || requestedAllergenConflicts(assessRecipeAllergens(ingredients.map((item) => item.name), []), allergies)) return null;
  const pantryIds = new Set(pantry.map(ingredientIdentity));
  const matchedIngredients = ingredients.filter((item) => pantryIds.has(ingredientIdentity(item.name))).map((item) => item.name);
  const missingIngredients = ingredients.filter((item) => !pantryIds.has(ingredientIdentity(item.name))).map((item) => item.name);
  return {
    id: meal.idMeal,
    title: meal.strMeal,
    ...(safeHttpsUrl(meal.strMealThumb) ? { imageUrl: safeHttpsUrl(meal.strMealThumb) } : {}),
    provider: "TheMealDB",
    sourceUrl: safeHttpsUrl(meal.strSource) ?? `https://www.themealdb.com/meal/${encodeURIComponent(meal.idMeal)}`,
    ingredients,
    instructions: meal.strInstructions.trim(),
    matchedIngredients,
    missingIngredients,
    safetyVerified: false,
  };
}

router.post("/recipes/external", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendScanError(req, res, 400, "INVALID_REQUEST", "Choose at least one confirmed ingredient to find published recipes.");
    return;
  }
  const key = providerKey();
  if (!key) {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Published recipes require a paid TheMealDB API key for a public app.");
    return;
  }
  const pantry = [...new Set(parsed.data.ingredients.map((item) => item.trim()))];
  const searchIngredients = pantry.filter((item) => !commonSeasonings.has(ingredientIdentity(item)));
  const base = `https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}`;
  try {
    const searches = await Promise.all((searchIngredients.length ? searchIngredients : pantry).slice(0, 6).map(async (ingredient) => {
      const value = encodeURIComponent(ingredient.replace(/\s+/g, "_"));
      const response = await providerJson(`${base}/filter.php?i=${value}`);
      return Array.isArray(response.meals) ? response.meals as MealSummary[] : [];
    }));
    const ids = interleaveMealIds(searches, 12);
    const details = await Promise.all(ids.map(async (id) => {
      const response = await providerJson(`${base}/lookup.php?i=${encodeURIComponent(id)}`);
      return Array.isArray(response.meals) ? response.meals[0] as MealDetail | undefined : undefined;
    }));
    const recipes = details.flatMap((meal) => meal ? [normalizeExternalMeal(meal, pantry, parsed.data.allergies)].filter((item): item is ExternalRecipe => item !== null) : [])
      .sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length);
    res.json({ recipes, provider: "TheMealDB", safetyNotice: "Source recipes have not been independently verified for allergens, nutrition, or cooking safety. Check the original recipe and every package label." });
  } catch {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Published recipes are temporarily unavailable. Saved recipes remain available.");
  }
});

export default router;
