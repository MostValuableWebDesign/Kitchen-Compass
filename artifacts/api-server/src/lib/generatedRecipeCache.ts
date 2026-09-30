import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = () => resolve(process.env.GENERATED_RECIPE_CACHE_DIR?.trim() || ".local/generated-recipes");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const folder = (version: string) => join(root(), hash(version));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}
export const recipeCacheContext = (value: unknown) => hash(JSON.stringify(canonical(value)));
async function atomicFile(path: string, value: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, path);
}
export async function cachedRecipeCandidates(context: string): Promise<unknown[]> {
  try {
    const entries = await readdir(root(), { withFileTypes: true });
    const candidates: unknown[] = [];
    for (const entry of entries.filter((item) => item.isDirectory() && /^[a-f0-9]{64}$/.test(item.name))) {
      try {
        const stored = JSON.parse(await readFile(join(root(), entry.name, "recipe.json"), "utf8"));
        if (stored.schemaVersion === 1 && Array.isArray(stored.contexts) && stored.contexts.includes(context)) candidates.push(stored.recipe);
      } catch { /* Incomplete or corrupt entries are cache misses. */ }
    }
    return candidates;
  } catch { return []; }
}
export async function saveGeneratedRecipe(version: string, context: string, recipe: unknown) {
  try {
    const directory = folder(version); await mkdir(directory, { recursive: true });
    let contexts: string[] = [];
    try { const previous = JSON.parse(await readFile(join(directory, "recipe.json"), "utf8")); contexts = Array.isArray(previous.contexts) ? previous.contexts.filter((item: unknown) => typeof item === "string") : []; } catch { /* New recipe. */ }
    await atomicFile(join(directory, "recipe.json"), JSON.stringify({ schemaVersion: 1, recipeVersion: version, contexts: [...new Set([...contexts, context])], recipe }, null, 2));
    return true;
  } catch { return false; }
}
export type CachedImageRequest = { recipeVersion: string; title: string; description: string; ingredients: string[] };
const imageKey = (recipe: CachedImageRequest) => recipeCacheContext({ title: recipe.title, description: recipe.description, ingredients: recipe.ingredients });
export async function cachedGeneratedImage(recipe: CachedImageRequest): Promise<string | undefined> {
  try {
    const bytes = await readFile(join(folder(recipe.recipeVersion), `image-${imageKey(recipe)}.jpg`));
    return bytes.length > 0 && bytes.length <= 2_000_000 ? bytes.toString("base64") : undefined;
  } catch { return undefined; }
}
export async function saveGeneratedImage(recipe: CachedImageRequest, base64: string) {
  try {
    const directory = folder(recipe.recipeVersion); await mkdir(directory, { recursive: true });
    await atomicFile(join(directory, `image-${imageKey(recipe)}.jpg`), Buffer.from(base64, "base64"));
    return true;
  } catch { return false; }
}
const locks = new Map<string, Promise<unknown>>();
export async function withGeneratedRecipeLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const lockKey = `${root()}:${key}`;
  const previous = locks.get(lockKey);
  let release!: () => void;
  const pending = new Promise<void>((done) => { release = done; });
  locks.set(lockKey, pending);
  await previous;
  try { return await action(); }
  finally { release(); if (locks.get(lockKey) === pending) locks.delete(lockKey); }
}
