/** Receipt line items must be purchases, not totals or non-food shopping. */
export function isPurchasedReceiptFood(item: { itemType: unknown; displayName: string; normalizedName: string; quantity: number | null }) {
  if (item.itemType !== "food" || item.quantity === 0) return false;
  const adjustment = /^(?:(?:sub|grand)\s*)?total(?:\s*[:\d$]|$)|^(?:tax|coupon|discount|payment|cash|change)(?:\s*[:\d$]|$)|\b(?:refund|return|void|gift card)\b/i;
  const nonfood = /\b(?:toilet paper|paper towels?|detergent|soap|shampoo|cleaner|pet food|dog food|cat food)\b/i;
  // A product such as Total cereal is food; totals are receipt labels, not brand words.
  const isExcluded = (name: string) => nonfood.test(name) || adjustment.test(name);
  return !isExcluded(item.displayName) && !isExcluded(item.normalizedName);
}

/** Convert supported fractional receipt weights to units accepted by kitchen entry. */
export function receiptQuantity(quantity: number | null, unit: string | null) {
  if (quantity === null || !unit?.trim()) return { quantity, unit };
  const normalized = unit.trim().toLowerCase().replace(/\.$/, "");
  const scale: Record<string, [number, string]> = { kg: [1000, "g"], kilogram: [1000, "g"], kilograms: [1000, "g"], lb: [16, "oz"], lbs: [16, "oz"], pound: [16, "oz"], pounds: [16, "oz"], l: [1000, "ml"], liter: [1000, "ml"], liters: [1000, "ml"] };
  if (quantity > 0 && quantity < 1 && scale[normalized]) {
    const [factor, smallerUnit] = scale[normalized]!;
    return { quantity: Number((quantity * factor).toFixed(6)), unit: smallerUnit };
  }
  return { quantity, unit: /^(?:each|ea|item|items|pack|packs|package|packages|bottle|bottles|bag|bags)$/.test(normalized) ? "ea" : normalized };
}
