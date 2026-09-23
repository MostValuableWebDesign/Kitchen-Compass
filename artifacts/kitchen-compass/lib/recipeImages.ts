import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export function saveGeneratedRecipeImage(recipeVersion: string, base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid recipe image data');
  if (Platform.OS === 'web') return `data:image/jpeg;base64,${base64}`;
  const safeVersion = recipeVersion.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!safeVersion) throw new Error('Invalid recipe version');
  const file = new File(Paths.document, `kitchen-compass-recipe-${safeVersion}.jpg`);
  if (!file.exists) file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}
