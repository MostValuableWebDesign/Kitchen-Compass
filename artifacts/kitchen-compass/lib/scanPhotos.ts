import { File, Paths } from 'expo-file-system';

const photoPrefix = 'kitchen-compass-scan-';

export function saveScanPhoto(sourceUri: string) {
  const name = `${photoPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const destination = new File(Paths.document, name);
  new File(sourceUri).copy(destination);
  return destination.uri;
}

export function deleteScanPhoto(uri: string | undefined) {
  if (!uri) return;
  const documentUri = Paths.document.uri.replace(/\/$/, '');
  if (!uri.startsWith(`${documentUri}/${photoPrefix}`)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function deleteScanPhotos(uris: Array<string | undefined>) {
  [...new Set(uris)].forEach(deleteScanPhoto);
}
