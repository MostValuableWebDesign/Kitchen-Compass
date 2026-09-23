import { File, Paths } from 'expo-file-system';

const modelPrefix = 'kitchen-compass-space-';
const tempPhotoPrefix = 'kitchen-compass-space-view-';

export function saveSpaceScanModel(sourceUri: string) {
  const destination = new File(Paths.document, `${modelPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.obj`);
  new File(sourceUri).copy(destination);
  return destination.uri;
}

export function deleteSpaceScanModel(uri: string | undefined) {
  if (!uri) return;
  const prefix = `${Paths.document.uri.replace(/\/$/, '')}/${modelPrefix}`;
  if (!uri.startsWith(prefix) || !uri.endsWith('.obj')) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function deleteTemporarySpaceScanFiles(modelUri: string | undefined, photoUris: string[]) {
  const cachePrefix = `${Paths.cache.uri.replace(/\/$/, '')}/`;
  for (const uri of [modelUri, ...photoUris]) {
    if (!uri?.startsWith('file://')) continue;
    const name = uri.split('/').pop() ?? '';
    const inTemporaryDirectory = uri.includes('/tmp/') || uri.startsWith(cachePrefix);
    if (!inTemporaryDirectory ||
        !(name.startsWith(modelPrefix) && name.endsWith('.obj') || name.startsWith(tempPhotoPrefix) && name.endsWith('.jpg'))) continue;
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
