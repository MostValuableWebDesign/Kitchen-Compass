import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupBarcodeProduct, normalizeFoodBarcode, parseBarcodeProduct } from '../lib/barcodeProducts';

test('food barcodes accept common retail lengths without changing digits', () => {
  assert.equal(normalizeFoodBarcode(' 012345678905 '), '012345678905');
  assert.equal(normalizeFoodBarcode('1234567'), null);
  assert.equal(normalizeFoodBarcode('https://example.com'), null);
});

test('lookup uses the exact barcode and keeps brand and package size separate from inventory quantity', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls += 1;
    assert.match(String(input), /\/3017620422003\.json\?fields=/);
    assert.match(new Headers(options?.headers).get('User-Agent') ?? '', /KitchenCompass/);
    return new Response(JSON.stringify({ status: 1, product: { product_name: 'Hazelnut spread', brands: 'Nutella', quantity: '400 g' } }), { status: 200 });
  };
  const product = await lookupBarcodeProduct('3017620422003', fetcher);
  assert.deepEqual(product, { barcode: '3017620422003', name: 'Nutella Hazelnut spread', brand: 'Nutella', packageSize: '400 g' });
  assert.deepEqual(await lookupBarcodeProduct('3017620422003', fetcher), product);
  assert.equal(calls, 1);
});

test('unknown and incomplete product records never invent a food name', () => {
  assert.equal(parseBarcodeProduct('12345678', { status: 0 }), null);
  assert.equal(parseBarcodeProduct('12345678', { status: 1, product: { brands: 'Brand only' } }), null);
  assert.equal(parseBarcodeProduct('12345678', { status: 1, product: { product_name: 'Oats' } })?.name, 'Oats');
});
