import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_TOKEN_WINDOW = 5;
const MAX_REQUESTS_PER_IP_WINDOW = 10;
const ACCESS_ISSUE_WINDOW_MS = 5 * 60_000;
const MAX_ACCESS_TOKENS_PER_IP_WINDOW = 3;
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

type PersistentPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

let persistentPoolPromise: Promise<PersistentPool | null> | null = null;

export const scanLimits = {
  maxPhotoBytes: 5 * 1024 * 1024,
  maxTotalPhotoBytes: 10 * 1024 * 1024,
  maxBodyBytes: 12 * 1024 * 1024,
  requestTimeoutMs: 20_000,
};

export type ScanErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SCAN_UNAVAILABLE";

export function sendScanError(
  req: Request,
  res: Response,
  status: 400 | 401 | 413 | 429 | 503,
  code: ScanErrorCode,
  message: string,
  retryAfterSeconds?: number,
) {
  const requestId = String(req.id ?? "unknown");
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(status).json({
    error: { code, message, requestId, retryable: status === 429 || status === 503 },
  });
}

function getSecret() {
  return process.env.SESSION_SECRET?.trim() || null;
}

function requestIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function signAccessPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createScanAccessToken(now = Date.now()) {
  const secret = getSecret();
  if (!secret) throw new Error("SESSION_SECRET is required for scan access.");
  const tokenId = randomBytes(24).toString("base64url");
  const expiresAt = now + ACCESS_TOKEN_TTL_MS;
  const payload = `${tokenId}.${now}.${expiresAt}`;
  return `${payload}.${signAccessPayload(payload, secret)}`;
}

function verifyScanAccessToken(token: string, now = Date.now()) {
  const secret = getSecret();
  const parts = token.split(".");
  if (!secret || parts.length !== 4 || !parts[0] || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) return null;
  const payload = parts.slice(0, 3).join(".");
  const expected = signAccessPayload(payload, secret);
  const provided = parts[3];
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  const issuedAt = Number(parts[1]);
  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= now || issuedAt > now + 60_000) return null;
  return { tokenId: parts[0], expiresAt };
}

async function getPersistentPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!persistentPoolPromise) {
    persistentPoolPromise = import("@workspace/db")
      .then(async ({ pool }) => {
        const persistentPool = pool as unknown as PersistentPool;
        await persistentPool.query(`
          CREATE TABLE IF NOT EXISTS kitchen_scan_quota (
            bucket_key TEXT PRIMARY KEY,
            window_started_at TIMESTAMPTZ NOT NULL,
            request_count INTEGER NOT NULL
          )
        `);
        return persistentPool;
      })
      .catch(() => null);
  }
  return persistentPoolPromise;
}

async function consumeQuota(key: string, limit: number, windowMs: number) {
  const persistentPool = await getPersistentPool();
  if (persistentPool) {
    try {
      const result = await persistentPool.query(`
        INSERT INTO kitchen_scan_quota (bucket_key, window_started_at, request_count)
        VALUES ($1, NOW(), 1)
        ON CONFLICT (bucket_key) DO UPDATE SET
          window_started_at = CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - kitchen_scan_quota.window_started_at)) * 1000 >= $3 THEN NOW()
            ELSE kitchen_scan_quota.window_started_at
          END,
          request_count = CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - kitchen_scan_quota.window_started_at)) * 1000 >= $3 THEN 1
            ELSE kitchen_scan_quota.request_count + 1
          END
        RETURNING request_count
      `, [key, limit, windowMs]);
      return Number(result.rows[0]?.request_count ?? limit + 1) <= limit;
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
    }
  }

  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  const bucket = !current || now - current.startedAt >= windowMs
    ? { startedAt: now, count: 1 }
    : { ...current, count: current.count + 1 };
  rateLimitBuckets.set(key, bucket);
  return bucket.count <= limit;
}

export async function issueScanAccess(req: Request, res: Response) {
  try {
    if (!(await consumeQuota(`issue:${requestIp(req)}`, MAX_ACCESS_TOKENS_PER_IP_WINDOW, ACCESS_ISSUE_WINDOW_MS))) {
      sendScanError(req, res, 429, "RATE_LIMITED", "Too many scan access requests. Try again shortly.", 60);
      return;
    }
    res.json({ accessToken: createScanAccessToken(), expiresInSeconds: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) });
  } catch {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Scan access is temporarily unavailable. Try again later.");
  }
}

export async function scanAccess(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization")?.trim();
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const access = token ? verifyScanAccessToken(token) : null;
  if (!access) {
    sendScanError(req, res, 401, "UNAUTHORIZED", "A valid Kitchen Compass scan credential is required.");
    return;
  }

  try {
    const tokenAllowed = await consumeQuota(`token:${access.tokenId}`, MAX_REQUESTS_PER_TOKEN_WINDOW, WINDOW_MS);
    const ipAllowed = await consumeQuota(`ip:${requestIp(req)}`, MAX_REQUESTS_PER_IP_WINDOW, WINDOW_MS);
    if (!tokenAllowed || !ipAllowed) {
      sendScanError(req, res, 429, "RATE_LIMITED", "Too many scan requests. Try again shortly.", 30);
      return;
    }
    next();
  } catch {
    sendScanError(req, res, 503, "SCAN_UNAVAILABLE", "Scan access is temporarily unavailable. Try again later.");
  }
}

export function resetScanRateLimiter() {
  rateLimitBuckets.clear();
}

export function decodedBase64Bytes(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) return null;
  const decoded = Buffer.from(value, "base64");
  const normalized = value.replace(/=+$/, "");
  const reencoded = decoded.toString("base64").replace(/=+$/, "");
  return reencoded === normalized ? decoded.byteLength : null;
}
