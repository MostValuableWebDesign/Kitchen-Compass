import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzeIngredientPhotos, IngredientSuggestion } from '@workspace/api-client-react';
import { Chip, SectionTitle } from '@/components/KitchenUI';
import { StorageLocation, useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';
import { canCombineIngredientQuantities, hasInvalidMinimumQuantity, hasInvalidMinimumQuantityValue, normalizeIngredientName, parseQuantityText } from '@/lib/kitchenLogic';
import { deleteScanPhotos, saveScanPhoto } from '@/lib/scanPhotos';
import { deleteTemporarySpaceScanFiles, saveSpaceScanModel } from '@/lib/spaceScanFiles';
import { openSpaceModel, startSpaceScan, supportsSpaceScan } from '@/modules/space-scan/src/SpaceScanModule';
import { lookupBarcodeProduct, normalizeFoodBarcode, type BarcodeProduct } from '@/lib/barcodeProducts';

const MAX_SCAN_PHOTOS = 10;
type ScanPhotoAsset = { uri: string; width: number; height: number };

async function prepareScanPhoto(asset: ScanPhotoAsset, index: number) {
  for (const [width, quality] of [[1200, 0.6], [900, 0.45], [700, 0.35]]) {
    const context = ImageManipulator.manipulate(asset.uri);
    if (asset.width > width) context.resize({ width, height: null });
    const rendered = await context.renderAsync();
    const photo = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    if (photo.base64 && photo.base64.length * 0.75 <= 700_000) return photo;
  }
  throw new Error(`Photo ${index + 1} is too large to upload. Remove it and try again.`);
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addIngredient, ingredients, updateIngredient, spaceScans, saveSpaceScan, deleteSpaceScan } = useKitchen();
  const [pendingModelUri, setPendingModelUri] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeCameraEnabled, setBarcodeCameraEnabled] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeMessage, setBarcodeMessage] = useState('');
  const [barcodeProduct, setBarcodeProduct] = useState<BarcodeProduct | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<ScanPhotoAsset[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const scanScrollRef = useRef<ScrollView>(null);
  const photoReviewY = useRef(0);
  const captureGuard = useRef(false);
  const analysisGuard = useRef(false);
  const saveGuard = useRef(false);
  const barcodeGuard = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanDecisions, setScanDecisions] = useState<Record<string, 'same' | 'additional' | 'correction'>>({});
  const [correctionTargets, setCorrectionTargets] = useState<Record<string, string>>({});
  const [recognitionState, setRecognitionState] = useState<'idle' | 'analyzing' | 'ready' | 'unavailable'>('idle');
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<StorageLocation>('Refrigerator');
  const [mode, setMode] = useState<'choose' | 'review'>('choose');
  const [keepPhotos, setKeepPhotos] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisProgressClock, setAnalysisProgressClock] = useState(Date.now());

  useEffect(() => {
    if (recognitionState !== 'analyzing') return;
    const timer = setInterval(() => setAnalysisProgressClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recognitionState]);

  const analysisProgressLimitMs = 120_000;
  const analysisProgressPercent = recognitionState === 'analyzing' && analysisStartedAt
    ? Math.min(95, Math.floor(((analysisProgressClock - analysisStartedAt) / analysisProgressLimitMs) * 95))
    : recognitionState === 'ready' ? 100 : 0;
  const analysisStage = analysisProgressPercent < 25
    ? 'Preparing your photos…'
    : analysisProgressPercent < 85
      ? 'Uploading and recognizing ingredients…'
      : 'Finishing your scan…';

  useEffect(() => () => {
    if (pendingModelUri) deleteTemporarySpaceScanFiles(pendingModelUri, []);
  }, [pendingModelUri]);

  const openSettings = () => { if (Platform.OS !== 'web') Linking.openSettings().catch(() => undefined); };
  const reviewPhotos = async (assets: ScanPhotoAsset[], scanLocation?: StorageLocation) => {
    if (analysisGuard.current || !assets.length || assets.length > MAX_SCAN_PHOTOS) return;
    analysisGuard.current = true;
    setPhotoUris(assets.map((asset) => asset.uri));
    setSuggestions([]);
    setScanId(null);
    setScanDecisions({});
    setCorrectionTargets({});
    setName('');
    setMode('review');
    const startedAt = Date.now();
    setAnalysisProgressClock(startedAt);
    setAnalysisStartedAt(startedAt);
    setRecognitionState('analyzing');
    setRecognitionMessage('');
    try {
      const normalized: Awaited<ReturnType<typeof prepareScanPhoto>>[] = [];
      for (const [index, asset] of assets.entries()) normalized.push(await prepareScanPhoto(asset, index));
      if (normalized.some((photo) => !photo.base64)) throw new Error('An image could not be encoded for recognition.');
      setPhotoUris(normalized.map((photo) => photo.uri));
      const photos = normalized.map((photo, index) => ({
        id: `photo-${index + 1}`,
        mimeType: 'image/jpeg' as const,
        base64: photo.base64 ?? '',
      }));
      const result = await analyzeIngredientPhotos({
        photos,
        existingIngredients: ingredients.map((item) => ({ name: item.name, location: item.location })),
      });
      setScanId(result.scanId);
      const reviewedSuggestions = scanLocation
        ? result.suggestions.map((item) => ({ ...item, storageLocation: scanLocation }))
        : result.suggestions;
      setSuggestions(reviewedSuggestions);
      setScanDecisions(Object.fromEntries(reviewedSuggestions.map((suggestion) => {
        const sameLocation = ingredients.some((item) => item.status !== 'used' && item.location === suggestion.storageLocation
          && normalizeIngredientName(item.name) === suggestion.existingInventoryMatch);
        return [suggestion.suggestionId, sameLocation ? 'same' : 'additional'];
      })));
      setRecognitionState('ready');
      setPendingPhotos([]);
    } catch (error) {
      setRecognitionState('unavailable');
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
      setRecognitionMessage(
        error instanceof Error && error.message.includes('too large to upload')
          ? error.message
          : status === 401
          ? 'Secure scan access could not be established. Try again later or use manual entry below.'
          : status === 413
            ? 'That photo payload is too large. Choose fewer photos or use smaller images.'
            : status === 429
              ? 'Photo recognition is temporarily rate-limited. Try again in a little while.'
              : 'Recognition is unavailable right now. Your existing kitchen was not changed. Manual entry remains available below.',
      );
    } finally {
      analysisGuard.current = false;
    }
  };
  const scanSpace = async () => {
    if (scanBusy || pendingPhotos.length) return;
    if (!supportsSpaceScan()) {
      Alert.alert('3D scan unavailable', 'Use an iPhone 16 Pro with a Kitchen Compass development or store build. Expo Go cannot run the LiDAR module.');
      return;
    }
    let permission;
    try { permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission(); }
    catch { Alert.alert('Camera unavailable', 'Camera access could not be requested.'); return; }
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to scan this space.');
      return;
    }
    setScanBusy(true);
    try {
      const result = await startSpaceScan();
      if (!result) return;
      setPendingModelUri(result.modelUri);
      try { await reviewPhotos(result.photos.slice(0, MAX_SCAN_PHOTOS), location); }
      finally { deleteTemporarySpaceScanFiles(undefined, result.photos.map((photo) => photo.uri)); }
    } catch {
      Alert.alert('3D scan unavailable', 'The space could not be scanned. Try again in better light.');
    } finally { setScanBusy(false); }
  };
  const viewModel = async (uri: string) => {
    try {
      if (!await openSpaceModel(uri)) Alert.alert('Model unavailable', 'This 3D model could not be opened.');
    } catch { Alert.alert('Model unavailable', 'This 3D model could not be opened.'); }
  };
  const openBarcodeCamera = async () => {
    if (barcodeBusy || pendingPhotos.length || scanBusy) return;
    let granted = cameraPermission?.granted === true;
    if (!granted) {
      try { granted = (await requestCameraPermission()).granted; }
      catch { granted = false; }
    }
    setBarcodeCameraEnabled(granted);
    setBarcodeInput('');
    setBarcodeMessage('');
    barcodeGuard.current = false;
    setBarcodeOpen(true);
  };
  const resolveBarcode = async (value: string) => {
    if (barcodeGuard.current) return;
    const code = normalizeFoodBarcode(value);
    if (!code) {
      setBarcodeMessage('Enter an 8, 12, 13, or 14 digit barcode.');
      return;
    }
    barcodeGuard.current = true;
    setBarcodeOpen(false);
    setBarcodeBusy(true);
    setBarcodeMessage('');
    try {
      const product = await lookupBarcodeProduct(code);
      setBarcodeProduct(product);
      setScannedBarcode(code);
      setName(product?.name ?? '');
      setQuantity('1');
      setSuggestions([]);
      setPhotoUris([]);
      setRecognitionState('idle');
      setBarcodeMessage(product ? '' : 'No product name was found for this barcode. Read the package label and enter its name below.');
      setMode('review');
    } catch {
      setBarcodeProduct(null);
      setScannedBarcode(code);
      setName('');
      setQuantity('1');
      setSuggestions([]);
      setPhotoUris([]);
      setRecognitionState('idle');
      setBarcodeMessage('Product lookup is unavailable. Read the package label and enter its name below.');
      setMode('review');
    } finally {
      setBarcodeBusy(false);
      barcodeGuard.current = false;
    }
  };
  const takePhoto = async () => {
    if (pendingPhotos.length >= MAX_SCAN_PHOTOS) {
      Alert.alert('Photo limit reached', `You can analyze up to ${MAX_SCAN_PHOTOS} photos at once.`);
      return;
    }
    let permission;
    try {
      permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    } catch {
      Alert.alert('Camera unavailable', 'Camera access could not be requested. Try again later.');
      return;
    }
    if (!permission.granted) {
      Alert.alert('Camera access needed', permission.canAskAgain ? 'Allow camera access to photograph ingredients.' : 'Camera access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    setCameraReady(false);
    setCameraOpen(true);
  };
  const capturePhoto = async () => {
    if (!cameraReady || captureGuard.current || pendingPhotos.length >= MAX_SCAN_PHOTOS || !cameraRef.current) return;
    captureGuard.current = true;
    setCaptureBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('Camera did not return a photo.');
      setPendingPhotos((current) => current.length >= MAX_SCAN_PHOTOS ? current : [...current, { uri: photo.uri, width: photo.width, height: photo.height }]);
    } catch {
      Alert.alert('Photo could not be taken', 'Try snapping the photo again.');
    } finally {
      captureGuard.current = false;
      setCaptureBusy(false);
    }
  };
  const analyzeCameraSession = () => {
    if (pendingPhotos.length) {
      setCameraOpen(false);
      void reviewPhotos([...pendingPhotos]);
    }
  };
  const closeCameraForReview = () => {
    setCameraOpen(false);
    requestAnimationFrame(() => scanScrollRef.current?.scrollTo({ y: Math.max(0, photoReviewY.current - 16), animated: true }));
  };
  const pickPhoto = async () => {
    if (pendingPhotos.length >= MAX_SCAN_PHOTOS) {
      Alert.alert('Photo limit reached', `You can analyze up to ${MAX_SCAN_PHOTOS} photos at once.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', permission.canAskAgain ? 'Allow photo access to choose a kitchen image.' : 'Photo access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: MAX_SCAN_PHOTOS - pendingPhotos.length, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
    if (!result.canceled && result.assets.length) setPendingPhotos((current) => [...current, ...result.assets].slice(0, MAX_SCAN_PHOTOS));
  };
  const updateSuggestion = (suggestionId: string, changes: Partial<IngredientSuggestion>) => {
    setSuggestions((current) => current.map((item) => item.suggestionId === suggestionId ? { ...item, ...changes } : item));
  };
  const removeSuggestion = (suggestionId: string) => {
    setSuggestions((current) => current.filter((item) => item.suggestionId !== suggestionId));
  };
  const resetScan = () => {
    saveGuard.current = false;
    deleteTemporarySpaceScanFiles(pendingModelUri ?? undefined, []);
    setPendingModelUri(null);
    setMode('choose');
    setCameraOpen(false);
    setCameraReady(false);
    setPhotoUris([]);
    setPendingPhotos([]);
    setSuggestions([]);
    setScanId(null);
    setScanDecisions({});
    setCorrectionTargets({});
    setRecognitionState('idle');
    setAnalysisStartedAt(null);
    setRecognitionMessage('');
    setName('');
    setQuantity('1');
    setKeepPhotos(false);
    setBarcodeOpen(false);
    setBarcodeProduct(null);
    setScannedBarcode(null);
    setBarcodeMessage('');
    setBarcodeInput('');
  };
  const saveIngredient = () => {
    if (saveGuard.current || recognitionState === 'analyzing') return;
    if (!name.trim() && !suggestions.length) {
      Alert.alert('Review an ingredient first', 'Confirm at least one recognized item or add an ingredient manually.');
      return;
    }
    const invalidSuggestion = suggestions.find((suggestion) => suggestion.quantityKnown && hasInvalidMinimumQuantityValue(suggestion.quantity));
    if (invalidSuggestion) {
      Alert.alert('Quantity must be at least 1', `Enter 1 or more for ${invalidSuggestion.displayName}, or clear the quantity if it is unknown.`);
      return;
    }
    if (name.trim() && hasInvalidMinimumQuantity(quantity)) {
      Alert.alert('Quantity must be at least 1', 'Enter 1 or more, or clear the quantity if you do not know the quantity yet.');
      return;
    }
    const unresolvedCorrection = suggestions.find((suggestion) => {
      const decision = scanDecisions[suggestion.suggestionId] ?? (suggestion.existingInventoryMatch ? 'same' : 'additional');
      const matches = ingredients.filter((item) => (item.normalizedName ?? normalizeIngredientName(item.name)) === suggestion.existingInventoryMatch);
      return decision === 'correction' && matches.length > 1 && !correctionTargets[suggestion.suggestionId];
    });
    if (unresolvedCorrection) {
      Alert.alert('Choose the exact row', `Select which ${unresolvedCorrection.displayName} row to correct before saving.`);
      return;
    }
    const reviewedAt = new Date().toISOString();
    const known = new Set(ingredients.filter((item) => item.status !== 'used')
      .map((item) => `${normalizeIngredientName(item.name)}|${item.location}`));
    const acceptedSuggestions = suggestions.filter((suggestion) => {
      const decision = scanDecisions[suggestion.suggestionId] ?? (suggestion.existingInventoryMatch ? 'same' : 'additional');
      if (decision === 'same') return false;
      if (decision === 'correction') return true;
      const key = `${normalizeIngredientName(suggestion.displayName)}|${suggestion.storageLocation}`;
      const explicitlyAdditional = Boolean(suggestion.existingInventoryMatch && decision === 'additional');
      if (known.has(key) && !explicitlyAdditional) return false;
      known.add(key);
      return true;
    });
    for (const suggestion of acceptedSuggestions) {
      const decision = scanDecisions[suggestion.suggestionId] ?? (suggestion.existingInventoryMatch ? 'same' : 'additional');
      if (!suggestion.existingInventoryMatch || decision !== 'additional') continue;
      const existing = ingredients.find((item) => item.status !== 'used'
        && normalizeIngredientName(item.name) === normalizeIngredientName(suggestion.displayName)
        && item.location === suggestion.storageLocation);
      if (!existing) continue;
      const incoming = parseQuantityText(suggestion.quantityKnown && suggestion.quantity !== undefined
        ? `${suggestion.quantity} ${suggestion.unit ?? ''}` : undefined);
      if (!canCombineIngredientQuantities(existing, incoming)) {
        Alert.alert('Quantity needs review', `${suggestion.displayName} is already in your kitchen. To add more stock, enter a quantity with a compatible unit or choose Same item to skip it.`);
        return;
      }
    }
    saveGuard.current = true;
    const retainedPhotos = new Map<string, string>();
    if (keepPhotos) {
      try {
        for (const suggestion of acceptedSuggestions) {
          const sourceUri = photoUris[Number(suggestion.sourcePhotoId.replace('photo-', '')) - 1] ?? photoUris[0];
          if (sourceUri) retainedPhotos.set(suggestion.suggestionId, saveScanPhoto(sourceUri));
        }
      } catch {
        deleteScanPhotos([...retainedPhotos.values()]);
        saveGuard.current = false;
        Alert.alert('Photo could not be kept', 'Nothing was saved. Try again without keeping photos.');
        return;
      }
    }
    let savedModelUri: string | undefined;
    if (pendingModelUri) {
      try { savedModelUri = saveSpaceScanModel(pendingModelUri); }
      catch {
        deleteScanPhotos([...retainedPhotos.values()]);
        saveGuard.current = false;
        Alert.alert('Model could not be saved', 'Nothing was added. Try saving again.');
        return;
      }
    }
    for (const suggestion of acceptedSuggestions) {
      const decision = scanDecisions[suggestion.suggestionId] ?? (suggestion.existingInventoryMatch ? 'same' : 'additional');
      const quantityText = suggestion.quantityKnown && suggestion.quantity !== undefined
        ? `${suggestion.quantity} ${suggestion.unit ?? ''}`.trim()
        : undefined;
      const savedPhotoUri = retainedPhotos.get(suggestion.suggestionId);
      if (decision === 'correction') {
        const matches = ingredients.filter((item) => (item.normalizedName ?? normalizeIngredientName(item.name)) === suggestion.existingInventoryMatch);
        const existing = matches.length === 1
          ? matches[0]
          : matches.find((item) => item.id === correctionTargets[suggestion.suggestionId]);
        if (!existing) continue;
        updateIngredient(existing.id, {
          name: suggestion.displayName.trim(),
          ...(quantityText ? { quantity: quantityText } : {}),
          location: suggestion.storageLocation,
          status: 'fresh',
          confidence: 'confirmed',
          source: 'scan',
          sourceScanId: scanId ?? undefined,
          sourcePhotoId: suggestion.sourcePhotoId,
          ...(savedPhotoUri ? { photoUri: savedPhotoUri } : {}),
          reviewedAt,
        });
        continue;
      }
      addIngredient({
        name: suggestion.displayName.trim(),
        quantity: quantityText,
        location: suggestion.storageLocation,
        status: 'fresh',
        confidence: 'confirmed',
        ...(savedPhotoUri ? { photoUri: savedPhotoUri } : {}),
        source: 'scan',
        sourceScanId: scanId ?? undefined,
        sourcePhotoId: suggestion.sourcePhotoId,
        reviewedAt,
      }, { additionalStock: Boolean(suggestion.existingInventoryMatch && decision === 'additional') });
    }
    const manualKey = `${normalizeIngredientName(name)}|${location}`;
    const barcodeMatch = scannedBarcode ? ingredients.find((item) => item.status !== 'used' && item.location === location && item.barcode === scannedBarcode) : undefined;
    const manualIsNew = Boolean(name.trim()) && !known.has(manualKey) && !barcodeMatch;
    if (manualIsNew) addIngredient({ name: name.trim(), quantity: quantity.trim() || undefined, location, status: 'fresh', confidence: 'confirmed', source: scannedBarcode ? 'barcode' : 'manual', ...(scannedBarcode ? { barcode: scannedBarcode } : {}), ...(barcodeProduct?.brand ? { brand: barcodeProduct.brand } : {}), reviewedAt });
    else if (scannedBarcode && name.trim()) {
      const existing = barcodeMatch ?? ingredients.find((item) => item.status !== 'used' && item.location === location && normalizeIngredientName(item.name) === normalizeIngredientName(name));
      if (existing) updateIngredient(existing.id, { barcode: scannedBarcode, ...(barcodeProduct?.brand ? { brand: barcodeProduct.brand } : {}), reviewedAt });
    }
    if (savedModelUri) {
      saveSpaceScan({ id: `space-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        location, modelUri: savedModelUri, createdAt: reviewedAt,
        ingredientNames: [...new Set([...suggestions.map((item) => item.displayName.trim()), name.trim()].filter(Boolean))] });
    }
    const skipped = suggestions.length - acceptedSuggestions.length + (name.trim() && !manualIsNew ? 1 : 0);
    Alert.alert('Kitchen updated', `${acceptedSuggestions.length + Number(manualIsNew)} reviewed item(s) saved. ${skipped} existing item(s) skipped. Quantities were not inferred when the photo could not support them.`, [{ text: 'Done', onPress: () => { resetScan(); router.push('/kitchen'); } }]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView ref={scanScrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" pointerEvents={barcodeBusy ? 'none' : 'auto'}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>ADD TO YOUR KITCHEN</Text><Text style={[styles.title, { color: colors.foreground }]}>{mode === 'review' ? 'Review scan' : 'Scan ingredients'}</Text></View>{mode === 'review' ? <Pressable onPress={resetScan}><Feather name="x" size={22} color={colors.foreground} /></Pressable> : null}</View>
        {mode === 'choose' ? (
          <>
            <View style={[styles.scanIntro, { backgroundColor: colors.secondary }]}>
              <View style={[styles.scanGlyph, { backgroundColor: colors.primary }]}><Ionicons name="scan-outline" size={28} color={colors.primaryForeground} /></View>
              <Text style={[styles.introTitle, { color: colors.foreground }]}>See it. Confirm it. Cook it.</Text>
              <Text style={[styles.introBody, { color: colors.mutedForeground }]}>Photograph a shelf or an ingredient. You’ll always review names and quantities before anything is saved.</Text>
            </View>
            <SectionTitle title="Choose how to add" />
            <Pressable testID="take-photo" onPress={takePhoto} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.primary }, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: colors.primaryForeground }]}><Ionicons name="camera-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.primaryForeground }]}>Take a photo</Text><Text style={[styles.actionBody, { color: colors.primaryForeground }]}>Use your iPhone camera</Text></View><Feather name="chevron-right" size={18} color={colors.primaryForeground} /></Pressable>
            <Pressable testID="choose-photo" onPress={pickPhoto} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}><Ionicons name="images-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>Choose from photos</Text><Text style={[styles.actionBody, { color: colors.mutedForeground }]}>Use an existing kitchen photo</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
            <Pressable testID="scan-barcode" disabled={barcodeBusy || pendingPhotos.length > 0 || scanBusy} onPress={() => void openBarcodeCamera()} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed, (barcodeBusy || pendingPhotos.length > 0 || scanBusy) && styles.disabled]}><View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}><Ionicons name="barcode-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>Scan food barcode</Text><Text style={[styles.actionBody, { color: colors.mutedForeground }]}>Find the exact packaged product name</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
            {barcodeBusy ? <View style={[styles.stateNote, { backgroundColor: colors.secondary }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.stateText, { color: colors.foreground }]}>Looking up food product…</Text></View> : null}
            <Pressable testID="scan-3d-space" disabled={scanBusy || pendingPhotos.length > 0} onPress={() => void scanSpace()} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed, (scanBusy || pendingPhotos.length > 0) && styles.disabled]}><View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}><Ionicons name="cube-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>Scan 3D space</Text><Text style={[styles.actionBody, { color: colors.mutedForeground }]}>{scanBusy ? 'Preparing ingredient review…' : supportsSpaceScan() ? 'Move around an open shelf · up to 10 views' : 'Requires iPhone 16 Pro and a native app build'}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
            <Text style={[styles.label, { color: colors.foreground }]}>Space to scan</Text>
            <View style={[styles.chips, { marginBottom: 14 }]}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={location === item} onPress={() => setLocation(item)} />)}</View>
            <Pressable testID="manual-entry" disabled={pendingPhotos.length > 0} onPress={() => setMode('review')} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed, pendingPhotos.length > 0 && styles.disabled]}><View style={[styles.actionIcon, { backgroundColor: colors.muted }]}><Feather name="edit-3" size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>Add manually</Text><Text style={[styles.actionBody, { color: colors.mutedForeground }]}>{pendingPhotos.length ? 'Review or remove queued photos first' : 'Enter a confirmed ingredient'}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
             {pendingPhotos.length ? <View onLayout={(event) => { photoReviewY.current = event.nativeEvent.layout.y; }} style={[styles.cameraSession, { backgroundColor: colors.card, borderColor: colors.border }]}>
               <Text style={[styles.cameraSessionTitle, { color: colors.foreground }]}>Review photos · {pendingPhotos.length}/{MAX_SCAN_PHOTOS}</Text>
               <Text style={[styles.cameraSessionBody, { color: colors.mutedForeground }]}>Remove any photo you do not want to upload, or add more before analyzing.</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>{pendingPhotos.map((asset, index) => <View key={`${asset.uri}-${index}`}><Image source={{ uri: asset.uri }} style={styles.sessionThumbnail} /><Pressable accessibilityLabel={`Remove photo ${index + 1}`} onPress={() => setPendingPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} style={[styles.removePhoto, { backgroundColor: colors.destructive }]}><Feather name="x" size={13} color="#fff" /></Pressable></View>)}</ScrollView>
               <View style={styles.sessionActions}>
                 <Pressable onPress={() => void takePhoto()} disabled={pendingPhotos.length >= MAX_SCAN_PHOTOS} style={({ pressed }) => [styles.sessionButton, { backgroundColor: colors.secondary }, pressed && styles.pressed, pendingPhotos.length >= MAX_SCAN_PHOTOS && styles.disabled]}><Text style={[styles.sessionButtonText, { color: colors.primary }]}>Take another</Text></Pressable>
                 <Pressable testID="analyze-photos" onPress={analyzeCameraSession} style={({ pressed }) => [styles.sessionButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.sessionButtonText, { color: colors.primaryForeground }]}>Analyze photos</Text></Pressable>
               </View>
             </View> : null}
             <View style={[styles.barcodeNote, { backgroundColor: colors.muted }]}><Ionicons name="barcode-outline" size={18} color={colors.mutedForeground} /><Text style={[styles.barcodeText, { color: colors.mutedForeground }]}>Barcode names come from Open Food Facts. Check the package label before saving; package size does not tell us how many you own.</Text></View>
              {spaceScans.length ? <><SectionTitle title="Saved 3D spaces" />{spaceScans.slice().reverse().map((scan) => <View key={scan.id} style={[styles.cameraSession, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cameraSessionTitle, { color: colors.foreground }]}>{scan.location} · {new Date(scan.createdAt).toLocaleDateString()}</Text><Text style={[styles.cameraSessionBody, { color: colors.mutedForeground }]}>{scan.ingredientNames.length ? scan.ingredientNames.join(', ') : 'No ingredients confirmed'}</Text><View style={styles.sessionActions}><Pressable onPress={() => void viewModel(scan.modelUri)} style={[styles.sessionButton, { backgroundColor: colors.secondary }]}><Text style={[styles.sessionButtonText, { color: colors.primary }]}>View 3D model</Text></Pressable><Pressable onPress={() => Alert.alert('Delete 3D scan?', 'This removes the saved model. Kitchen ingredients remain.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteSpaceScan(scan.id) }])} style={[styles.sessionButton, { backgroundColor: colors.muted }]}><Text style={[styles.sessionButtonText, { color: colors.destructive }]}>Delete</Text></Pressable></View></View>)}</> : null}
              <View style={[styles.privacyNote, { backgroundColor: colors.muted }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} /><Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Photo recognition sends photos to the Kitchen Compass server and an external AI service. Barcode lookup sends only the barcode to Open Food Facts. Ingredients are added only after review. Photo copies are optional; a saved 3D surface model stays on this device until you delete it.</Text></View>
          </>
        ) : (
          <>
            {photoUris.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>{photoUris.map((uri) => <Image key={uri} source={{ uri }} style={styles.thumbnail} />)}</ScrollView> : <View style={[styles.manualPreview, { backgroundColor: colors.secondary }]}><Feather name="edit-3" size={28} color={colors.primary} /></View>}
            {pendingModelUri ? <Pressable onPress={() => void viewModel(pendingModelUri)} style={[styles.sessionButton, { backgroundColor: colors.secondary, marginBottom: 16 }]}><Text style={[styles.sessionButtonText, { color: colors.primary }]}>View rotatable 3D model</Text></Pressable> : null}
            {scannedBarcode ? <View style={[styles.cameraSession, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cameraSessionTitle, { color: colors.foreground }]}>{barcodeProduct ? 'Found on Open Food Facts' : 'Barcode scanned'}</Text><Text style={[styles.cameraSessionBody, { color: colors.mutedForeground }]}>{barcodeProduct ? `${barcodeProduct.name}${barcodeProduct.packageSize ? ` · Package: ${barcodeProduct.packageSize}` : ''}` : barcodeMessage}</Text><Text style={[styles.cameraSessionBody, { color: colors.mutedForeground }]}>Barcode {scannedBarcode}. Confirm the food name and storage location below. The package size is not an inventory quantity.</Text></View> : null}
            <View style={styles.reviewHeading}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>{photoUris.length ? 'Review recognized items' : 'Add an ingredient'}</Text><Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{photoUris.length ? 'Recognition is a starting point. Edit, remove, or confirm every item before saving.' : 'Only confirmed information is added to your kitchen.'}</Text></View>
            {recognitionState === 'analyzing' ? <View style={[styles.stateNote, { backgroundColor: colors.secondary }]}><Text style={[styles.stateText, { color: colors.foreground }]}>Analyzing {photoUris.length} photo{photoUris.length === 1 ? '' : 's'}…</Text></View> : null}
             {recognitionState === 'unavailable' ? <><View style={[styles.stateNote, { backgroundColor: colors.accent }]}><Ionicons name="cloud-offline-outline" size={18} color={colors.accentForeground} /><Text style={[styles.stateText, { color: colors.accentForeground }]}>{recognitionMessage}</Text></View>{pendingPhotos.length ? <Pressable onPress={() => setMode('choose')} style={[styles.sessionButton, { backgroundColor: colors.secondary, marginBottom: 12 }]}><Text style={[styles.sessionButtonText, { color: colors.primary }]}>Review photos and try again</Text></Pressable> : null}</> : null}
             {suggestions.map((suggestion) => {
               const matchingRows = ingredients.filter((item) => (item.normalizedName ?? normalizeIngredientName(item.name)) === suggestion.existingInventoryMatch);
               const decision = scanDecisions[suggestion.suggestionId] ?? (suggestion.existingInventoryMatch ? 'same' : 'additional');
               const sourcePhotoIndex = Number(suggestion.sourcePhotoId.replace('photo-', '')) - 1;
               const sourcePhotoUri = photoUris[sourcePhotoIndex];
               return <View key={suggestion.suggestionId} style={[styles.suggestionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                 <View style={styles.suggestionHeader}><Text style={[styles.suggestionLabel, { color: colors.mutedForeground }]}>REVIEW SUGGESTION</Text><Pressable accessibilityLabel={`Remove ${suggestion.displayName}`} onPress={() => removeSuggestion(suggestion.suggestionId)}><Feather name="trash-2" size={18} color={colors.destructive} /></Pressable></View>
                 {sourcePhotoUri ? <View style={styles.sourcePhotoRow}><Image source={{ uri: sourcePhotoUri }} style={styles.sourceThumbnail} /><Text style={[styles.sourcePhotoLabel, { color: colors.mutedForeground }]}>From photo {sourcePhotoIndex + 1}</Text></View> : null}
                 <TextInput value={suggestion.displayName} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { displayName: value, normalizedName: value.trim().toLowerCase() })} placeholder="Ingredient name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                 <View style={styles.quantityRow}><TextInput value={suggestion.quantityKnown && suggestion.quantity !== undefined ? String(suggestion.quantity) : ''} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { quantity: value ? Number(value) : undefined, quantityKnown: Boolean(value) && Number.isFinite(Number(value)) })} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.quantityInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /><TextInput value={suggestion.unit ?? ''} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { unit: value, quantityKnown: Boolean(value.trim()) && suggestion.quantity !== undefined })} placeholder="unit (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.unitInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /></View>
                 <View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={suggestion.storageLocation === item} onPress={() => updateSuggestion(suggestion.suggestionId, { storageLocation: item })} />)}</View>
                 <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>{Math.round(suggestion.confidence * 100)}% confidence · {suggestion.quantityKnown ? 'quantity supported by photo' : 'quantity unknown until confirmed'}</Text>
                 {suggestion.existingInventoryMatch ? <View style={[styles.duplicateBox, { backgroundColor: colors.secondary }]}>
                   <Text style={[styles.duplicateTitle, { color: colors.secondaryForeground }]}>Matches existing kitchen stock</Text>
                   {matchingRows.length ? matchingRows.map((item) => <Pressable key={item.id} onPress={() => decision === 'correction' ? setCorrectionTargets((current) => ({ ...current, [suggestion.suggestionId]: item.id })) : undefined} style={[styles.matchRow, { borderColor: colors.border, backgroundColor: correctionTargets[suggestion.suggestionId] === item.id ? colors.primary : colors.background }]}>
                     <Ionicons name={correctionTargets[suggestion.suggestionId] === item.id ? 'radio-button-on' : 'radio-button-off'} size={17} color={correctionTargets[suggestion.suggestionId] === item.id ? colors.primaryForeground : colors.mutedForeground} />
                     <Text style={[styles.matchText, { color: correctionTargets[suggestion.suggestionId] === item.id ? colors.primaryForeground : colors.foreground }]}>{item.name} · {item.location}</Text>
                   </Pressable>) : <Text style={[styles.duplicateBody, { color: colors.secondaryForeground }]}>{suggestion.existingInventoryMatch}</Text>}
                   <View style={styles.chips}><Chip label="Same item" selected={decision === 'same'} onPress={() => setScanDecisions((current) => ({ ...current, [suggestion.suggestionId]: 'same' }))} /><Chip label="Additional stock" selected={decision === 'additional'} onPress={() => setScanDecisions((current) => ({ ...current, [suggestion.suggestionId]: 'additional' }))} /><Chip label="Correct existing" selected={decision === 'correction'} onPress={() => setScanDecisions((current) => ({ ...current, [suggestion.suggestionId]: 'correction' }))} /></View>
                   <Text style={[styles.duplicateBody, { color: colors.secondaryForeground }]}>{decision === 'same' ? 'Default: this photo does not change stock.' : decision === 'additional' ? 'The confirmed quantity will be added as new stock.' : matchingRows.length > 1 ? 'Select the exact row above before saving this correction.' : 'The reviewed name, location, and supported quantity will replace this row.'}</Text>
                 </View> : null}
               </View>;
             })}
            <Text style={[styles.label, { color: colors.foreground }]}>Ingredient name</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="e.g. spinach" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Quantity <Text style={{ fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>(optional)</Text></Text>
            <TextInput value={quantity} onChangeText={setQuantity} placeholder="e.g. 1 bag" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Storage location</Text>
            <View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={location === item} onPress={() => setLocation(item)} />)}</View>
            {scannedBarcode && ingredients.some((item) => item.status !== 'used' && item.location === location && (item.barcode === scannedBarcode || normalizeIngredientName(item.name) === normalizeIngredientName(name))) ? <Text style={[styles.cameraSessionBody, { color: colors.mutedForeground, marginTop: 12 }]}>This food is already in your kitchen at this location. Saving will attach its barcode without adding duplicate stock. Edit the existing item to change its quantity.</Text> : null}
                 {photoUris.length ? <><View style={[styles.uncertainNote, { backgroundColor: colors.accent }]}><Ionicons name="alert-circle-outline" size={18} color={colors.accentForeground} /><Text style={[styles.uncertainText, { color: colors.accentForeground }]}>Unclear quantities remain unknown until you add them. Save is the confirmation step; no item is silently added from an AI guess.</Text></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: keepPhotos }} onPress={() => setKeepPhotos((value) => !value)} style={[styles.keepPhotoToggle, { backgroundColor: colors.muted }]}><Ionicons name={keepPhotos ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.keepPhotoTitle, { color: colors.foreground }]}>Keep scan photo copies in this app</Text><Text style={[styles.keepPhotoBody, { color: colors.mutedForeground }]}>Off by default. Ingredient names and quantities are kept either way.</Text></View></Pressable></> : null}
            <Pressable testID="save-ingredient" disabled={recognitionState === 'analyzing'} onPress={saveIngredient} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed, recognitionState === 'analyzing' && styles.disabled]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save to My Kitchen</Text></Pressable>
          </>
        )}
      </ScrollView>
      <Modal visible={recognitionState === 'analyzing'} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.progressBackdrop}>
          <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.progressTitle, { color: colors.foreground }]}>Analyzing {photoUris.length} photo{photoUris.length === 1 ? '' : 's'}</Text>
            <Text style={[styles.progressPercent, { color: colors.primary }]}>{analysisProgressPercent}%</Text>
            <View testID="photo-analysis-progress" accessibilityRole="progressbar" accessibilityLabel="Estimated photo analysis progress" accessibilityValue={{ min: 0, max: 100, now: analysisProgressPercent }} style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${analysisProgressPercent}%` }]} />
            </View>
            <Text style={[styles.progressNote, { color: colors.mutedForeground }]}>{analysisStage}</Text>
            <Text style={[styles.progressSubnote, { color: colors.mutedForeground }]}>Estimated progress while we prepare and process the image response.</Text>
          </View>
        </View>
      </Modal>
      <Modal visible={barcodeOpen} animationType="slide" onRequestClose={() => setBarcodeOpen(false)}>
        <View style={styles.cameraScreen}>
          {barcodeOpen && barcodeCameraEnabled ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'] }} onBarcodeScanned={(result) => void resolveBarcode(result.data)} onMountError={() => { setBarcodeCameraEnabled(false); Alert.alert('Barcode camera unavailable', 'Enter the barcode digits manually below.'); }} /> : null}
          {barcodeCameraEnabled ? <View pointerEvents="none" style={styles.barcodeGuideArea}>
            <View style={styles.barcodeGuideBox}><View style={styles.barcodeGuideLine} /></View>
            <Text style={styles.barcodeGuideLabel}>Align the full barcode inside the box</Text>
          </View> : null}
          <View style={[styles.cameraTop, { paddingTop: insets.top + 14 }]}><Pressable accessibilityLabel="Close barcode scanner" onPress={() => setBarcodeOpen(false)} style={styles.cameraClose}><Feather name="x" size={22} color="#fff" /></Pressable><Text style={styles.cameraCount}>Food barcode</Text></View>
          <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }]}><Text style={styles.cameraHint}>{barcodeCameraEnabled ? 'Keep the bars sharp and level inside the box.' : 'Camera access is unavailable. Enter the digits printed under the barcode.'}</Text><TextInput value={barcodeInput} onChangeText={setBarcodeInput} keyboardType="number-pad" maxLength={14} placeholder="Or enter barcode digits" placeholderTextColor="#777" style={[styles.input, { backgroundColor: '#fff', color: '#111', marginTop: 15 }]} /><Pressable onPress={() => void resolveBarcode(barcodeInput)} style={[styles.sessionButton, { backgroundColor: '#fff', marginTop: 10 }]}><Text style={[styles.sessionButtonText, { color: '#111' }]}>Look up barcode</Text></Pressable>{barcodeMessage ? <Text style={[styles.cameraHint, { marginTop: 10 }]}>{barcodeMessage}</Text> : null}</View>
        </View>
      </Modal>
      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
        <View style={styles.cameraScreen}>
          {cameraOpen ? <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => { setCameraReady(false); Alert.alert('Camera unavailable', 'Close the camera and try again.'); }} /> : null}
          <View style={[styles.cameraTop, { paddingTop: insets.top + 14 }]}>
            <Pressable accessibilityLabel="Close camera" onPress={() => setCameraOpen(false)} style={styles.cameraClose}><Feather name="x" size={22} color="#fff" /></Pressable>
            <Text style={styles.cameraCount}>{pendingPhotos.length}/{MAX_SCAN_PHOTOS} photos</Text>
          </View>
          <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.cameraHint}>{pendingPhotos.length >= MAX_SCAN_PHOTOS ? 'Photo limit reached. Review your set.' : 'Tap the shutter to add a photo. Keep snapping without a confirmation step.'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraStrip}>{pendingPhotos.map((asset, index) => <Image key={`${asset.uri}-${index}`} source={{ uri: asset.uri }} style={styles.cameraThumbnail} />)}</ScrollView>
            <View style={styles.cameraControls}>
              <View style={styles.cameraControlSide} />
              <Pressable testID="camera-shutter" accessibilityLabel="Take photo" disabled={!cameraReady || captureBusy || pendingPhotos.length >= MAX_SCAN_PHOTOS} onPress={() => void capturePhoto()} style={[styles.shutter, (!cameraReady || captureBusy || pendingPhotos.length >= MAX_SCAN_PHOTOS) && styles.disabled]}><View style={styles.shutterInner} /></Pressable>
              <Pressable testID="camera-review" disabled={!pendingPhotos.length || captureBusy} onPress={closeCameraForReview} style={styles.cameraControlSide}><Text style={[styles.cameraDone, !pendingPhotos.length && styles.disabled]}>Review</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 5 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  scanIntro: { borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 25 },
  scanGlyph: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  introTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  introBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, maxWidth: 290 },
  actionCard: { minHeight: 77, padding: 14, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 11 },
  actionIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  actionBody: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cameraSession: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 4, marginBottom: 12 },
  cameraSessionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  cameraSessionBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  sessionThumbnail: { width: 72, height: 72, borderRadius: 12 },
  removePhoto: { position: 'absolute', top: -6, right: -6, width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sessionButton: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sessionButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  barcodeNote: { flexDirection: 'row', gap: 9, borderRadius: 15, padding: 13, marginTop: 4 },
  barcodeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  privacyNote: { flexDirection: 'row', gap: 9, borderRadius: 15, padding: 14, marginTop: 14 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 16 },
  photoStrip: { gap: 10, marginBottom: 18 },
  thumbnail: { width: 96, height: 96, borderRadius: 16 },
  manualPreview: { width: '100%', height: 130, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  reviewHeading: { marginBottom: 16 },
  reviewTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  reviewBody: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 12, marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  uncertainNote: { flexDirection: 'row', gap: 9, padding: 13, borderRadius: 15, marginTop: 19 },
  uncertainText: { flex: 1, fontSize: 11, lineHeight: 16 },
  keepPhotoToggle: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderRadius: 15, marginTop: 10 },
  keepPhotoTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  keepPhotoBody: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  stateNote: { flexDirection: 'row', gap: 8, padding: 13, borderRadius: 15, marginBottom: 14 },
  stateText: { flex: 1, fontSize: 12, lineHeight: 17 },
  progressBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  progressCard: { width: '100%', maxWidth: 390, borderRadius: 22, padding: 24, alignItems: 'center' },
  progressTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  progressPercent: { fontSize: 34, fontFamily: 'Inter_700Bold', marginTop: 18 },
  progressTrack: { width: '100%', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: '100%', borderRadius: 6 },
  progressNote: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginTop: 14 },
  progressSubnote: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  suggestionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  suggestionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  sourcePhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  sourceThumbnail: { width: 42, height: 42, borderRadius: 9 },
  sourcePhotoLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  quantityRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quantityInput: { flex: 1 },
  unitInput: { flex: 2 },
  confidenceText: { fontSize: 11, marginTop: 10 },
  duplicateBox: { borderRadius: 14, padding: 11, marginTop: 11, gap: 6 },
  duplicateTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  duplicateBody: { fontSize: 11, lineHeight: 16 },
  matchRow: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  matchText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  saveButton: { height: 53, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  saveText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  cameraScreen: { flex: 1, backgroundColor: '#111' },
  barcodeGuideArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  barcodeGuideBox: { width: '82%', maxWidth: 360, height: 140, borderWidth: 3, borderColor: '#fff', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  barcodeGuideLine: { width: '76%', height: 2, backgroundColor: 'rgba(255,255,255,0.8)' },
  barcodeGuideLabel: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 14, textAlign: 'center' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  cameraClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  cameraCount: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 },
  cameraBottom: { marginTop: 'auto', backgroundColor: 'rgba(0,0,0,0.68)', paddingTop: 14 },
  cameraHint: { color: '#fff', textAlign: 'center', fontSize: 12, lineHeight: 17, paddingHorizontal: 20 },
  cameraStrip: { gap: 7, minHeight: 58, paddingHorizontal: 20, paddingVertical: 9 },
  cameraThumbnail: { width: 46, height: 46, borderRadius: 8 },
  cameraControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 22, marginTop: 8 },
  cameraControlSide: { width: 86, minHeight: 58, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  cameraDone: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
});
