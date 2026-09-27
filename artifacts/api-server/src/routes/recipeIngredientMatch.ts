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
