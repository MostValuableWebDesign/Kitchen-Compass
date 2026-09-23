import { Router, type IRouter } from "express";
import { z } from "zod";
import { sendScanError } from "../middleware/scanSecurity";

const router: IRouter = Router();
const requestSchema = z.object({
  recipes: z.array(z.object({
    recipeVersion: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    ingredients: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  })).min(1).max(8),
});
type ImageRequest = z.infer<typeof requestSchema>["recipes"][number];

type Meal = { idMeal?: string; strMeal?: string; strMealThumb?: string | null; [key: string]: string | null | undefined };
type RecipeImage = {
  recipeVersion: string;
  imageUrl?: string;
  imageBase64?: string;
  source?: "TheMealDB" | "AI-generated";
};

function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.themealdb.com", "themealdb.com"].includes(url.hostname) ? url.toString() : undefined;
  } catch { return undefined; }
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeIngredient(value: string) {
  const name = normalizeTitle(value);
  return name.endsWith("s") && !name.endsWith("ss") ? name.slice(0, -1) : name;
}

const minorIngredients = new Set(["salt", "pepper", "water", "oil", "olive oil", "vegetable oil"]);

function ingredientsMatch(recipe: ImageRequest, meal: Meal) {
  const expected = recipe.ingredients.map(normalizeIngredient).filter((name) => !minorIngredients.has(name));
  const source = Array.from({ length: 20 }, (_, index) => normalizeIngredient(meal[`strIngredient${index + 1}`] ?? "")).filter(Boolean);
  if (!expected.length || !source.length) return false;
  const overlaps = expected.filter((name) => source.some((item) => item === name || item.includes(name) || name.includes(item))).length;
  return overlaps >= Math.max(1, Math.ceil(expected.length / 2));
}

async function findSourceImage(recipe: ImageRequest, signal: AbortSignal): Promise<string | undefined> {
  const configuredKey = process.env.THEMEALDB_API_KEY?.trim();
  const key = process.env.NODE_ENV === "production"
    ? configuredKey && configuredKey !== "1" ? configuredKey : null
    : configuredKey || "1";
  if (!key) return undefined;
  try {
    const url = `https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}/search.php?s=${encodeURIComponent(recipe.title)}`;
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) });
    if (!response.ok) return undefined;
    const payload = await response.json() as { meals?: Meal[] | null };
    const exact = payload.meals?.find((meal) => normalizeTitle(meal.strMeal ?? "") === normalizeTitle(recipe.title) && ingredientsMatch(recipe, meal));
    return safeHttpsUrl(exact?.strMealThumb);
  } catch { return undefined; }
}

async function generateImage(recipe: ImageRequest, signal: AbortSignal): Promise<string | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "gpt-image-2.5-flare",
      size: "1024x1024",
      quality: "low",
      output_format: "jpeg",
      output_compression: 65,
      n: 1,
      prompt: `A realistic appetizing editorial food photograph of the finished dish: ${recipe.title}. ${recipe.description} Show the prepared food using these ingredients: ${recipe.ingredients.join(", ")}. No text, logo, packaging, people, or extra dishes. This image is an illustration, not evidence of the exact cooked result.`,
    }),
  });
  if (!response.ok) throw new Error(`Image provider returned ${response.status}`);
  const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || Buffer.byteLength(base64, "base64") > 2_000_000) {
    throw new Error("Image provider returned no usable image");
  }
  return base64;
}

router.post("/recipes/images", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendScanError(req, res, 400, "INVALID_REQUEST", "The recipe image request is invalid.");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const onClose = () => controller.abort();
  res.once("close", onClose);
  try {
    // Source lookups are cheap and run first. Only unmatched recipes use image generation.
    const images: RecipeImage[] = await Promise.all(parsed.data.recipes.map(async (recipe) => {
      const imageUrl = await findSourceImage(recipe, controller.signal);
      return imageUrl
        ? { recipeVersion: recipe.recipeVersion, imageUrl, source: "TheMealDB" as const }
        : { recipeVersion: recipe.recipeVersion };
    }));
    const missing = images.map((image, index) => image.source ? -1 : index).filter((index) => index >= 0);
    // Keep generation concurrency bounded, and return source photos even if one generation fails.
    for (let offset = 0; offset < missing.length && !controller.signal.aborted; offset += 2) {
      await Promise.all(missing.slice(offset, offset + 2).map(async (index) => {
        try {
          const imageBase64 = await generateImage(parsed.data.recipes[index], controller.signal);
          if (imageBase64) images[index] = { recipeVersion: images[index].recipeVersion, imageBase64, source: "AI-generated" };
        } catch (error) {
          if (!controller.signal.aborted) req.log.warn({ errorType: error instanceof Error ? error.name : typeof error }, "Recipe image generation failed");
        }
      }));
    }
    if (!res.headersSent && !res.destroyed) res.json({ images });
  } finally {
    clearTimeout(timeout);
    res.off("close", onClose);
  }
});

export default router;
