import type { IngredientSuggestion } from '@workspace/api-client-react';
import { normalizeIngredientName } from './kitchenLogic';

type Stock = { name: string; location: string; status: string; sourceScanId?: string };
export function reviseReceiptSuggestion(suggestion: IngredientSuggestion, changes: Partial<IngredientSuggestion>, inventory: readonly Stock[]): IngredientSuggestion {
  const revised = { ...suggestion, ...changes };
  if (changes.displayName !== undefined) {
    revised.normalizedName = normalizeIngredientName(revised.displayName);
    const match = inventory.find((item) => item.status !== 'used' && normalizeIngredientName(item.name) === revised.normalizedName);
    revised.existingInventoryMatch = match ? normalizeIngredientName(match.name) : undefined;
  }
  return revised;
}
export function initialReceiptDecision(suggestion: IngredientSuggestion, inventory: readonly Stock[], scanId: string): 'same' | 'additional' {
  const alreadyImported = inventory.some((item) => item.sourceScanId === scanId
    && item.location === suggestion.storageLocation
    && normalizeIngredientName(item.name) === normalizeIngredientName(suggestion.displayName));
  return alreadyImported ? 'same' : 'additional';
}
