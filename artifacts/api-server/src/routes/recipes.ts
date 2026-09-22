import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  assessRecipeAllergens,
  calculateHealthScore,
  calculateRecipeNutrition,
  hasUnknownAllergenInformation,
  requestedAllergenConflicts,
} from "@workspace/recipe-calculations";
import { sendScanError, scanLimits } from "../middleware/scanSecurity";

const router: IRouter = Router();

const inventorySchema = z.object({
  name: z.string().min(1).max(120),
  location: z.enum(["Refrigerator", "Freezer", "Pantry"]),
  quantityValue: z.number().min(0).optional(),
  unit: z.string().max(40).optional(),
  quantityKnown: z.boolean(),
  status: z.enum(["fresh", "low", "used"]),
  confidence: z.enum(["confirmed", "uncertain"]).optional(),
});

const preferencesSchema = z.object({
  allergies: z.array(z.string().max(80)).max(30),
  dietaryRestrictions: z.array(z.string().max(80)).max(20),
  dislikes: z.array(z.string().max(80)).max(30),
  cuisines: z.array(z.string().max(80)).max(20),
  skill: z.enum(["Beginner", "Comfortable", "Confident"]),
  cookTime: z.number().int().min(1).max(240),
  equipment: z.array(z.string().max(80)).max(30),
  nutrition: z.array(z.string().max(80)).max(20),
});

const filtersSchema = z.object({
  mealType: z.enum(["Any", "Breakfast", "Lunch", "Dinner"]),
  cuisine: z.string().max(80).optional(),
  maxMinutes: z.number().int().min(1).max(240).optional(),
  equipment: z.array(z.string().max(80)).max(30).optional(),
  dietaryPreference: z.string().max(80).optional(),
  minHealthScore: z.number().int().min(0).max(100).optional(),
});

const requestSchema = z.object({
  inventory: z.array(inventorySchema).max(100),
  preferences: preferencesSchema,
  filters: filtersSchema,
  variationSeed: z.string().min(1).max(80),
  excludeRecipeVersions: z.array(z.string().max(160)).max(30),
});

const ingredientSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  required: z.boolean(),
});

const stepSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(800),
  duration: z.number().int().min(0).max(600).optional(),
  temperature: z.object({
    fahrenheit: z.number(),
    celsius: z.number(),
  }).optional(),
  ingredients: z.array(z.string().max(120)).max(30),
  ingredientAmounts: z.array(z.object({
    name: z.string().min(1).max(120),
    quantity: z.number().positive(),
    unit: z.string().min(1).max(40),
    note: z.string().max(120).optional(),
  })).min(1).max(30),
  cues: z.array(z.string().min(1).max(300)).min(1).max(10),
  safetyTemperature: z.object({
    food: z.string().min(1).max(80),
    temperature: z.object({
      fahrenheit: z.number(),
      celsius: z.number(),
    }),
  }).optional(),
  mistakes: z.array(z.string().min(1).max(300)).min(1).max(10),
});

const nutritionAmountsSchema = z.object({
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  fiber: z.number().min(0),
  sodium: z.number().min(0),
  addedSugar: z.number().min(0),
  saturatedFat: z.number().min(0),
});

const nutritionSchema = z.object({
  status: z.enum(["calculated", "insufficient-information"]),
  perServing: nutritionAmountsSchema.optional(),
  total: nutritionAmountsSchema.optional(),
  coveredIngredients: z.array(z.string()),
  uncoveredIngredients: z.array(z.string()),
  ingredientCoverage: z.number().min(0).max(1),
  vegetableServingsPerServing: z.number().min(0).optional(),
  source: z.object({ id: z.string(), label: z.string() }),
});

const healthScoreSchema = z.object({
  status: z.enum(["calculated", "insufficient-information"]),
  score: z.number().int().min(0).max(100).optional(),
  note: z.string(),
  factors: z.array(z.object({
    key: z.enum(["vegetables", "fiber", "protein", "sodium", "added-sugar", "saturated-fat"]),
    label: z.string(),
    direction: z.enum(["positive", "negative", "neutral"]),
    points: z.number(),
    detail: z.string(),
  })),
});

const substitutionSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  reason: z.string().min(1).max(240),
});

const aiRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  cuisine: z.string().min(1).max(80),
  mealType: z.enum(["Breakfast", "Lunch", "Dinner"]),
  servings: z.number().int().positive().max(20),
  prepMinutes: z.number().int().min(0).max(240),
  cookMinutes: z.number().int().min(0).max(360),
  difficulty: z.enum(["Easy", "Moderate", "Hard"]),
  equipment: z.array(z.string().min(1).max(80)).min(1).max(20),
  ingredients: z.array(ingredientSchema).min(1).max(40),
  steps: z.array(stepSchema).min(1).max(30),
  allergens: z.array(z.string().min(1).max(80)).max(30),
  allergenInfo: z.enum(["complete", "incomplete"]),
  storageInstructions: z.string().min(1).max(300),
  reheatingInstructions: z.string().min(1).max(300),
  servingSuggestions: z.array(z.string().min(1).max(240)).min(1).max(10),
  commonMistakes: z.array(z.string().min(1).max(240)).min(1).max(10),
  dietaryTags: z.array(z.string().max(80)).max(20),
  dislikeTags: z.array(z.string().max(80)).max(20),
  nutritionTags: z.array(z.string().max(80)).max(20),
  substitutions: z.array(substitutionSchema).max(20),
});

const aiResponseSchema = z.object({
  recipes: z.array(aiRecipeSchema).max(8),
});

const recipeSchema = aiRecipeSchema.extend({
  id: z.string(),
  recipeVersion: z.string(),
  healthScore: healthScoreSchema,
  nutrition: nutritionSchema,
  substitutions: z.array(substitutionSchema.extend({ validated: z.literal(true) })),
});

const responseSchema = z.object({
  recipes: z.array(recipeSchema),
  source: z.literal("server-ai"),
  warning: z.string().optional(),
});

const model = "gpt-5.4-mini";

function normalize(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
  const singular = cleaned.endsWith("s") && !cleaned.endsWith("ss") ? cleaned.slice(0, -1) : cleaned;
  return ({
    eggs: "egg",
    peanuts: "peanut",
    "tree nuts": "tree nut",
    tomatoes: "tomato",
    berries: "berry",
    "bell peppers": "bell pepper",
  } as Record<string, string>)[cleaned] ?? singular;
}

function canonicalRecipe(recipe: z.infer<typeof aiRecipeSchema>) {
  return JSON.stringify({
    title: recipe.title.trim(),
    description: recipe.description.trim(),
    cuisine: recipe.cuisine.trim(),
    mealType: recipe.mealType,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    difficulty: recipe.difficulty,
    equipment: [...recipe.equipment].map((item) => item.trim()).sort(),
    ingredients: recipe.ingredients.map((item) => ({ ...item, name: item.name.trim(), unit: item.unit.trim() })),
    steps: recipe.steps,
    allergens: [...recipe.allergens].map(normalize).sort(),
    storageInstructions: recipe.storageInstructions.trim(),
    reheatingInstructions: recipe.reheatingInstructions.trim(),
    dietaryTags: [...recipe.dietaryTags].map(normalize).sort(),
    dislikeTags: [...recipe.dislikeTags].map(normalize).sort(),
    nutritionTags: [...recipe.nutritionTags].sort(),
    substitutions: recipe.substitutions,
  });
}

function stableVersion(recipe: z.infer<typeof aiRecipeSchema>) {
  return createHash("sha256").update(`recipe-contract-v1:${canonicalRecipe(recipe)}`).digest("hex").slice(0, 24);
}

function hasIngredient(recipe: z.infer<typeof aiRecipeSchema>, tokens: string[]) {
  return recipe.ingredients.some((ingredient) => tokens.some((token) => normalize(ingredient.name).includes(normalize(token))));
}

