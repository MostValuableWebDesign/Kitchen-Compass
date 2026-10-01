export function getScanApiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const data = (error as Error & { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;

  const detail = (data as { error?: unknown }).error;
  if (!detail || typeof detail !== "object") return undefined;

  const message = (detail as { message?: unknown }).message;
  if (typeof message !== "string") return undefined;

  const trimmed = message.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}…` : trimmed;
}