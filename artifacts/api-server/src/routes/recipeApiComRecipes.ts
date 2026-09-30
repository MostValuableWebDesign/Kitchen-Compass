import { assessRecipeAllergens, requestedAllergenConflicts, recipeSearchFoodTerm } from "@workspace/recipe-calculations";
import type { ExternalRecipe } from "./externalRecipes";
import { kidFriendlyScore } from "./kidFriendly";
import { normalizeStructuredOnlineRecipe } from "./structuredOnlineRecipe";
import { MAX_COUNTED_MISSING_INGREDIENTS, MAX_PROVIDER_SEARCH_ANCHORS } from "./providerSearchLimits";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import { recordCandidateRemoval, type RecipeNormalizationFailure, type RecipeSearchDiagnostics } from "./recipeSearchDiagnostics";

export const recipeApiComUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function recipeApiComConfigured() { return Boolean(process.env.RECIPE_API_COM_API_KEY?.trim()); }
const titleKey = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export function normalizeRecipeApiComRecipe(raw: unknown, pantry: string[], allergies: string[], onFailure?: (reason: RecipeNormalizationFailure) => void): ExternalRecipe | null {
  const invalid = () => { onFailure?.("invalid"); return null; };
  if (!record(raw) || typeof raw.id !== "string" || !recipeApiComUuid.test(raw.id) || typeof raw.name !== "string"
    || !Array.isArray(raw.ingredients) || !raw.ingredients.length || !Array.isArray(raw.instructions) || !raw.instructions.length) return invalid();
  const ingredients: Array<{ name: string; quantity: number; unit: string }> = [];
  const measures: string[] = [];
  for (const group of raw.ingredients) {
    if (!record(group) || !Array.isArray(group.items) || !group.items.length) return invalid();
    for (const item of group.items) {
      if (!record(item) || typeof item.name !== "string" || !item.name.trim()
        || !(item.quantity === null || (typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0))
        || !(item.unit === null || typeof item.unit === "string")
        || !(item.preparation === null || typeof item.preparation === "string")
        || !(item.notes === null || typeof item.notes === "string")) return invalid();
      const notes = [item.preparation, item.notes].filter((note): note is string => typeof note === "string" && Boolean(note.trim()));
      // Keep preparation/notes in allergen checks while matching the ingredient's base name.
      ingredients.push({ name: [item.name.trim(), ...notes].join("; "), quantity: item.quantity ?? 0, unit: item.unit ?? "" });
      measures.push([item.quantity === null ? "" : String(item.quantity), item.unit ?? "", item.name.trim(), ...notes].filter(Boolean).join(" "));
    }
  }
  const steps: Array<{ number: number; text: string }> = [];
  const seen = new Set<number>();
  for (const step of raw.instructions) {
    if (!record(step) || typeof step.step_number !== "number" || !Number.isSafeInteger(step.step_number) || step.step_number <= 0
      || seen.has(step.step_number) || typeof step.text !== "string" || !step.text.trim()) return invalid();
    seen.add(step.step_number); steps.push({ number: step.step_number, text: step.text.trim() });
  }
  const warnings = record(raw.dietary) && Array.isArray(raw.dietary.not_suitable_for) ? raw.dietary.not_suitable_for.filter((value): value is string => typeof value === "string") : [];
  if (requestedAllergenConflicts(assessRecipeAllergens(warnings, []), allergies)) { onFailure?.("allergy"); return null; }
  const recipe = normalizeStructuredOnlineRecipe({ title: raw.name, ingredients, instructions: steps.sort((a, b) => a.number - b.number).map((step) => step.text) }, pantry, allergies,
    { provider: "Recipe-API.com", idPrefix: "recipe-api-com", id: `recipe-api-com:${raw.id.toLowerCase()}` }, onFailure);
  if (!recipe) return null;
  // Null quantities mean unspecified/to taste, not zero. Preserve that distinction in the app.
  recipe.ingredients = recipe.ingredients.map((item, index) => ({ ...item, measure: measures[index]! }));
  return recipe;
}

