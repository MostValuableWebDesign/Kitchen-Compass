export type BarcodeProduct = {
  barcode: string;
  name: string;
  brand?: string;
  packageSize?: string;
};

const cache = new Map<string, { product: BarcodeProduct | null; expiresAt: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'KitchenCompass/1.0 (https://github.com/MostValuableWebDesign/Kitchen-Compass)';

export function normalizeFoodBarcode(value: string) {
  const code = value.trim();
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) ? code : null;
}

function cleanField(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

export function parseBarcodeProduct(barcode: string, payload: unknown): BarcodeProduct | null {
  if (!payload || typeof payload !== 'object') return null;
  const response = payload as { status?: unknown; product?: unknown };
  if (response.status !== 1 || !response.product || typeof response.product !== 'object') return null;
  const product = response.product as Record<string, unknown>;
  const name = cleanField(product.product_name_en, 120) || cleanField(product.product_name, 120);
  if (!name) return null;
  const brand = cleanField(product.brands, 80).split(',')[0]?.trim() ?? '';
  const packageSize = cleanField(product.quantity, 50);
  const displayName = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}`.slice(0, 160) : name;
  return { barcode, name: displayName, ...(brand ? { brand } : {}), ...(packageSize ? { packageSize } : {}) };
}

export async function lookupBarcodeProduct(value: string, fetcher: typeof fetch = fetch): Promise<BarcodeProduct | null> {
  const barcode = normalizeFoodBarcode(value);
  if (!barcode) throw new Error('Enter an 8, 12, 13, or 14 digit food barcode.');
  const cached = cache.get(barcode);
  if (cached && cached.expiresAt > Date.now()) return cached.product;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_en,brands,quantity`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Product lookup is unavailable. Try again or enter the food name manually.');
    const payload = await response.json() as unknown;
    const product = parseBarcodeProduct(barcode, payload);
    cache.set(barcode, { product, expiresAt: Date.now() + CACHE_MS });
    return product;
  } finally {
    clearTimeout(timeout);
  }
}
