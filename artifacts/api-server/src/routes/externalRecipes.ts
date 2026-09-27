import { Router, type IRouter } from "express";
import { z } from "zod";
import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import { sendScanError } from "../middleware/scanSecurity";
import { kidFriendlyScore } from "./kidFriendly";
import { searchSpoonacularRecipes, spoonacularConfigured } from "./spoonacularRecipes";
import { edamamConfigured, searchEdamamRecipes } from "./edamamRecipes";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import {
  MAX_COUNTED_MISSING_INGREDIENTS,
  MAX_PROVIDER_PANTRY_INGREDIENTS,
  MAX_PROVIDER_SEARCH_ANCHORS,
  MAX_TOTAL_PUBLISHED_RECIPES,
} from "./providerSearchLimits";
import {
  createRecipeSearchDiagnostics,
  recordCandidateRemoval,
  type RecipeNormalizationFailure,
  type RecipeSearchDiagnostics,
} from "./recipeSearchDiagnostics";

const router: IRouter = Router();
export const externalRecipeRequestSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(MAX_PROVIDER_PANTRY_INGREDIENTS),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
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
type OnlineSourceResult = { provider: OnlineSource; status: "found" | "no_results" | "unavailable" | "not_configured" | "not_searched"; count: number };
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
function titleKey(title: string) {
  return title.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function combineProviderRecipeResults(
  groups: readonly ExternalRecipe[][],
  limit: number,
  onDrop?: (groupIndex: number, reason: "duplicate" | "resultLimit") => void,
) {
  const cappedLimit = Math.max(0, Math.min(MAX_TOTAL_PUBLISHED_RECIPES, Math.floor(limit)));
  const candidates: Array<{ recipe: ExternalRecipe; groupIndex: number }> = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    groups.forEach((group, groupIndex) => {
      const recipe = group[index];
      if (!recipe) return;
      const title = titleKey(recipe.title);
      if (seenIds.has(recipe.id) || seenTitles.has(title)) {
        onDrop?.(groupIndex, "duplicate");
        return;
      }
      seenIds.add(recipe.id);
      seenTitles.add(title);
      candidates.push({ recipe, groupIndex });
    });
  }
  candidates.sort((left, right) =>
    left.recipe.missingIngredients.length - right.recipe.missingIngredients.length
    || right.recipe.matchedIngredients.length - left.recipe.matchedIngredients.length);
  for (const candidate of candidates.slice(cappedLimit)) onDrop?.(candidate.groupIndex, "resultLimit");
  return candidates.slice(0, cappedLimit).map(({ recipe }) => recipe);
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

function interleaveMealIds(
  searches: MealSummary[][],
  limit: number,
  excludedIds = new Set<string>(),
  excludedTitles = new Set<string>(),
  diagnostics?: RecipeSearchDiagnostics,
) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const maxLength = Math.max(0, ...searches.map((results) => results.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const results of searches) {
      const summary = results[index];
      if (!summary?.idMeal) {
        recordCandidateRemoval(diagnostics, "invalid");
        continue;
      }
      const id = summary.idMeal;
      if (excludedIds.has(id) || (summary.strMeal && excludedTitles.has(titleKey(summary.strMeal)))) {
        recordCandidateRemoval(diagnostics, "excluded");
        continue;
      }
      if (seen.has(id)) {
        recordCandidateRemoval(diagnostics, "duplicate");
        continue;
      }
      seen.add(id);
      if (ids.length < limit) ids.push(id);
      else recordCandidateRemoval(diagnostics, "candidateLimit");
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

export function normalizeExternalMeal(
  meal: MealDetail,
  pantry: string[],
  allergies: string[],
  onFailure?: (reason: RecipeNormalizationFailure) => void,
): ExternalRecipe | null {
  if (!meal.idMeal || !meal.strMeal || !meal.strInstructions?.trim()) {
    onFailure?.("invalid");
    return null;
  }
  const ingredients = Array.from({ length: 20 }, (_, index) => ({
    name: meal[`strIngredient${index + 1}`]?.trim() ?? "",
    measure: meal[`strMeasure${index + 1}`]?.trim() ?? "",
  })).filter((item) => item.name);
  if (!ingredients.length) {
    onFailure?.("invalid");
    return null;
  }
  if (requestedAllergenConflicts(assessRecipeAllergens(ingredients.map((item) => item.name), []), allergies)) {
    onFailure?.("allergy");
    return null;
  }
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
  const parsed = externalRecipeRequestSchema.safeParse(req.body);
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
    req.log.info({ audience: parsed.data.audience, course: parsed.data.course ?? null,
      sourceResults: ["Edamam", "Spoonacular", "TheMealDB"].map((provider) => ({ provider, status: "not_configured", count: 0 })) }, "Published recipe source results");
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
    const mealSearch = async (diagnostics: RecipeSearchDiagnostics) => {
      const searches = await Promise.all(anchors.map(async (ingredient) => {
        const value = encodeURIComponent(ingredient.replace(/\s+/g, "_"));
        const response = await providerJson(`${base}/filter.php?i=${value}`);
        return Array.isArray(response.meals) ? response.meals as MealSummary[] : [];
      }));
      if (diagnostics) diagnostics.candidatesReceived += searches.reduce((count, results) => count + results.length, 0);
      const ids = interleaveMealIds(searches, MAX_TOTAL_PUBLISHED_RECIPES, excludedIds, excludedTitles, diagnostics);
      const details = await Promise.all(ids.map(async (id) => {
        const response = await providerJson(`${base}/lookup.php?i=${encodeURIComponent(id)}`);
        return Array.isArray(response.meals) ? response.meals[0] as MealDetail | undefined : undefined;
      }));
      const qualified: ExternalRecipe[] = [];
      for (const meal of details) {
        if (!meal) {
          recordCandidateRemoval(diagnostics, "invalid");
          continue;
        }
        const recipe = normalizeExternalMeal(meal, pantry, parsed.data.allergies, (reason) => {
          recordCandidateRemoval(diagnostics, reason);
        });
        if (!recipe) continue;
        if (recipe.missingIngredients.length > MAX_COUNTED_MISSING_INGREDIENTS) {
          recordCandidateRemoval(diagnostics, "tooManyMissing");
          continue;
        }
        if (excludedTitles.has(titleKey(recipe.title))) {
          recordCandidateRemoval(diagnostics, "excluded");
          continue;
        }
        if (providerAudience === "kids" && (!recipe.matchedIngredients.length || kidFriendlyScore(recipe.title, recipe.ingredients.map((item) => item.name)) <= 0)) {
          recordCandidateRemoval(diagnostics, "notKidFriendly");
          continue;
        }
        qualified.push(recipe);
      }
      qualified.sort((a, b) => a.missingIngredients.length - b.missingIngredients.length || b.matchedIngredients.length - a.matchedIngredients.length);
      const recipes = qualified.slice(0, MAX_TOTAL_PUBLISHED_RECIPES);
      recordCandidateRemoval(diagnostics, "resultLimit", qualified.length - recipes.length);
      diagnostics.eligible = recipes.length;
      return recipes;
    };
    const dislikes = new Set(parsed.data.dislikes.map(ingredientIdentity));
    const limit = MAX_TOTAL_PUBLISHED_RECIPES;
    const sources: Array<{ provider: OnlineSource; configured: boolean; search: (diagnostics: RecipeSearchDiagnostics) => Promise<ExternalRecipe[]> }> = [
      { provider: "Edamam", configured: edamamConfigured(), search: (diagnostics) => searchEdamamRecipes({ pantry, anchors, allergies: parsed.data.allergies, excludedIds, excludedTitles, audience: providerAudience }, diagnostics) },
      { provider: "Spoonacular", configured: spoonacularConfigured(), search: (diagnostics) => searchSpoonacularRecipes({ pantry, anchors, allergies: parsed.data.allergies, excludedIds, excludedTitles, audience: providerAudience, maxCandidates: parsed.data.course ? 4 : 8 }, diagnostics) },
      { provider: "TheMealDB", configured: Boolean(key), search: mealSearch },
    ];
    const outcomes = await Promise.all(sources.map(async (source) => {
      if (!source.configured) {
        return {
          provider: source.provider,
          sourceResult: { provider: source.provider, status: "not_configured", count: 0 } satisfies OnlineSourceResult,
          recipes: [] as ExternalRecipe[],
          diagnostics: undefined,
        };
      }
      const diagnostics = createRecipeSearchDiagnostics();
      try {
        const found = await source.search(diagnostics);
        const afterRouteFilters: ExternalRecipe[] = [];
        for (const recipe of found) {
          if (parsed.data.course && !suitableMealCourse(recipe, parsed.data.course, parsed.data.audience, parsed.data.mainRecipe, anchors)) {
            recordCandidateRemoval(diagnostics, "courseMismatch");
            continue;
          }
          if (recipe.ingredients.some((ingredient) => dislikes.has(ingredientIdentity(ingredient.name)))) {
            recordCandidateRemoval(diagnostics, "disliked");
            continue;
          }
          afterRouteFilters.push(recipe);
        }
        diagnostics.eligible = afterRouteFilters.length;
        return {
          provider: source.provider,
          sourceResult: { provider: source.provider, status: afterRouteFilters.length ? "found" : "no_results", count: afterRouteFilters.length } satisfies OnlineSourceResult,
          recipes: afterRouteFilters,
          diagnostics,
        };
      } catch (error) {
        req.log.warn({ provider: source.provider }, "Published recipe provider unavailable");
        return {
          provider: source.provider,
          sourceResult: { provider: source.provider, status: "unavailable", count: 0 } satisfies OnlineSourceResult,
          recipes: [] as ExternalRecipe[],
          diagnostics,
        };
      }
    }));
    const sourceResults = outcomes.map((outcome) => outcome.sourceResult);
    const providerDiagnostics = outcomes.flatMap((outcome) => outcome.diagnostics
      ? [{ provider: outcome.provider, diagnostics: outcome.diagnostics }]
      : []);
    const providersUnavailable = outcomes
      .filter((outcome) => outcome.sourceResult.status === "unavailable")
      .map((outcome) => outcome.provider);
    const providerRecipes = outcomes.filter((outcome) => outcome.diagnostics);
    const recipes = combineProviderRecipeResults(providerRecipes.map((source) => source.recipes), limit, (groupIndex, reason) => {
      const diagnostics = providerRecipes[groupIndex]?.diagnostics;
      recordCandidateRemoval(diagnostics, reason);
    });
    req.log.info({ audience: parsed.data.audience, course: parsed.data.course ?? null, sourceResults, providerDiagnostics }, "Published recipe source results");
    res.json({ recipes, provider: "Multiple sources", providersUnavailable, sourceResults, safetyNotice });
  } catch {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Published recipes are temporarily unavailable. Saved recipes remain available.");
  }
});

export default router;
