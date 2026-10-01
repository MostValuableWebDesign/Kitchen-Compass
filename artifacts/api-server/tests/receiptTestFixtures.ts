import { createCanvas } from '@napi-rs/canvas';

function pdf(objects: Array<string | Buffer>) {
  const pieces: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  for (const [index, value] of objects.entries()) {
    offsets.push(pieces.reduce((sum, piece) => sum + piece.length, 0));
    pieces.push(Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(value) ? value : Buffer.from(value), Buffer.from('\nendobj\n'));
  }
  const xref = pieces.reduce((sum, piece) => sum + piece.length, 0);
  pieces.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(pieces);
}
export function textReceiptPdf() {
  const content = 'BT /F1 12 Tf 20 750 Td (Grocery store receipt) Tj ' +
    ['Chicken breast 1 ea $5.00', 'Yellow onion 2 ea $1.00', 'Milk 1 ea $3.00', 'Butter 1 ea $4.00', 'Eggs 12 ea $6.00', 'Carrots 2 ea $2.00', 'Tomatoes 2 ea $3.00', 'Subtotal $24.00', 'Tax $1.00', 'Total $25.00'].map((line) => `0 -20 Td (${line}) Tj`).join(' ') + ' ET';
  return pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
}
export function receiptPhoto(height = 500) {
  const canvas = createCanvas(400, height), context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 400, height);
  context.fillStyle = '#000000'; context.font = '20px sans-serif';
  for (let y = 80; y < height; y += 180) context.fillText('Chicken breast 1 ea $5.00', 20, y);
  return canvas.toBuffer('image/jpeg');
}
export function scannedReceiptPdf(height = 5000) {
  const bytes = receiptPhoto(height), content = `q 400 0 0 ${height} 0 0 cm /Im1 Do Q`;
  return pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 ${height}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 400 /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]),
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
}
