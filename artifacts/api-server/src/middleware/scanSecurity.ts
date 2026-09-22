import type { NextFunction, Request, Response } from "express";

const installationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

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

export function getInstallationId(req: Request) {
  const value = req.header("x-kitchen-installation")?.trim();
  return value && installationPattern.test(value) ? value : null;
}

export function scanAccess(req: Request, res: Response, next: NextFunction) {
  const installationId = getInstallationId(req);
  if (!installationId) {
    sendScanError(req, res, 401, "UNAUTHORIZED", "A valid Kitchen Compass installation is required.");
    return;
  }

  const now = Date.now();
  const current = rateLimitBuckets.get(installationId);
  const bucket = !current || now - current.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 1 }
    : { ...current, count: current.count + 1 };
  rateLimitBuckets.set(installationId, bucket);

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    sendScanError(req, res, 429, "RATE_LIMITED", "Too many scan requests. Try again shortly.", 30);
    return;
  }

  next();
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