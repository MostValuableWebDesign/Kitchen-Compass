import type { StorageLocation } from '@/context/KitchenContext';

export type SavedSpaceScan = {
  id: string;
  location: StorageLocation;
  modelUri: string;
  createdAt: string;
  ingredientNames: string[];
};

const modelPrefix = 'kitchen-compass-space-';

export function parseSavedSpaceScans(value: unknown): SavedSpaceScan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SavedSpaceScan[] => {
    if (!item || typeof item !== 'object') return [];
    const scan = item as Partial<SavedSpaceScan>;
    if (typeof scan.id !== 'string' || typeof scan.modelUri !== 'string' ||
        typeof scan.createdAt !== 'string' || !Array.isArray(scan.ingredientNames) ||
        !['Refrigerator', 'Freezer', 'Pantry'].includes(scan.location ?? '')) return [];
    if (!scan.modelUri.startsWith('file://') || !scan.modelUri.split('/').pop()?.startsWith(modelPrefix) || !scan.modelUri.endsWith('.obj')) return [];
    return [{ id: scan.id, location: scan.location!, modelUri: scan.modelUri,
      createdAt: scan.createdAt, ingredientNames: scan.ingredientNames.filter((name): name is string => typeof name === 'string') }];
  }).slice(-20);
}
