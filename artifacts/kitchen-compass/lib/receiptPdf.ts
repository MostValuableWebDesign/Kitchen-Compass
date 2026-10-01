export const MAX_RECEIPT_PDF_BYTES = 5 * 1024 * 1024;
export type ReceiptPdf = { name: string; base64: string };

export function validateReceiptPdfFile(file: { name: string; size?: number; mimeType?: string }) {
  if (!/\.pdf$/i.test(file.name) || (file.mimeType && file.mimeType !== 'application/pdf' && file.mimeType !== 'application/octet-stream')) {
    throw new Error('Choose a PDF receipt from Files.');
  }
  if (file.size !== undefined && file.size > MAX_RECEIPT_PDF_BYTES) throw new Error('Receipt PDFs must be 5 MB or smaller.');
}

export function prepareReceiptPdf(name: string, encoded: string): ReceiptPdf {
  const base64 = encoded.replace(/^data:application\/pdf;base64,/i, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0 || !base64.startsWith('JVBERi0')) {
    throw new Error('This file could not be read as a PDF. Try downloading it to Files again.');
  }
  const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_RECEIPT_PDF_BYTES) throw new Error('Receipt PDFs must be 5 MB or smaller.');
  return { name, base64 };
}
