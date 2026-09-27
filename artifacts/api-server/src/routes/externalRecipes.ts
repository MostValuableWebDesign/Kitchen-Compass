import { Router, type IRouter } from "express";
import { z } from "zod";
import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { sendScanError } from "../middleware/scanSecurity";
import { kidFriendlyScore } from "./kidFriendly";
import { searchSpoonacularRecipes, spoonacularConfigured } from "./spoonacularRecipes";
import { edamamConfigured, searchEdamamRecipes } from "./edamamRecipes";

const router: IRouter = Router();
const MAX_PROVIDER_SEARCH_ANCHORS = 30;
const MAX_COUNTED_MISSING_INGREDIENTS = 5;
const requestSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30),
  searchAnchors: z.array(z.string().trim().min(1).max(80)).min(1).max(MAX_PROVIDER_SEARCH_ANCHORS).optional(),
  excludeRecipeIds: z.array(z.string().trim().min(1).max(80)).max(120).optional(),
  excludedRecipeIds: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  excludedRecipeTitles: z.array(z.string().trim().min(1).max(160)).max(200).default([]),
  audience: z.enum(["general", "kids"]).default("general"),
  course: z.enum(["main", "side"]).optional(),
  mainRecipe: z.object({
    title: z.string().trim().min(1).max(160),
    ingredientNames: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  }).optional(),
});

type MealSummary = { idMeal?: string; strMeal?: string };
type MealDetail = Record<string, string | null> & { idMeal: string; strMeal: string };
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
type OnlineSource = "Edamam" | "Spoonacular" | "TheMealDB";
type OnlineSourceResult = { provider: OnlineSource; status: "found" | "no_results" | "unavailable" | "not_configured"; count: number };
const safetyNotice = "Source recipes have not been independently verified for allergens, nutrition, or cooking safety. Check the original recipe and every package label. Spoonacular and Edamam recipes are available online only.";

function providerKey() {
  const key = process.env.THEMEALDB_API_KEY?.trim();
  if (process.env.NODE_ENV === "production") return key && key !== "1" ? key : null;
  return key || "1";
}

function ingredientIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
}

const commonSeasonings = new Set(["salt", "pepper", "water", "olive oil", "vegetable oil", "sugar"]);
const nonCountedMissingTerms = [
  "salt", "pepper", "paprika", "cayenne", "chilli", "chili", "cumin", "coriander",
  "turmeric", "cinnamon", "nutmeg", "clove", "allspice", "cardamom", "ginger",
  "oregano", "basil", "thyme", "rosemary", "parsley", "cilantro", "dill", "sage",
  "mint", "tarragon", "bay leaf", "garam masala", "curry powder", "spice", "herb",
];

function isNonCountedMissingIngredient(value: string) {
  const identity = ingredientIdentity(value);
  return nonCountedMissingTerms.some((term) => identity === term || identity.includes(` ${term}`) || identity.includes(`${term} `));
}

