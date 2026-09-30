import { createHash } from "node:crypto";
import { assessRecipeAllergens, requestedAllergenConflicts } from "@workspace/recipe-calculations";
import type { ExternalRecipe } from "./externalRecipes";
import { assessPublishedRecipeIngredients } from "./recipeIngredientMatch";
import { isNonCountedMissingIngredient } from "./recipeSeasonings";
import type { RecipeNormalizationFailure } from "./recipeSearchDiagnostics";

export function normalizeStructuredOnlineRecipe(raw: unknown, pantry: string[], allergies: string[], options: { provider: ExternalRecipe["provider"]; idPrefix: string; id?: string }, onFailure?: (reason: RecipeNormalizationFailure) => void): ExternalRecipe | null {
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
  const { matchedIngredients, missingIngredients, possibleSubstitutions } = assessPublishedRecipeIngredients(ingredients, pantry, isNonCountedMissingIngredient);
  const title = value.title.trim();
  const instructions = (value.instructions as string[]).map((step) => step.trim()).join("\n");
  const id = options.id ?? `${options.idPrefix}:${createHash("sha256").update(JSON.stringify([title.toLowerCase(), ingredients, instructions])).digest("hex")}`;
  // This provider has no recipe permalink. The app displays its instructions in the current session.
  return { id, title, provider: options.provider, sourceName: options.provider, sourceUrl: "", ingredients, instructions,
    matchedIngredients, missingIngredients, possibleSubstitutions, safetyVerified: false };
}
