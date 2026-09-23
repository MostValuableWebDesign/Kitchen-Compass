import { requireOptionalNativeModule } from 'expo';

export type SpaceScanPhoto = { uri: string; width: number; height: number };
export type SpaceScanResult = { modelUri: string; photos: SpaceScanPhoto[] };

type NativeSpaceScan = {
  isSupported(): boolean;
  startScan(): Promise<SpaceScanResult | null>;
  openModel(uri: string): Promise<boolean>;
};

const native = requireOptionalNativeModule<NativeSpaceScan>('SpaceScan');

export function supportsSpaceScan() {
  return native?.isSupported() === true;
}

export async function startSpaceScan() {
  if (!supportsSpaceScan()) return null;
  return native!.startScan();
}

export async function openSpaceModel(uri: string) {
  return native ? native.openModel(uri) : false;
}
