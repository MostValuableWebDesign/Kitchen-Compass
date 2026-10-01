import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { prepareReceiptPdfSources, prepareReceiptPhotoSources, receiptBands, type ReceiptSource } from '../src/routes/receiptDocuments';
import { mergeReceiptLines, type ReceiptLine } from '../src/routes/receiptMerge';
import { normalizeReceiptFoodName } from '../src/routes/receiptScan';
import { receiptPhoto, scannedReceiptPdf, textReceiptPdf } from './receiptTestFixtures';

const source = (id: string, top = 0, page = 1): ReceiptSource => ({ id, originalId: 'receipt', page, top, height: 2200, kind: 'image' });
const line = (sourcePhotoId: string, quantity: number | null = 1, linePosition: number | null = 0.5): ReceiptLine => ({ sourcePhotoId, itemType: 'food', displayName: 'Chicken breast', normalizedName: 'chicken breast', storageLocation: 'Refrigerator', quantity, unit: 'ea', confidence: 0.9, uncertaintyReasons: [], linePosition, receiptLine: null });

test('receipt bands cover the complete very tall page, including its last row, with bounded overlap', () => {
  const bands = receiptBands(48014);
  assert.equal(bands.length, 25);
  assert.equal(bands[0]!.top, 0);
  assert.equal(bands.at(-1)!.top + bands.at(-1)!.height, 48014);
  for (let index = 1; index < bands.length; index++) {
    assert.equal(bands[index-1]!.top + bands[index-1]!.height - bands[index]!.top, 220);
    assert.ok(bands[index]!.height <= 2200);
  }
  assert.throws(() => receiptBands(100000), /smaller parts/);
});

test('native PDF text retains receipt line order while scanned PDFs and tall photos are rendered into sections', async () => {
  const signal = new AbortController().signal;
  const text = await prepareReceiptPdfSources(textReceiptPdf().toString('base64'), 'pdf', signal);
  assert.equal(text.length, 1);
  assert.equal(text[0]!.kind, 'text');
  assert.match(text[0]!.text!, /\[Line 2\] Chicken breast/);
  const scanned = await prepareReceiptPdfSources(scannedReceiptPdf().toString('base64'), 'pdf', signal);
  assert.ok(scanned.length > 3);
  assert.ok(scanned.every((part) => part.kind === 'image' && part.base64 && part.height <= 2200));
  const photos = await prepareReceiptPhotoSources([{ id: 'photo', base64: receiptPhoto(5000).toString('base64') }], signal);
  assert.equal(photos.length, 3);
  assert.equal(photos.at(-1)!.top + photos.at(-1)!.height, 5000);
});

test('dark and low-contrast receipt lettering becomes dark on light lossless sections for photos and PDFs', async () => {
  const signal = new AbortController().signal;
  for (const [background, lettering] of [['#151515', '#dddddd'], ['#555555', '#888888'], ['#cccccc', '#999999'], ['#ffffff', '#000000']]) {
    const photos = await prepareReceiptPhotoSources([{ id: 'photo', base64: receiptPhoto(500, background, lettering).toString('base64') }], signal);
    const pdf = await prepareReceiptPdfSources(scannedReceiptPdf(500, background, lettering).toString('base64'), 'pdf', signal);
    for (const section of [photos[0]!, pdf[0]!]) {
      const bytes = Buffer.from(section.base64!, 'base64');
      assert.equal((await sharp(bytes).metadata()).format, 'png');
      const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
      assert.ok(data[0]! > 220, 'background must be light');
      // The fixture has lettering at x20..300, y60..80, scaled by four for PDF rendering.
      const scale = info.width / 400;
      let dark = 0;
      for (let y = Math.floor(60 * scale); y < 80 * scale; y++) {
        for (let x = Math.floor(20 * scale); x < 300 * scale; x++) {
          if (data[y * info.width + x]! < 70) dark++;
        }
      }
      assert.ok(dark > 50 * scale * scale, 'readable letter strokes must survive enhancement');
    }
  }
});

test('overlapping rows count once, genuine repeated purchases count separately, and unknown quantities stay unknown', () => {
  const sources = [source('a'), source('b',1980), source('c',3960)];
  const result = mergeReceiptLines([line('a',1,0.95),line('b',1,0.05),line('c',2,0.5)],sources);
  assert.equal(result.suggestions[0]!.quantity, 3);
  assert.equal(result.suggestions[0]!.sourcePhotoId,'receipt');
  const unknown = mergeReceiptLines([line('a',null),line('c',2)],sources);
  assert.equal(unknown.suggestions[0]!.quantity,null);
  const conflict = mergeReceiptLines([line('a',1,0.95),line('b',2,0.05)],sources);
  assert.equal(conflict.suggestions[0]!.quantity,null);
  const ambiguous = mergeReceiptLines([line('a',1,null),line('b',1,null)],sources);
  assert.equal(ambiguous.suggestions[0]!.quantity,1);
  assert.ok(ambiguous.warnings.length);
  const weights = mergeReceiptLines([{...line('a',1),unit:'lb'},{...line('c',8),unit:'oz'}],sources);
  assert.equal(weights.suggestions[0]!.quantity,1.5);
  assert.equal(weights.suggestions[0]!.unit,'lb');
  const separatePages = mergeReceiptLines([line('a'),line('b')],[source('a',0,1),source('b',0,2)]);
  assert.equal(separatePages.suggestions[0]!.quantity,2);
});

test('native text line identity and source IDs are checked and large receipts exceed the old 100-product ceiling', () => {
  const text: ReceiptSource = {...source('text'),kind:'text',lineCount:150};
  const row = {...line('text'),receiptLine:2};
  assert.equal(mergeReceiptLines([row,row],[text]).suggestions[0]!.quantity,1);
  assert.throws(() => mergeReceiptLines([{...row,receiptLine:200}],[text]),/invalid line/);
  assert.throws(() => mergeReceiptLines([line('invented')],[text]),/invalid source/);
  const items = Array.from({length:143},(_,i)=>({...row,receiptLine:i+1,displayName:`Food ${i+1}`}));
  assert.equal(mergeReceiptLines(items,[text]).suggestions.length,143);
});

test('receipt normalization removes brands and sizes while retaining food types and prepared products', () => {
  assert.equal(normalizeReceiptFoodName('Heritage Farm® Boneless Skinless Chicken Breasts, 1 lb'),'Chicken breast');
  assert.equal(normalizeReceiptFoodName('Spice World Minced Garlic 8 oz'),'Garlic');
  assert.equal(normalizeReceiptFoodName('Jumbo Yellow Onions, 1 ct'),'Yellow onion');
  assert.equal(normalizeReceiptFoodName('Kroger Chicken Fries, 20 oz'),'Chicken Fries');
  assert.equal(normalizeReceiptFoodName('Italian Sausage Ravioli, 12 oz'),'Italian Sausage Ravioli');
  assert.equal(normalizeReceiptFoodName('Kroger Garlic and Herb Seasoning, 8 oz'),'Garlic and Herb Seasoning');
});
