const seasoningTerms = new Set([
  "salt", "sea salt", "kosher salt", "pepper", "black pepper", "white pepper", "red pepper", "red pepper flakes",
  "paprika", "cayenne", "chilli", "chili", "cumin", "coriander",
  "turmeric", "cinnamon", "nutmeg", "clove", "allspice", "cardamom", "ginger",
  "oregano", "basil", "thyme", "rosemary", "parsley", "cilantro", "dill", "sage",
  "mint", "tarragon", "bay leaf", "garam masala", "curry powder", "spice", "herb",
  "garlic powder", "onion powder", "seasoning", "seasoning mix", "seasoned salt", "pepper flakes",
]);
const pantryStaples = new Set(["water", "olive oil", "vegetable oil", "sugar"]);

export function isNonCountedMissingIngredient(value: string) {
  const identity = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
  const core = identity.replace(/\b(fresh|dried|dry|ground|whole|chopped|minced|crushed|leaves|leave|leaf|flakes|flake|seeds|seed)\b/g, " ").replace(/\s+/g, " ").trim();
  return pantryStaples.has(core) || seasoningTerms.has(core) || /^(?:[a-z]+ )?(?:herb|spice|seasoning)(?: blend| mix)?$/.test(core);
}