function titleKey(title: string) {
  return title.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const mainDishTerms = /\b(chicken|beef|pork|turkey|fish|salmon|tuna|shrimp|steak|sausage|meat|pasta|spaghetti|noodles?|pizza|sandwich|burgers?|burritos?|quesadillas?|tacos?|lasagna|bowls?|curry|stew|casserole|omelet|pancakes?|waffles?)\b/i;
const sideDishTerms = /\b(side|salad|slaw|vegetables?|broccoli|carrots?|spinach|asparagus|cauliflower|peas|corn|beans|rice|quinoa|couscous|potato(?:es)?|fries|wedges|greens)\b/i;
const strongFlavors = /\b(spicy|hot sauce|chili|chilli|cayenne|jalape[nñ]o|habanero)\b/i;
const meatTerms = /\b(chicken|beef|pork|turkey|fish|salmon|tuna|shrimp|steak|sausage|meat)\b/i;

export function suitableMealCourse(recipe: ExternalRecipe, course: "main" | "side", audience: "general" | "kids", mainRecipe?: { title: string; ingredientNames: string[] }, anchors: string[] = []) {
  const names = recipe.ingredients.map((item) => item.name);
  if (!recipe.matchedIngredients.length) return false;
  if (anchors.length && !recipe.matchedIngredients.some((name) => anchors.some((anchor) => ingredientIdentity(name) === ingredientIdentity(anchor)))) return false;
  if (audience === "kids" && (strongFlavors.test(recipe.title) || names.some((name) => strongFlavors.test(name)))) return false;
  if (course === "main") return mainDishTerms.test(recipe.title) || names.some((name) => meatTerms.test(name));
  if (!mainRecipe || titleKey(recipe.title) === titleKey(mainRecipe.title) || !sideDishTerms.test(recipe.title) || mainDishTerms.test(recipe.title)) return false;
  const mainProteins = mainRecipe.ingredientNames.filter((name) => meatTerms.test(name)).map(ingredientIdentity);
  return !names.some((name) => meatTerms.test(name) || mainProteins.includes(ingredientIdentity(name)));
}

function interleaveMealIds(searches: MealSummary[][], limit: number, excludedIds = new Set<string>(), excludedTitles = new Set<string>()) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; ids.length < limit && searches.some((results) => index < results.length); index += 1) {
    for (const results of searches) {
      const id = results[index]?.idMeal;
      if (id && !seen.has(id) && !excludedIds.has(id)
        && (!results[index]?.strMeal || !excludedTitles.has(titleKey(results[index].strMeal!)))) { ids.push(id); seen.add(id); }
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
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const seenMatched = new Set<string>();
  const seenMissing = new Set<string>();
  ingredients.forEach((item) => {
    const identity = ingredientIdentity(item.name);
    const matches = pantryIds.has(identity);
    if (!matches && isNonCountedMissingIngredient(item.name)) return;
    const list = matches ? matchedIngredients : missingIngredients;
    const seen = matches ? seenMatched : seenMissing;
    if (!seen.has(identity)) {
      seen.add(identity);
      list.push(item.name);
    }
  });
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
  if (parsed.data.course === "side" && !parsed.data.mainRecipe) {
    sendScanError(req, res, 400, "INVALID_REQUEST", "Choose a main dish before finding a side.");
    return;
  }
  const key = providerKey();
  if (!key && !spoonacularConfigured() && !edamamConfigured()) {
    res.json({ recipes: [], provider: "Multiple sources", providersUnavailable: [], safetyNotice,
      sourceResults: [
        { provider: "Edamam", status: "not_configured", count: 0 },
        { provider: "Spoonacular", status: "not_configured", count: 0 },
        { provider: "TheMealDB", status: "not_configured", count: 0 },
      ] satisfies OnlineSourceResult[] });
    return;
  }
  const pantry = [...new Set(parsed.data.ingredients.map((item) => item.trim()))];
  const excludedIds = new Set([...(parsed.data.excludeRecipeIds ?? []), ...parsed.data.excludedRecipeIds]);
  const excludedTitles = new Set(parsed.data.excludedRecipeTitles.map(titleKey));
  const searchIngredients = pantry.filter((item) => !commonSeasonings.has(ingredientIdentity(item)));
  const base = key ? `https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}` : "";
  try {
    const anchors = parsed.data.searchAnchors ?? (searchIngredients.length ? searchIngredients : pantry).slice(0, MAX_PROVIDER_SEARCH_ANCHORS);
    const providerAudience = parsed.data.course === "side" ? "general" : parsed.data.audience;
    const mealSearch = async () => {
      const searches = await Promise.all(anchors.map(async (ingredient) => {
        const value = encodeURIComponent(ingredient.replace(/\s+/g, "_"));
        const response = await providerJson(`${base}/filter.php?i=${value}`);
        return Array.isArray(response.meals) ? response.meals as MealSummary[] : [];
      }));
      const ids = interleaveMealIds(searches, 30, excludedIds, excludedTitles);
      const details = await Promise.all(ids.map(async (id) => {
        const response = await providerJson(`${base}/lookup.php?i=${encodeURIComponent(id)}`);
        return Array.isArray(response.meals) ? response.meals[0] as MealDetail | undefined : undefined;
      }));
      const recipes = details
        .flatMap((meal) => meal ? [normalizeExternalMeal(meal, pantry, parsed.data.allergies)].filter((item): item is ExternalRecipe => item !== null) : [])
        .filter((recipe) => recipe.missingIngredients.length <= MAX_COUNTED_MISSING_INGREDIENTS)
        .filter((recipe) => !excludedTitles.has(titleKey(recipe.title)))
        .filter((recipe) => providerAudience !== "kids" || (recipe.matchedIngredients.length > 0 && kidFriendlyScore(recipe.title, recipe.ingredients.map((item) => item.name)) > 0))
        .sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length || a.missingIngredients.length - b.missingIngredients.length);
      if (providerAudience === "kids") recipes.splice(12);
      return recipes;
    };
    const spoonacularEnabled = spoonacularConfigured();
    const edamamEnabled = edamamConfigured();
    const results = await Promise.allSettled([
      edamamEnabled ? searchEdamamRecipes({ pantry, anchors, allergies: parsed.data.allergies, excludedIds, excludedTitles, audience: providerAudience }) : Promise.resolve([] as ExternalRecipe[]),
      spoonacularEnabled ? searchSpoonacularRecipes({ pantry, anchors, allergies: parsed.data.allergies, excludedIds, excludedTitles, audience: providerAudience }) : Promise.resolve([] as ExternalRecipe[]),
      key ? mealSearch() : Promise.resolve([] as ExternalRecipe[]),
    ]);
    const configured = [edamamEnabled, spoonacularEnabled, Boolean(key)];
    const providerNames = ["Edamam", "Spoonacular", "TheMealDB"] as const;
    const providersUnavailable = results.flatMap((result, index) => configured[index] && result.status === "rejected" ? [providerNames[index]!] : []);
    results.forEach((result, index) => {
      if (configured[index] && result.status === "rejected") {
        req.log.warn({ provider: providerNames[index], reason: result.reason instanceof Error ? result.reason.message : "Unknown provider error" }, "Published recipe provider unavailable");
      }
    });
    const recipes: ExternalRecipe[] = [];
    const seenTitles = new Set<string>();
    const limit = parsed.data.audience === "kids" ? 12 : 30;
    const providerRecipes = results.map((result) => result.status === "fulfilled"
      ? result.value.filter((recipe) => !parsed.data.course || suitableMealCourse(recipe, parsed.data.course, parsed.data.audience, parsed.data.mainRecipe, anchors))
      : []);
    const sourceResults: OnlineSourceResult[] = results.map((result, index) => ({
      provider: providerNames[index]!,
      status: !configured[index] ? "not_configured" : result.status === "rejected" ? "unavailable" : providerRecipes[index]!.length ? "found" : "no_results",
      count: configured[index] ? providerRecipes[index]!.length : 0,
    }));
    // Edamam has priority; Spoonacular and TheMealDB fill remaining slots.
    for (const items of providerRecipes) {
      for (const recipe of items) {
        const title = titleKey(recipe.title);
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);
        recipes.push(recipe);
        if (recipes.length >= limit) break;
      }
      if (recipes.length >= limit) break;
    }
    res.json({ recipes, provider: "Multiple sources", providersUnavailable, sourceResults, safetyNotice });
  } catch {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Published recipes are temporarily unavailable. Saved recipes remain available.");
  }
});

export default router;
