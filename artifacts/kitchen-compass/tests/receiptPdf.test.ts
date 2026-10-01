import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECEIPT_PDF_BYTES, prepareReceiptPdf, validateReceiptPdfFile } from '../lib/receiptPdf';

const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
test('PDF picker accepts PDF files and rejects other file types or oversized files before reading', () => {
  validateReceiptPdfFile({ name: 'Receipt.PDF', size: MAX_RECEIPT_PDF_BYTES, mimeType: 'application/pdf' });
  validateReceiptPdfFile({ name: 'receipt.pdf', mimeType: 'application/octet-stream' });
  assert.throws(() => validateReceiptPdfFile({ name: 'receipt.jpg', mimeType: 'image/jpeg' }), /Choose a PDF/);
  assert.throws(() => validateReceiptPdfFile({ name: 'receipt.pdf', mimeType: 'text/plain' }), /Choose a PDF/);
  assert.throws(() => validateReceiptPdfFile({ name: 'receipt.pdf', size: MAX_RECEIPT_PDF_BYTES + 1 }), /5 MB/);
});

test('PDF uploads normalize browser data URLs and validate bytes even if picker metadata is missing', () => {
  assert.deepEqual(prepareReceiptPdf('receipt.pdf', pdf), { name: 'receipt.pdf', base64: pdf });
  assert.deepEqual(prepareReceiptPdf('receipt.pdf', `data:application/pdf;base64,${pdf}`), { name: 'receipt.pdf', base64: pdf });
  assert.throws(() => prepareReceiptPdf('receipt.pdf', Buffer.from('not a PDF').toString('base64')), /could not be read/);
  assert.throws(() => prepareReceiptPdf('receipt.pdf', 'JVBERi0!'), /could not be read/);
  const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_RECEIPT_PDF_BYTES)]).toString('base64');
  assert.throws(() => prepareReceiptPdf('receipt.pdf', oversized), /5 MB/);
});
