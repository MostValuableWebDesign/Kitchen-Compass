export function recipeIngredientIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/\btomatoes\b/g, "tomato").replace(/\bpotatoes\b/g, "potato")
    .replace(/\bberries\b/g, "berry").replace(/\bleaves\b/g, "leaf").replace(/s$/, "");
}

export function matchesPantryIngredient(value: string, pantryIds: ReadonlySet<string>) {
  const key = recipeIngredientIdentity(value);
  if (pantryIds.has(key)) return true;
  if (/^(?:boneless skinless )?chicken (?:breast|thigh|wing|leg|tenderloin)$/.test(key)) return pantryIds.has("chicken");
  if (key === "ground beef") return pantryIds.has("beef");
  if (/^(?:small|medium|large|jumbo) shrimp$/.test(key)) return pantryIds.has("shrimp");
  return false;
}

// These rules describe availability after a provider has returned a recipe. Keep
// provider search anchors on the separate, existing matcher above.
const preparationWords = new Set(["chopped", "diced", "minced", "sliced", "shredded", "grated", "peeled", "finely", "roughly", "thinly"]);
const singularWords: Record<string, string> = {
  tomatoes: "tomato", potatoes: "potato", leaves: "leaf", berries: "berry",
  onions: "onion", scallions: "scallion", chickpeas: "chickpea", beans: "bean",
  breasts: "breast", thighs: "thigh", wings: "wing", legs: "leg",
};
const aliases: Record<string, string> = {
  scallion: "green onion", "spring onion": "green onion",
  "garbanzo bean": "chickpea", "garbanzo": "chickpea",
};
const pastaShapes = new Set(["penne", "spaghetti", "macaroni", "rigatoni", "fusilli", "linguine", "fettuccine", "rotini", "farfalle"]);
const onionTypes = new Set(["red", "yellow", "white", "sweet"]);
const riceTypes = new Set(["brown", "white", "basmati", "jasmine"]);
const chickenCuts = new Set(["breast", "thigh", "wing", "leg", "tenderloin"]);
const substitutionFamilies = new Set(["pasta", "onion", "rice"]);

type IngredientIdentity = { key: string; family?: string; variety?: string };

function availabilityIdentity(value: string): IngredientIdentity {
  const words = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter((word) => word && !preparationWords.has(word))
    .map((word) => singularWords[word] ?? (word.length > 3 && /s$/.test(word) && !/(?:ss|us)$/.test(word) ? word.slice(0, -1) : word));
  let key = aliases[words.join(" ")] ?? words.join(" ");
  key = key.replace(/^boneless skinless /, "").replace(/^skinless boneless /, "");
  if (key === "pasta") return { key, family: "pasta" };
  const pasta = key.match(/^(?:(penne|spaghetti|macaroni|rigatoni|fusilli|linguine|fettuccine|rotini|farfalle))(?: pasta)?$/);
  if (pasta && pastaShapes.has(pasta[1]!)) return { key: `pasta:${pasta[1]}`, family: "pasta", variety: pasta[1] };
  const onion = key.match(/^(?:(red|yellow|white|sweet) )?onion$/);
  if (onion && (!onion[1] || onionTypes.has(onion[1]))) return { key, family: "onion", variety: onion[1] };
  const rice = key.match(/^(?:(brown|white|basmati|jasmine) )?rice$/);
  if (rice && (!rice[1] || riceTypes.has(rice[1]))) return { key, family: "rice", variety: rice[1] };
  const chicken = key.match(/^chicken(?: (breast|thigh|wing|leg|tenderloin))?$/);
  if (chicken && (!chicken[1] || chickenCuts.has(chicken[1]))) return { key, family: "chicken", variety: chicken[1] };
  if (key === "beef" || key === "ground beef") return { key, family: "beef", variety: key === "beef" ? undefined : "ground" };
  if (key === "shrimp" || /^(?:small|medium|large|jumbo) shrimp$/.test(key)) return { key: "shrimp", family: "shrimp" };
  return { key };
}

export type IngredientAvailability = "match" | "possible_substitute" | "missing";

export function classifyIngredientAvailability(recipeName: string, pantryName: string): IngredientAvailability {
  const recipe = availabilityIdentity(recipeName);
  const pantry = availabilityIdentity(pantryName);
  if (!recipe.key || !pantry.key) return "missing";
  if (recipe.key === pantry.key) return "match";
  if (!recipe.family || recipe.family !== pantry.family) return "missing";
  if (!recipe.variety || !pantry.variety) return "match";
  return substitutionFamilies.has(recipe.family) ? "possible_substitute" : "missing";
}

export function assessPublishedRecipeIngredients(ingredients: readonly { name: string }[], pantry: readonly string[], isNonCounted: (name: string) => boolean) {
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];
  const possibleSubstitutions: Array<{ recipeIngredient: string; pantryIngredient: string }> = [];
  const seen = new Set<string>();
  for (const { name } of ingredients) {
    const key = availabilityIdentity(name).key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (pantry.some((item) => classifyIngredientAvailability(name, item) === "match")) {
      matchedIngredients.push(name);
      continue;
    }
    if (isNonCounted(name)) continue;
    missingIngredients.push(name);
    const substitute = pantry.find((item) => classifyIngredientAvailability(name, item) === "possible_substitute");
    if (substitute) possibleSubstitutions.push({ recipeIngredient: name, pantryIngredient: substitute });
  }
  return { matchedIngredients, missingIngredients, possibleSubstitutions };
}
