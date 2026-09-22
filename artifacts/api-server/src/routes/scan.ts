import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

const scanRequestSchema = z.object({
  photos: z.array(z.object({
    id: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().min(1),
  })).min(1).max(8),
  existingIngredients: z.array(z.object({
    name: z.string().min(1),
    location: z.enum(["Refrigerator", "Freezer", "Pantry"]),
  })).optional().default([]),
});

const suggestionSchema = z.object({
  suggestionId: z.string(),
  normalizedName: z.string(),
  displayName: z.string(),
  storageLocation: z.enum(["Refrigerator", "Freezer", "Pantry"]),
  quantity: z.number().min(0).optional(),
  unit: z.string().optional(),
  quantityKnown: z.boolean(),
  confidence: z.number().min(0).max(1),
  uncertaintyReasons: z.array(z.string()),
  sourcePhotoId: z.string(),
  existingInventoryMatch: z.string().optional(),
});

const scanResponseSchema = z.object({
  scanId: z.string(),
  suggestions: z.array(suggestionSchema),
  warnings: z.array(z.string()),
});

const model = "gpt-5.4-mini";
const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourcePhotoId: { type: "string" },
          normalizedName: { type: "string" },
          displayName: { type: "string" },
          storageLocation: { type: "string", enum: ["Refrigerator", "Freezer", "Pantry"] },
          quantity: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          uncertaintyReasons: { type: "array", items: { type: "string" } },
        },
        required: ["sourcePhotoId", "normalizedName", "displayName", "storageLocation", "quantity", "unit", "confidence", "uncertaintyReasons"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["suggestions", "warnings"],
} as const;

function stableSuggestionId(normalizedName: string, sourcePhotoId: string) {
  return `${normalizedName}-${sourcePhotoId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

router.post("/scan/analyze", async (req, res) => {
  const parsedRequest = scanRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({ error: "Invalid scan request", details: parsedRequest.error.flatten() });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Ingredient photo recognition is unavailable. Manual entry is still available." });
    return;
  }

  const { photos, existingIngredients = [] } = parsedRequest.data;
  const content = [
    {
      type: "text",
      text: [
        "Identify only clearly visible food ingredients in these kitchen photos.",
        "Return one suggestion per unique visible ingredient across all photos.",
        "Never infer hidden items, freshness, expiration dates, or precise quantities from appearance.",
        "Only provide a quantity and unit when a package label or clearly countable item supports it; otherwise use null.",
        "Use storageLocation only as a cautious proposal based on the visible item, not as a fact.",
        "When unsure, lower confidence and explain the uncertainty reason.",
        `Existing inventory for duplicate awareness: ${JSON.stringify(existingIngredients)}`,
      ].join("\n"),
    },
    ...photos.map((photo) => ({
      type: "image_url",
      image_url: { url: `data:${photo.mimeType};base64,${photo.base64}` },
    })),
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "ingredient_scan", strict: true, schema: responseSchema },
        },
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      req.log.error({ status: response.status }, "Ingredient scan AI request failed");
      res.status(503).json({ error: "Ingredient photo recognition is temporarily unavailable. Your existing kitchen inventory was not changed." });
      return;
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      res.status(503).json({ error: "Ingredient photo recognition returned no suggestions. Your existing kitchen inventory was not changed." });
      return;
    }

    const aiResult = JSON.parse(rawContent) as {
      suggestions: Array<{
        sourcePhotoId: string;
        normalizedName: string;
        displayName: string;
        storageLocation: "Refrigerator" | "Freezer" | "Pantry";
        quantity: number | null;
        unit: string | null;
        confidence: number;
        uncertaintyReasons: string[];
      }>;
      warnings: string[];
    };

    const seen = new Set<string>();
    const suggestions = aiResult.suggestions.flatMap((suggestion) => {
      const normalizedName = normalizeName(suggestion.normalizedName || suggestion.displayName);
      if (!normalizedName || seen.has(normalizedName)) return [];
      seen.add(normalizedName);
      const isQuantitySupported = typeof suggestion.quantity === "number" && Boolean(suggestion.unit);
      const normalized = {
        suggestionId: stableSuggestionId(normalizedName, suggestion.sourcePhotoId),
        normalizedName,
        displayName: suggestion.displayName.trim(),
        storageLocation: suggestion.storageLocation,
        ...(isQuantitySupported ? { quantity: suggestion.quantity, unit: suggestion.unit } : {}),
        quantityKnown: isQuantitySupported,
        confidence: Math.max(0, Math.min(1, suggestion.confidence)),
        uncertaintyReasons: [
          ...suggestion.uncertaintyReasons,
          ...(isQuantitySupported ? [] : ["Quantity was not clearly supported by the photo."]),
        ],
        sourcePhotoId: suggestion.sourcePhotoId,
        ...(existingIngredients.some((item) => normalizeName(item.name) === normalizedName) ? { existingInventoryMatch: normalizedName } : {}),
      };
      const validated = suggestionSchema.safeParse(normalized);
      return validated.success ? [validated.data] : [];
    });

    const result = scanResponseSchema.parse({
      scanId: `scan-${Date.now()}`,
      suggestions,
      warnings: [...aiResult.warnings, "Review every suggestion before saving. Photos cannot establish freshness or expiration dates."],
    });
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Ingredient scan processing failed");
    res.status(503).json({ error: "Ingredient photo recognition failed. Your existing kitchen inventory was not changed." });
  }
});

export default router;