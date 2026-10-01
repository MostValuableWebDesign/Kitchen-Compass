import { prepareReceiptPdfSources, prepareReceiptPhotoSources, type ReceiptSource } from './receiptDocuments';
import { mergeReceiptLines, type ReceiptLine } from './receiptMerge';

type Analysis = { suggestions: ReceiptLine[]; warnings: string[] };
export async function analyzeReceipt(input: {
  photos: Array<{ id: string; base64: string }>;
  receiptPdf?: { id: string; base64: string };
  prompt: string; signal: AbortSignal;
}, recognize: (content: unknown[]) => Promise<Analysis>) {
  const sources = input.receiptPdf
    ? await prepareReceiptPdfSources(input.receiptPdf.base64, input.receiptPdf.id, input.signal)
    : await prepareReceiptPhotoSources(input.photos, input.signal);
  const batches: ReceiptSource[][] = [];
  for (let index = 0; index < sources.length; index += 3) batches.push(sources.slice(index, index + 3));
  const results: Analysis[] = new Array(batches.length);
  let next = 0;
  // Small batches preserve each section's resolution; bound both requests and concurrency.
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (next < batches.length) {
      input.signal.throwIfAborted();
      const index = next++, batch = batches[index]!;
      const content: unknown[] = [{ type: 'text', text: `${input.prompt}\nRead each source separately. Return one suggestion per purchased product line, without combining distinct purchase lines. Adjacent sections overlap: extract every legible product line; the server removes overlap duplicates. For images, linePosition is the product-title row center as a fraction from 0 (top) to 1 (bottom); receiptLine is null. For extracted text, receiptLine is its printed [Line N] number and linePosition is null. Do not extract partial/unreadable titles from section boundaries. Normalize displayName to a recognizable food name without retailer brands, trademarks, UPCs, package sizes or prices. Preserve food types, meat cuts and preparations. For example Heritage Farm Boneless Skinless Chicken Breasts 1 lb becomes Chicken breast; Spice World Minced Garlic 8 oz becomes Garlic; Jumbo Yellow Onions 1 ct becomes Yellow onion. Prepared foods remain their actual product types: chicken fries, soup, sauces, ravioli and packaged meals must not become raw meat, vegetables or inferred component ingredients.` }];
      for (const source of batch) {
        content.push({ type: 'text', text: `Source ID: ${source.id}\n${source.kind === 'text' ? source.text : 'Receipt image section follows.'}` });
        if (source.kind === 'image') content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${source.base64}`, detail: 'high' } });
      }
      const result = await recognize(content);
      // Validate against THIS batch, not all sections: a model cannot invent unseen IDs.
      const ids = new Set(batch.map((source) => source.id));
      if (result.suggestions.some((line) => !ids.has(line.sourcePhotoId))) throw new Error('Receipt returned an invalid section ID');
      results[index] = result;
    }
  }));
  const merged = mergeReceiptLines(results.flatMap((result) => result.suggestions), sources);
  const textCount = sources.filter((source) => source.kind === 'text').length;
  return { suggestions: merged.suggestions, warnings: [...new Set(results.flatMap((result) => result.warnings)), ...merged.warnings,
    `Receipt analyzed using ${textCount} text page(s) and ${sources.length - textCount} image section(s). Review every extracted product.`] };
}