export async function searchRecipeApiComRecipes(input: {
  pantry: string[]; anchors: string[]; allergies: string[]; excludedIds: Set<string>; excludedTitles: Set<string>; audience: "general" | "kids"; course?: "main" | "side";
}, diagnostics?: RecipeSearchDiagnostics): Promise<ExternalRecipe[]> {
  const key = process.env.RECIPE_API_COM_API_KEY?.trim();
  if (!key) throw new Error("Recipe-API.com is not configured");
  const terms = [...new Set(input.anchors.slice(0, MAX_PROVIDER_SEARCH_ANCHORS)
    .filter((name) => name.trim() && !isNonCountedMissingIngredient(name))
    .map((name) => recipeSearchFoodTerm(name) ?? name.trim().toLowerCase()))];
  if (!terms.length) return [];
  const configured = Number(process.env.RECIPE_API_COM_MAX_DETAILS ?? 3);
  const maxDetails = Math.min(input.course ? 2 : 5, Number.isInteger(configured) && configured > 0 ? configured : 3);
  const signal = AbortSignal.timeout(20_000);
  const json = async (path: string) => {
    const response = await fetch(`https://recipe-api.com/api/v1/${path}`, { headers: { "X-API-Key": key, accept: "application/json" }, signal });
    if (!response.ok) throw new Error(`Recipe-API.com responded ${response.status}`);
    const payload: unknown = await response.json();
    if (!record(payload)) throw new Error("Recipe-API.com returned an invalid response");
    return payload;
  };
  const ingredientIds = new Set<string>();
  for (const term of terms) {
    // The recipe filter accepts UUIDs, not ingredient names. Discovery is unmetered.
    const lookup = await json(`ingredients?${new URLSearchParams({ q: term, per_page: "100", page: "1" })}`);
    if (!Array.isArray(lookup.data)) throw new Error("Recipe-API.com ingredient search returned an invalid response");
    const candidates = lookup.data.filter((item): item is { id: string; name: string } => record(item)
      && typeof item.id === "string" && recipeApiComUuid.test(item.id) && typeof item.name === "string" && Boolean(item.name.trim()));
    const ingredient = candidates.find((item) => titleKey(item.name) === titleKey(term))
      ?? candidates.find((item) => recipeSearchFoodTerm(item.name) === term);
    // Never quietly drop a required ingredient or replace it with an unrelated hit.
    if (!ingredient) return [];
    ingredientIds.add(ingredient.id.toLowerCase());
  }
  const params = new URLSearchParams({ ingredients: [...ingredientIds].join(","), per_page: String(maxDetails), page: "1" });
  const listing = await json(`recipes?${params}`);
  if (!Array.isArray(listing.data)) throw new Error("Recipe-API.com search returned an invalid response");
  if (diagnostics) diagnostics.candidatesReceived += listing.data.length;
  const summaries: Array<{ id: string; name: string }> = [];
  const seenIds = new Set<string>();
  for (const raw of listing.data) {
    if (!record(raw) || typeof raw.id !== "string" || !recipeApiComUuid.test(raw.id) || typeof raw.name !== "string" || !raw.name.trim()) { recordCandidateRemoval(diagnostics, "invalid"); continue; }
    const id = raw.id.toLowerCase();
    if (input.excludedIds.has(`recipe-api-com:${id}`) || input.excludedTitles.has(titleKey(raw.name))) { recordCandidateRemoval(diagnostics, "excluded"); continue; }
    if (seenIds.has(id)) { recordCandidateRemoval(diagnostics, "duplicate"); continue; }
    seenIds.add(id); summaries.push({ id, name: raw.name });
  }
  recordCandidateRemoval(diagnostics, "candidateLimit", Math.max(0, summaries.length - maxDetails));
  const recipes: ExternalRecipe[] = [];
  for (const summary of summaries.slice(0, maxDetails)) {
    let detail: Record<string, unknown>;
    try { detail = await json(`recipes/${summary.id}`); }
    catch (error) {
      // Stop immediately on quota/auth/upstream failure. Keep already-qualified recipes.
      if (!recipes.length) throw error;
      break;
    }
    if (!record(detail.data) || typeof detail.data.id !== "string" || detail.data.id.toLowerCase() !== summary.id) { recordCandidateRemoval(diagnostics, "invalid"); continue; }
    const recipe = normalizeRecipeApiComRecipe(detail.data, input.pantry, input.allergies, (reason) => recordCandidateRemoval(diagnostics, reason));
    if (!recipe) continue;
    const reject = !recipe.matchedIngredients.length ? "noPantryMatch"
      : recipe.missingIngredients.length > MAX_COUNTED_MISSING_INGREDIENTS ? "tooManyMissing"
      : input.excludedTitles.has(titleKey(recipe.title)) ? "excluded"
      : input.audience === "kids" && kidFriendlyScore(recipe.title, recipe.ingredients.map((item) => item.name)) <= 0 ? "notKidFriendly" : undefined;
    if (reject) { recordCandidateRemoval(diagnostics, reject); continue; }
    recipes.push(recipe);
  }
  if (diagnostics) diagnostics.eligible = recipes.length;
  return recipes;
}
