import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzeIngredientPhotos, IngredientSuggestion } from '@workspace/api-client-react';
import { Chip, SectionTitle } from '@/components/KitchenUI';
import { StorageLocation, useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addIngredient, ingredients } = useKitchen();
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const [recognitionState, setRecognitionState] = useState<'idle' | 'analyzing' | 'ready' | 'unavailable'>('idle');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<StorageLocation>('Refrigerator');
  const [mode, setMode] = useState<'choose' | 'review'>('choose');

  const openSettings = () => { if (Platform.OS !== 'web') Linking.openSettings().catch(() => undefined); };
  const reviewPhotos = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotoUris(assets.map((asset) => asset.uri));
    setSuggestions([]);
    setName('');
    setMode('review');
    setRecognitionState('analyzing');
    try {
      const photos = await Promise.all(assets.map(async (asset, index) => ({
        id: `photo-${index + 1}`,
        mimeType: (asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
        base64: await new File(asset.uri).base64(),
      })));
      const result = await analyzeIngredientPhotos({
        photos,
        existingIngredients: ingredients.map((item) => ({ name: item.name, location: item.location })),
      });
      setSuggestions(result.suggestions);
      setRecognitionState('ready');
    } catch {
      setRecognitionState('unavailable');
    }
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', permission.canAskAgain ? 'Allow camera access to photograph ingredients.' : 'Camera access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]?.uri) void reviewPhotos(result.assets);
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', permission.canAskAgain ? 'Allow photo access to choose a kitchen image.' : 'Photo access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: 8 });
    if (!result.canceled && result.assets.length) void reviewPhotos(result.assets);
  };
  const updateSuggestion = (suggestionId: string, changes: Partial<IngredientSuggestion>) => {
    setSuggestions((current) => current.map((item) => item.suggestionId === suggestionId ? { ...item, ...changes } : item));
  };
  const removeSuggestion = (suggestionId: string) => {
    setSuggestions((current) => current.filter((item) => item.suggestionId !== suggestionId));
  };
  const resetScan = () => {
    setMode('choose');
    setPhotoUris([]);
    setSuggestions([]);
    setRecognitionState('idle');
    setName('');
    setQuantity('');
  };
  const saveIngredient = () => {
    if (!name.trim() && !suggestions.length) {
      Alert.alert('Review an ingredient first', 'Confirm at least one recognized item or add an ingredient manually.');
      return;
    }
    suggestions.forEach((suggestion) => addIngredient({
      name: suggestion.displayName.trim(),
      quantity: suggestion.quantityKnown && suggestion.quantity !== undefined ? `${suggestion.quantity} ${suggestion.unit ?? ''}`.trim() : undefined,
      location: suggestion.storageLocation,
      status: 'fresh',
      confidence: 'confirmed',
      photoUri: photoUris[0],
    }));
    if (name.trim()) addIngredient({ name: name.trim(), quantity: quantity.trim() || undefined, location, status: 'fresh', confidence: 'confirmed' });
    Alert.alert('Added to My Kitchen', 'Every saved suggestion was reviewed on this screen. Quantities were not inferred when the photo could not support them.', [{ text: 'Done', onPress: () => { resetScan(); router.push('/kitchen'); } }]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Pressable testID="manual-entry" onPress={() => setMode('review')} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: colors.muted }]}><Feather name="edit-3" size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>Add manually</Text><Text style={[styles.actionBody, { color: colors.mutedForeground }]}>Enter a confirmed ingredient</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
             <View style={[styles.privacyNote, { backgroundColor: colors.muted }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} /><Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Photos are sent securely to the server for recognition. Nothing is saved to your kitchen until you review, edit, remove, and confirm each suggestion.</Text></View>
          </>
        ) : (
          <>
            {photoUris.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>{photoUris.map((uri) => <Image key={uri} source={{ uri }} style={styles.thumbnail} />)}</ScrollView> : <View style={[styles.manualPreview, { backgroundColor: colors.secondary }]}><Feather name="edit-3" size={28} color={colors.primary} /></View>}
            <View style={styles.reviewHeading}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>{photoUris.length ? 'Review recognized items' : 'Add an ingredient'}</Text><Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{photoUris.length ? 'Recognition is a starting point. Edit, remove, or confirm every item before saving.' : 'Only confirmed information is added to your kitchen.'}</Text></View>
            {recognitionState === 'analyzing' ? <View style={[styles.stateNote, { backgroundColor: colors.secondary }]}><Text style={[styles.stateText, { color: colors.foreground }]}>Analyzing {photoUris.length} photo{photoUris.length === 1 ? '' : 's'}…</Text></View> : null}
            {recognitionState === 'unavailable' ? <View style={[styles.stateNote, { backgroundColor: colors.accent }]}><Ionicons name="cloud-offline-outline" size={18} color={colors.accentForeground} /><Text style={[styles.stateText, { color: colors.accentForeground }]}>Recognition is unavailable right now. Your existing kitchen was not changed. Manual entry remains available below.</Text></View> : null}
            {suggestions.map((suggestion) => <View key={suggestion.suggestionId} style={[styles.suggestionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.suggestionHeader}><Text style={[styles.suggestionLabel, { color: colors.mutedForeground }]}>REVIEW SUGGESTION</Text><Pressable accessibilityLabel={`Remove ${suggestion.displayName}`} onPress={() => removeSuggestion(suggestion.suggestionId)}><Feather name="trash-2" size={18} color={colors.destructive} /></Pressable></View>
              <TextInput value={suggestion.displayName} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { displayName: value, normalizedName: value.trim().toLowerCase() })} placeholder="Ingredient name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
              <View style={styles.quantityRow}><TextInput value={suggestion.quantityKnown && suggestion.quantity !== undefined ? String(suggestion.quantity) : ''} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { quantity: value ? Number(value) : undefined, quantityKnown: Boolean(value) && Number.isFinite(Number(value)) })} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.quantityInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /><TextInput value={suggestion.unit ?? ''} onChangeText={(value) => updateSuggestion(suggestion.suggestionId, { unit: value, quantityKnown: Boolean(value.trim()) && suggestion.quantity !== undefined })} placeholder="unit (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.unitInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /></View>
              <View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={suggestion.storageLocation === item} onPress={() => updateSuggestion(suggestion.suggestionId, { storageLocation: item })} />)}</View>
              <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>{Math.round(suggestion.confidence * 100)}% confidence · {suggestion.quantityKnown ? 'quantity supported by photo' : 'quantity check needed'}</Text>
            </View>)}
            <Text style={[styles.label, { color: colors.foreground }]}>Ingredient name</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="e.g. spinach" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Quantity <Text style={{ fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>(optional)</Text></Text>
            <TextInput value={quantity} onChangeText={setQuantity} placeholder="e.g. 1 bag" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Storage location</Text>
            <View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={location === item} onPress={() => setLocation(item)} />)}</View>
            {photoUris.length ? <View style={[styles.uncertainNote, { backgroundColor: colors.accent }]}><Ionicons name="alert-circle-outline" size={18} color={colors.accentForeground} /><Text style={[styles.uncertainText, { color: colors.accentForeground }]}>Unclear quantities remain unknown until you add them. Save is the confirmation step; no item is silently added from an AI guess.</Text></View> : null}
            <Pressable testID="save-ingredient" onPress={saveIngredient} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save to My Kitchen</Text></Pressable>
          </>
        )}
      </ScrollView>
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
  stateNote: { flexDirection: 'row', gap: 8, padding: 13, borderRadius: 15, marginBottom: 14 },
  stateText: { flex: 1, fontSize: 12, lineHeight: 17 },
  suggestionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  suggestionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  quantityRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quantityInput: { flex: 1 },
  unitInput: { flex: 2 },
  confidenceText: { fontSize: 11, marginTop: 10 },
  saveButton: { height: 53, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  saveText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});