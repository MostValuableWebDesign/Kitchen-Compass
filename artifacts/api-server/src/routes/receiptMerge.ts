import { isPurchasedReceiptFood, normalizeReceiptFoodName, receiptQuantity } from './receiptScan';
import type { ReceiptSource } from './receiptDocuments';

export type ReceiptLine = {
  sourcePhotoId: string; normalizedName: string; displayName: string;
  storageLocation: 'Refrigerator' | 'Freezer' | 'Pantry'; quantity: number | null; unit: string | null;
  confidence: number; uncertaintyReasons: string[]; itemType: 'food' | 'nonfood' | 'adjustment';
  receiptLine?: number | null; linePosition?: number | null;
};
function identity(name: string) {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ({ eggs: 'egg', tomatoes: 'tomato', bananas: 'banana', carrots: 'carrot' } as Record<string,string>)[clean] ?? clean;
}
function combinedQuantity(current: ReceiptLine, next: ReceiptLine): number | null {
  if (current.quantity == null || next.quantity == null || !current.unit || !next.unit) return null;
  if (current.unit === next.unit) return Number((current.quantity + next.quantity).toFixed(6));
  for (const units of [{g:1,kg:1000,oz:28.349523125,lb:453.59237}, {ml:1,l:1000,'fl oz':29.5735295625}] as Array<Record<string,number>>) {
    if (units[current.unit] && units[next.unit]) return Number((current.quantity + next.quantity * units[next.unit]! / units[current.unit]!).toFixed(6));
  }
  return null;
}

export function mergeReceiptLines(lines: ReceiptLine[], sources: ReceiptSource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const accepted: Array<{ line: ReceiptLine; source: ReceiptSource; position: number | null }> = [];
  let ambiguousOverlap = false;
  for (const original of lines) {
    const source = sourceMap.get(original.sourcePhotoId);
    if (!source) throw new Error('Receipt returned an invalid source ID');
    if (!isPurchasedReceiptFood(original)) continue;
    if (source.kind === 'text' && original.receiptLine != null &&
      (original.receiptLine < 1 || original.receiptLine > (source.lineCount ?? 0))) throw new Error('Receipt returned an invalid line number');
    const displayName = normalizeReceiptFoodName(original.displayName);
    const line = { ...original, displayName, normalizedName: identity(displayName), ...receiptQuantity(original.quantity, original.unit) };
    const position = source.kind === 'image' && original.linePosition != null ? source.top + original.linePosition * source.height : null;
    const duplicate = accepted.find((previous) => {
      if (previous.line.normalizedName !== line.normalizedName || previous.source.originalId !== source.originalId || previous.source.page !== source.page) return false;
      if (source.kind === 'text') return original.receiptLine != null && previous.line.receiptLine === original.receiptLine;
      if (previous.source.kind !== 'image') return false;
      if (previous.source.id === source.id) return position != null && previous.position != null && Math.abs(position - previous.position) < 20;
      const overlapStart = Math.max(source.top, previous.source.top);
      const overlapEnd = Math.min(source.top + source.height, previous.source.top + previous.source.height);
      if (overlapEnd <= overlapStart) return false;
      if (position != null && previous.position != null) {
        return position >= overlapStart - 100 && position <= overlapEnd + 100
          && previous.position >= overlapStart - 100 && previous.position <= overlapEnd + 100 && Math.abs(position - previous.position) < 150;
      }
      // Missing row positions cannot prove a second purchase in overlapping images.
      ambiguousOverlap = true;
      return line.quantity === previous.line.quantity && line.unit === previous.line.unit;
    });
    if (duplicate) {
      if (line.quantity !== duplicate.line.quantity || line.unit !== duplicate.line.unit) {
        duplicate.line.quantity = null; duplicate.line.unit = null;
        duplicate.line.uncertaintyReasons.push('Overlapping receipt sections disagree on quantity. Confirm the amount.');
      }
      continue;
    }
    accepted.push({ line, source, position });
  }
  const products = new Map<string, ReceiptLine>();
  for (const { line, source } of accepted) {
    const key = line.normalizedName;
    const current = products.get(key);
    if (!current) { products.set(key, { ...line, sourcePhotoId: source.originalId, uncertaintyReasons: [...line.uncertaintyReasons] }); continue; }
    const combined = combinedQuantity(current, line);
    if (combined !== null) current.quantity = combined;
    else { current.quantity = null; current.unit = null; current.uncertaintyReasons.push('Multiple purchase lines use unknown or incompatible quantities. Confirm the total.'); }
    current.confidence = Math.min(current.confidence, line.confidence);
  }
  if (products.size > 300) throw new Error('Too many receipt products. Upload the receipt in smaller parts.');
  return { suggestions: [...products.values()], warnings: ambiguousOverlap ? ['Some overlap quantities could not be verified. Review repeated products before saving.'] : [] };
}
