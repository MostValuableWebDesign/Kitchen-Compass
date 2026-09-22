import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, SectionTitle } from '@/components/KitchenUI';
import { StorageLocation, useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addIngredient } = useKitchen();
  const [photoUri, setPhotoUri] = useState<string>();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<StorageLocation>('Refrigerator');
  const [mode, setMode] = useState<'choose' | 'review'>('choose');

  const openSettings = () => { if (Platform.OS !== 'web') Linking.openSettings().catch(() => undefined); };
  const reviewPhoto = (uri: string) => { setPhotoUri(uri); setName(''); setMode('review'); };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', permission.canAskAgain ? 'Allow camera access to photograph ingredients.' : 'Camera access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]?.uri) reviewPhoto(result.assets[0].uri);
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', permission.canAskAgain ? 'Allow photo access to choose a kitchen image.' : 'Photo access is off for Kitchen Compass. You can enable it in Settings.', permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Open Settings', onPress: openSettings }, { text: 'Cancel', style: 'cancel' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]?.uri) reviewPhoto(result.assets[0].uri);
  };
  const saveIngredient = () => {
    if (!name.trim()) {
      Alert.alert('Add an ingredient name', 'Review the photo, then enter what you see so it can be confirmed.');
      return;
    }
    addIngredient({ name: name.trim(), quantity: quantity.trim() || undefined, location, status: 'fresh', confidence: photoUri ? 'uncertain' : 'confirmed', photoUri });
    Alert.alert('Added to My Kitchen', photoUri ? 'The item was saved as uncertain until you confirm the label.' : 'Your ingredient is ready for recipe matching.', [{ text: 'Done', onPress: () => { setMode('choose'); setPhotoUri(undefined); setName(''); setQuantity(''); router.push('/kitchen'); } }]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>ADD TO YOUR KITCHEN</Text><Text style={[styles.title, { color: colors.foreground }]}>{mode === 'review' ? 'Review scan' : 'Scan ingredients'}</Text></View>{mode === 'review' ? <Pressable onPress={() => setMode('choose')}><Feather name="x" size={22} color={colors.foreground} /></Pressable> : null}</View>
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
            <View style={[styles.privacyNote, { backgroundColor: colors.muted }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} /><Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Photos stay on this device in this first build. AI recognition is not connected yet, so Kitchen Compass will never pretend to identify ingredients without your review.</Text></View>
          </>
        ) : (
          <>
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} /> : <View style={[styles.manualPreview, { backgroundColor: colors.secondary }]}><Feather name="edit-3" size={28} color={colors.primary} /></View>}
            <View style={styles.reviewHeading}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>{photoUri ? 'What did you spot?' : 'Add an ingredient'}</Text><Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{photoUri ? 'Photo recognition is intentionally not automatic here. Confirm the item you want to save.' : 'Only confirmed information is added to your kitchen.'}</Text></View>
            <Text style={[styles.label, { color: colors.foreground }]}>Ingredient name</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="e.g. spinach" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Quantity <Text style={{ fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>(optional)</Text></Text>
            <TextInput value={quantity} onChangeText={setQuantity} placeholder="e.g. 1 bag" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Storage location</Text>
            <View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((item) => <Chip key={item} label={item} selected={location === item} onPress={() => setLocation(item)} />)}</View>
            {photoUri ? <View style={[styles.uncertainNote, { backgroundColor: colors.accent }]}><Ionicons name="alert-circle-outline" size={18} color={colors.accentForeground} /><Text style={[styles.uncertainText, { color: colors.accentForeground }]}>This item will be marked uncertain. Confirm the label before relying on it for allergy-safe suggestions.</Text></View> : null}
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
  preview: { width: '100%', height: 230, borderRadius: 24, marginBottom: 20 },
  manualPreview: { width: '100%', height: 130, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  reviewHeading: { marginBottom: 16 },
  reviewTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  reviewBody: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 12, marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  uncertainNote: { flexDirection: 'row', gap: 9, padding: 13, borderRadius: 15, marginTop: 19 },
  uncertainText: { flex: 1, fontSize: 11, lineHeight: 16 },
  saveButton: { height: 53, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  saveText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});