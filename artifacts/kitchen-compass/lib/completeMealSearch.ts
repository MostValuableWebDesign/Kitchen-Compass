export async function onlineFirstMealSearch<T>(
  searchOnline: () => Promise<T | undefined>,
  createWithAi: () => Promise<void>,
  cancelled: () => boolean,
): Promise<T | undefined> {
  let onlineRecipe: T | undefined;
  try {
    onlineRecipe = await searchOnline();
  } catch {
    // Provider failure is a reason to try the AI backup.
  }
  if (cancelled()) return undefined;
  if (onlineRecipe) return onlineRecipe;
  await createWithAi();
  return undefined;
}
