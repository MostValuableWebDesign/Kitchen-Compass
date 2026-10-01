import assert from 'node:assert/strict';
import test from 'node:test';
import type { IngredientSuggestion } from '@workspace/api-client-react';
import { initialReceiptDecision, reviseReceiptSuggestion } from '../lib/receiptReview';

const eggs: IngredientSuggestion = {
  suggestionId: 'receipt-eggs', displayName: 'Eggs', normalizedName: 'egg',
  storageLocation: 'Refrigerator', quantity: 12, unit: 'ea', quantityKnown: true,
  confidence: 0.95, existingInventoryMatch: 'egg', sourcePhotoId: 'receipt-photo',
};
const stock = [{ name: 'Eggs', location: 'Refrigerator', status: 'fresh', sourceScanId: 'receipt-old' }];

test('new purchases default to adding stock while an identical imported receipt defaults to skip', () => {
  assert.equal(initialReceiptDecision(eggs, stock, 'receipt-new'), 'additional');
  assert.equal(initialReceiptDecision(eggs, stock, 'receipt-old'), 'same');
  assert.equal(initialReceiptDecision(eggs, [{ ...stock[0]!, name: 'Milk' }], 'receipt-old'), 'additional');
  assert.equal(initialReceiptDecision(eggs, [{ ...stock[0]!, location: 'Pantry' }], 'receipt-old'), 'additional');
});

test('correcting a misread receipt name removes stale inventory links and matches the corrected food', () => {
  const milk = reviseReceiptSuggestion(eggs, { displayName: 'Milk' }, stock);
  assert.equal(milk.normalizedName, 'milk');
  assert.equal(milk.existingInventoryMatch, undefined);
  const corrected = reviseReceiptSuggestion(milk, { displayName: 'Eggs' }, stock);
  assert.equal(corrected.existingInventoryMatch, 'egg');
  assert.equal(reviseReceiptSuggestion(eggs, { quantity: 24 }, stock).existingInventoryMatch, 'egg');
});