function violatesPreferences(recipe: z.infer<typeof aiRecipeSchema>, preferences: z.infer<typeof preferencesSchema>, filters: z.infer<typeof filtersSchema>) {
  const allergenAssessment = assessRecipeAllergens(recipe.ingredients, recipe.allergens);
  if (recipe.allergenInfo !== "complete") return "allergen information is incomplete";
  if (allergenAssessment.missingDeclaredAllergens.length) return "the allergen declaration does not cover the identified ingredients";
  if (hasUnknownAllergenInformation(allergenAssessment)) return "an ingredient could not be assessed reliably";
  if (requestedAllergenConflicts(allergenAssessment, preferences.allergies)) return "it conflicts with a saved allergy";

  const restrictions = [...preferences.dietaryRestrictions, ...(filters.dietaryPreference ? [filters.dietaryPreference] : [])].map(normalize);
  if (restrictions.includes("vegetarian") && hasIngredient(recipe, ["chicken", "beef", "pork", "fish", "shellfish"])) return "it conflicts with vegetarian restrictions";
  if (restrictions.includes("pescatarian") && hasIngredient(recipe, ["chicken", "beef", "pork"])) return "it conflicts with pescatarian restrictions";
  if (restrictions.includes("vegan") && hasIngredient(recipe, ["chicken", "beef", "pork", "fish", "shellfish", "egg", "milk", "cheese", "butter", "yogurt"])) return "it conflicts with vegan restrictions";
  if (restrictions.includes("gluten free") && hasIngredient(recipe, ["wheat", "bread", "pasta", "flour", "barley", "rye"])) return "it conflicts with gluten-free restrictions";
  if (restrictions.includes("dairy free") && hasIngredient(recipe, ["milk", "cheese", "butter", "yogurt", "cream", "parmesan"])) return "it conflicts with dairy-free restrictions";
  if (preferences.dislikes.some((dislike) => hasIngredient(recipe, [dislike]) || recipe.dislikeTags.map(normalize).includes(normalize(dislike)))) return "it includes a disliked ingredient";
  if (preferences.cuisines.length && !preferences.cuisines.some((cuisine) => normalize(cuisine) === normalize(recipe.cuisine))) return "it is outside the saved cuisine preferences";
  if (recipe.cookMinutes > preferences.cookTime) return "it exceeds the saved time limit";
  if (filters.maxMinutes !== undefined && recipe.prepMinutes + recipe.cookMinutes > filters.maxMinutes) return "it exceeds the selected time filter";
  if (filters.mealType !== "Any" && recipe.mealType !== filters.mealType) return "it does not match the selected meal type";
  if (filters.cuisine && normalize(recipe.cuisine) !== normalize(filters.cuisine)) return "it does not match the selected cuisine";
  const healthScore = calculateHealthScore(calculateRecipeNutrition(recipe.ingredients, recipe.servings));
  if (filters.minHealthScore !== undefined && (healthScore.score === undefined || healthScore.score < filters.minHealthScore)) return "it is below the selected health score or has insufficient score information";
  const equipment = new Set([...preferences.equipment, ...(filters.equipment ?? [])].map(normalize));
  if (recipe.equipment.some((item) => !equipment.has(normalize(item)))) return "it requires equipment that is not available";
  if (preferences.skill === "Beginner" && recipe.difficulty !== "Easy") return "it is above the saved skill level";
  if (preferences.skill === "Comfortable" && recipe.difficulty === "Hard") return "it is above the saved skill level";
  return null;
}

function validateSteps(recipe: z.infer<typeof aiRecipeSchema>) {
  return recipe.steps.every((step, index) => step.order === index + 1);
}

function makeResponseRecipe(recipe: z.infer<typeof aiRecipeSchema>, preferences: z.infer<typeof preferencesSchema>, filters: z.infer<typeof filtersSchema>) {
  const version = stableVersion(recipe);
  const nutrition = calculateRecipeNutrition(recipe.ingredients, recipe.servings);
  const healthScore = calculateHealthScore(nutrition);
  const substitutions = recipe.substitutions
    .filter((substitution) => !hasIngredient(recipe, [substitution.to]))
    .filter((substitution) => !violatesPreferences({
      ...recipe,
      ingredients: [{ name: substitution.to, quantity: 1, unit: "count", required: true }],
      substitutions: [],
    }, preferences, filters))
    .map((substitution) => ({ ...substitution, validated: true as const }));
  return {
    ...recipe,
    id: `discovered-${version}`,
    recipeVersion: version,
    nutrition,
    healthScore,
    substitutions,
  };
}

const responseSchemaForOpenAi = {
  type: "object",
  additionalProperties: false,
  properties: {
    recipes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          cuisine: { type: "string" },
          mealType: { type: "string", enum: ["Breakfast", "Lunch", "Dinner"] },
          servings: { type: "integer", minimum: 1 },
          prepMinutes: { type: "integer", minimum: 0 },
          cookMinutes: { type: "integer", minimum: 0 },
          difficulty: { type: "string", enum: ["Easy", "Moderate", "Hard"] },
          equipment: { type: "array", items: { type: "string" } },
          ingredients: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0 }, unit: { type: "string" }, required: { type: "boolean" } }, required: ["name", "quantity", "unit", "required"] } },
           steps: { type: "array", items: { type: "object", additionalProperties: false, properties: { order: { type: "integer", minimum: 1 }, title: { type: "string" }, body: { type: "string" }, duration: { type: "integer", minimum: 0 }, temperature: { type: "object", additionalProperties: false, properties: { fahrenheit: { type: "number" }, celsius: { type: "number" } }, required: ["fahrenheit", "celsius"] }, ingredients: { type: "array", items: { type: "string" } }, ingredientAmounts: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, quantity: { type: "number", exclusiveMinimum: 0 }, unit: { type: "string" }, note: { type: "string" } }, required: ["name", "quantity", "unit"] } }, cues: { type: "array", items: { type: "string" } }, safetyTemperature: { type: "object", additionalProperties: false, properties: { food: { type: "string" }, temperature: { type: "object", additionalProperties: false, properties: { fahrenheit: { type: "number" }, celsius: { type: "number" } }, required: ["fahrenheit", "celsius"] } }, required: ["food", "temperature"] }, mistakes: { type: "array", items: { type: "string" } } }, required: ["order", "title", "body", "ingredients", "ingredientAmounts", "cues", "mistakes"] } },
          allergens: { type: "array", items: { type: "string" } },
          allergenInfo: { type: "string", enum: ["complete", "incomplete"] },
          storageInstructions: { type: "string" },
          reheatingInstructions: { type: "string" },
           servingSuggestions: { type: "array", items: { type: "string" } },
           commonMistakes: { type: "array", items: { type: "string" } },
          dietaryTags: { type: "array", items: { type: "string" } },
          dislikeTags: { type: "array", items: { type: "string" } },
          nutritionTags: { type: "array", items: { type: "string" } },
          substitutions: { type: "array", items: { type: "object", additionalProperties: false, properties: { from: { type: "string" }, to: { type: "string" }, reason: { type: "string" } }, required: ["from", "to", "reason"] } },
        },
         required: ["title", "description", "cuisine", "mealType", "servings", "prepMinutes", "cookMinutes", "difficulty", "equipment", "ingredients", "steps", "allergens", "allergenInfo", "storageInstructions", "reheatingInstructions", "servingSuggestions", "commonMistakes", "dietaryTags", "dislikeTags", "nutritionTags", "substitutions"],
      },
    },
  },
  required: ["recipes"],
} as const;

