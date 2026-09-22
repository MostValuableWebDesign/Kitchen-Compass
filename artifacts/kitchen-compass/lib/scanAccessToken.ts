export type ScanAccessTokenStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

export const SCAN_ACCESS_TOKEN_STORAGE_KEY = 'kitchen-compass-scan-access-token-v1';

type ScanAccessTokenOptions = {
  storage: ScanAccessTokenStorage;
  storageKey: string;
  domain?: string;
  fetcher?: typeof fetch;
  now?: () => number;
};

function tokenExpiry(token: string | null) {
  const expiry = token ? Number(token.split('.')[2]) : 0;
  return Number.isFinite(expiry) ? expiry : 0;
}

export function createScanAccessTokenGetter({
  storage,
  storageKey,
  domain,
  fetcher = fetch,
  now = Date.now,
}: ScanAccessTokenOptions) {
  let accessTokenPromise: Promise<string | null> | null = null;

  async function acquireToken() {
    const stored = await storage.getItem(storageKey);
    if (stored && tokenExpiry(stored) > now() + 60_000) return stored;
    if (stored) await storage.removeItem(storageKey);
    if (!domain) return null;

    try {
      const response = await fetcher(`https://${domain}/api/scan/access`, { method: 'POST' });
      if (!response.ok) return null;
      const payload = await response.json() as { accessToken?: string };
      if (!payload.accessToken || tokenExpiry(payload.accessToken) <= now()) return null;
      await storage.setItem(storageKey, payload.accessToken);
      return payload.accessToken;
    } catch {
      return null;
    }
  }

  return () => {
    if (accessTokenPromise) return accessTokenPromise;
    const request = acquireToken().catch(() => null);
    const promise = request.finally(() => {
      if (accessTokenPromise === promise) accessTokenPromise = null;
    });
    accessTokenPromise = promise;
    return promise;
  };
}