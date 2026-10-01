import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { getDocument, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type ReceiptSource = {
  id: string; originalId: string; page: number; top: number; height: number;
  kind: 'text' | 'image'; text?: string; base64?: string; lineCount?: number;
};
export const MAX_RECEIPT_SECTIONS = 40;
const MAX_PIXELS = 80_000_000;
const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));

export async function prepareReceiptImage(input: Buffer): Promise<Buffer> {
  // Work on each bounded section, preserving positions for overlap reconciliation.
  // Dark-mode order receipts use light lettering on a nearly black background.
  const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const histogram = new Uint32Array(256);
  for (const value of data) histogram[value]!++;
  const percentile = (fraction: number) => {
    const target = Math.max(1, Math.ceil(data.length * fraction));
    let count = 0;
    for (let value = 0; value < 256; value++) {
      count += histogram[value]!;
      if (count >= target) return value;
    }
    return 255;
  };
  const invert = percentile(0.65) < 110;
  const low = invert ? 255 - percentile(0.999) : percentile(0.001);
  const high = invert ? 255 - percentile(0.001) : percentile(0.999);
  // Do not stretch almost-flat sections: that would amplify compression noise.
  const stretch = high - low >= 16;
  for (let index = 0; index < data.length; index++) {
    const value = invert ? 255 - data[index]! : data[index]!;
    data[index] = stretch ? Math.round(Math.max(0, Math.min(255, (value - low) * 255 / (high - low)))) : value;
  }
  // Lossless output avoids introducing fresh JPEG artifacts around small letters.
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

export function receiptBands(height: number) {
  if (!Number.isFinite(height) || height < 1) throw new Error('Invalid receipt dimensions');
  const bands: Array<{ top: number; height: number }> = [];
  for (let top = 0; top < height; top += 1980) {
    bands.push({ top, height: Math.min(2200, height - top) });
    if (bands.length > MAX_RECEIPT_SECTIONS) throw new Error('Receipt is too long. Upload it in smaller parts.');
    if (top + 2200 >= height) break;
  }
  return bands;
}

function pageLines(items: Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items']) {
  const rows: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = Number(item.transform[5]);
    const row = rows.find((row) => Math.abs(row.y - y) < 3);
    const part = { x: Number(item.transform[4]), text: item.str };
    if (row) row.parts.push(part); else rows.push({ y, parts: [part] });
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(' ').trim());
}

async function renderPage(page: PDFPageProxy, originalId: string, signal: AbortSignal): Promise<ReceiptSource[]> {
  const initial = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 1500 / initial.width) });
  const width = Math.ceil(viewport.width), fullHeight = Math.ceil(viewport.height);
  if (!width || width * fullHeight > MAX_PIXELS) throw new Error('Receipt image is too large. Upload it in smaller parts.');
  const sources: ReceiptSource[] = [];
  for (const [index, band] of receiptBands(fullHeight).entries()) {
    signal.throwIfAborted();
    const canvas = createCanvas(width, band.height);
    // Render into a bounded tile: no full-height canvas or whole-page downscaling.
    const task = page.render({ canvas: null, canvasContext: canvas.getContext('2d') as unknown as Parameters<PDFPageProxy['render']>[0]['canvasContext'],
      viewport, transform: [1, 0, 0, 1, 0, -band.top], background: '#ffffff' });
    const cancel = () => task.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try { await task.promise; }
    finally { signal.removeEventListener('abort', cancel); }
    sources.push({ id: `${originalId}-page-${page.pageNumber}-section-${index + 1}`, originalId, page: page.pageNumber,
      ...band, kind: 'image', base64: (await prepareReceiptImage(await canvas.encode('png'))).toString('base64') });
    canvas.width = 1; canvas.height = 1;
  }
  return sources;
}

export async function prepareReceiptPdfSources(base64: string, originalId: string, signal: AbortSignal): Promise<ReceiptSource[]> {
  const loading = getDocument({ data: new Uint8Array(Buffer.from(base64, 'base64')),
    maxImageSize: MAX_PIXELS, standardFontDataUrl: `${pdfRoot}/standard_fonts/`, cMapUrl: `${pdfRoot}/cmaps/`,
    cMapPacked: true, wasmUrl: `${pdfRoot}/wasm/` });
  const abort = () => { void loading.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 10) throw new Error('Receipt PDFs must have 10 pages or fewer. Split this PDF and try again.');
    const sources: ReceiptSource[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(number);
      const lines = pageLines((await page.getTextContent()).items);
      // A logo/header alone is not an itemized text receipt. Fall back per page.
      const usable = lines.join(' ').replace(/[^a-z]/gi, '').length >= 80 && lines.filter((line) => /\d/.test(line)).length >= 3;
      if (usable && lines.join('\n').length <= 40_000) {
        sources.push({ id: `${originalId}-page-${number}-text`, originalId, page: number, top: 0, height: 0,
          kind: 'text', lineCount: lines.length, text: lines.map((line, index) => `[Line ${index + 1}] ${line}`).join('\n') });
      } else sources.push(...await renderPage(page, originalId, signal));
      page.cleanup();
      if (sources.length > MAX_RECEIPT_SECTIONS) throw new Error('Receipt is too long. Upload it in smaller parts.');
    }
    return sources;
  } finally { signal.removeEventListener('abort', abort); await loading.destroy(); }
}

export async function prepareReceiptPhotoSources(photos: Array<{ id: string; base64: string }>, signal: AbortSignal): Promise<ReceiptSource[]> {
  const sources: ReceiptSource[] = [];
  for (const photo of photos) {
    signal.throwIfAborted();
    const input = Buffer.from(photo.base64, 'base64');
    const image = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
    const { data, info } = await image.png().toBuffer({ resolveWithObject: true });
    const width = Math.min(1500, info.width);
    const scaled = await sharp(data, { limitInputPixels: MAX_PIXELS }).resize({ width, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    for (const [index, band] of receiptBands(scaled.info.height).entries()) {
      signal.throwIfAborted();
      const crop = await sharp(scaled.data, { limitInputPixels: MAX_PIXELS }).extract({ left: 0, width: scaled.info.width, ...band }).png().toBuffer();
      const bytes = await prepareReceiptImage(crop);
      sources.push({ id: `${photo.id}-section-${index + 1}`, originalId: photo.id, page: 1, ...band, kind: 'image', base64: bytes.toString('base64') });
      if (sources.length > MAX_RECEIPT_SECTIONS) throw new Error('Receipt is too long. Upload it in smaller parts.');
    }
  }
  return sources;
}