router.post("/recipes/discover", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendScanError(req, res, 400, "INVALID_REQUEST", "The recipe discovery request is invalid.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Recipe discovery is unavailable. Previously saved recipes and the built-in examples remain available.");
    return;
  }

  const { inventory, preferences, filters, variationSeed, excludeRecipeVersions } = parsed.data;
  const usableInventory = inventory.filter((item) => item.status !== "used" && item.confidence !== "uncertain");
  const prompt = [
    "Generate practical recipe candidates from confirmed kitchen inventory.",
    "Use the confirmed inventory as the primary source. You may include a small number of clearly identified missing ingredients so the app can label the recipe Almost ready or Check quantities.",
    "Never invent an inventory item as if the user owns it. Never claim a required ingredient is available.",
    "Return varied candidates, not minor title changes. The variation seed selects a different direction.",
    "All ingredient amounts must be numeric and paired with a unit. Mark pantry garnish or optional additions required=false.",
    "All steps must be ordered from 1 with no gaps. Every step must include exact ingredientAmounts with numeric quantities and units, at least one sensory cue, and at least one common mistake to avoid.",
    "Use Fahrenheit as the authoritative cooking and food-safety temperature and include the equivalent Celsius value in the temperature object. Add safetyTemperature whenever a food safety target applies.",
    "Allergen information must be complete. List every allergen known for every ingredient. If uncertain, do not return the recipe.",
    "Only include substitutions that are safe for the supplied allergies, restrictions, dislikes, and equipment. Do not make medical claims.",
     "Do not provide health scores or nutrition values. The server calculates both from ingredient quantities and its bundled reference table. Use explicit ingredient names, numeric quantities, and units; do not invent missing quantities.",
    `Variation seed: ${variationSeed}`,
    `Do not repeat these recipe versions: ${JSON.stringify(excludeRecipeVersions)}`,
    `Confirmed inventory: ${JSON.stringify(usableInventory)}`,
    `Saved preferences: ${JSON.stringify(preferences)}`,
    `Selected filters: ${JSON.stringify(filters)}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scanLimits.requestTimeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_completion_tokens: 5000,
        response_format: { type: "json_schema", json_schema: { name: "recipe_discovery", strict: true, schema: responseSchemaForOpenAi } },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      req.log.error({ status: response.status }, "Recipe discovery AI request failed");
      sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Recipe discovery is temporarily unavailable. Previously saved recipes remain available.");
      return;
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Recipe discovery returned no content.");
    const aiResult = aiResponseSchema.parse(JSON.parse(rawContent));
    const safeRecipes = aiResult.recipes
      .filter(validateSteps)
      .filter((recipe) => !excludeRecipeVersions.includes(stableVersion(recipe)))
      .filter((recipe) => !violatesPreferences(recipe, preferences, filters))
      .map((recipe) => makeResponseRecipe(recipe, preferences, filters))
      .map((recipe) => recipeSchema.parse(recipe));
    if (!safeRecipes.length) {
      sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Recipe discovery did not return a safe recipe for these preferences. Previously saved recipes remain available.");
      return;
    }
    const result = responseSchema.parse({ recipes: safeRecipes, source: "server-ai" });
    res.json(result);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    req.log.error({ reason: isTimeout ? "timeout" : "provider_or_validation_failure" }, "Recipe discovery failed");
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Recipe discovery could not be completed. Previously saved recipes remain available.");
  } finally {
    clearTimeout(timeout);
  }
});

export default router;