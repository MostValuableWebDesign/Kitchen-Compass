import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { StorageLocation, useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';
import { normalizeConfirmedDate } from '@/lib/kitchenLogic';

const locations: StorageLocation[] = ['Refrigerator', 'Freezer', 'Pantry'];
const supportedUnits = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'count', 'egg', 'fruit', 'slice', 'clove', 'breast', 'handful'];
const statuses = ['fresh', 'low', 'used'] as const;

export default function InventoryEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ingredients, updateIngredient, removeIngredient } = useKitchen();
  const ingredient = useMemo(() => ingredients.find((item) => item.id === id), [id, ingredients]);
  const [name, setName] = useState(ingredient?.name ?? '');
  const [quantity, setQuantity] = useState(ingredient?.quantityKnown && ingredient.quantityValue !== undefined ? String(ingredient.quantityValue) : '');
  const [unit, setUnit] = useState(ingredient?.quantityKnown ? ingredient.unit ?? '' : '');
  const [location, setLocation] = useState<StorageLocation>(ingredient?.location ?? 'Refrigerator');
  const [status, setStatus] = useState<(typeof statuses)[number]>(ingredient?.status ?? 'fresh');
  const [date, setDate] = useState(ingredient?.dateConfirmed ? ingredient.expires ?? '' : '');
  const [dateKind, setDateKind] = useState<'expiration' | 'best-before'>(ingredient?.dateKind ?? 'expiration');

  if (!ingredient) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <Text style={[styles.missingTitle, { color: colors.foreground }]}>Inventory item not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Back to kitchen</Text></Pressable>
      </View>
    );
  }

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Add a name before saving this inventory item.');
      return;
    }
    const confirmedDate = normalizeConfirmedDate(date);
    if (date.trim() && !confirmedDate) {
      Alert.alert('Check the date', 'Use a real date in YYYY-MM-DD format, or leave the date blank.');
      return;
    }
    const quantityText = quantity.trim() && unit.trim() ? `${quantity.trim()} ${unit.trim()}` : undefined;
    updateIngredient(ingredient.id, {
      name: trimmedName,
      quantity: quantityText,
      location,
      status,
      expires: confirmedDate,
      dateConfirmed: Boolean(confirmedDate),
      dateKind,
      confidence: 'confirmed',
    });
    router.back();
  };

  const remove = () => Alert.alert(
    `Remove ${ingredient.name}?`,
    'This removes the item from your confirmed kitchen inventory.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeIngredient(ingredient.id); router.back(); } },
    ],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Edit inventory</Text>
          <View style={{ width: 22 }} />
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Only information you confirm here can create a date warning. Photos never set freshness, expiration, or quantity.</Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Ingredient name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

        <Text style={[styles.label, { color: colors.foreground }]}>Quantity</Text>
        <View style={styles.quantityRow}>
          <TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Leave blank if unknown" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.quantityInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          <TextInput value={unit} onChangeText={setUnit} placeholder="Unit" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.unitInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
        {!ingredient.quantityKnown ? <Text style={[styles.helper, { color: colors.mutedForeground }]}>Current quantity: unknown. Choose a supported unit if you want to confirm one.</Text> : null}
        <View style={styles.chips}>{supportedUnits.map((item) => <Chip key={item} label={item} selected={unit.toLowerCase() === item} onPress={() => setUnit(item)} />)}</View>

        <Text style={[styles.label, { color: colors.foreground }]}>Storage location</Text>
        <View style={styles.chips}>{locations.map((item) => <Chip key={item} label={item} selected={location === item} onPress={() => setLocation(item)} />)}</View>

        <Text style={[styles.label, { color: colors.foreground }]}>Status</Text>
        <View style={styles.chips}>{statuses.map((item) => <Chip key={item} label={item === 'low' ? 'Running low' : item[0].toUpperCase() + item.slice(1)} selected={status === item} onPress={() => setStatus(item)} />)}</View>

        <Text style={[styles.label, { color: colors.foreground }]}>Optional date</Text>
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>Enter or confirm a date yourself. Use YYYY-MM-DD.</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        <View style={styles.chips}>
          <Chip label="Expiration" selected={dateKind === 'expiration'} onPress={() => setDateKind('expiration')} />
          <Chip label="Best before" selected={dateKind === 'best-before'} onPress={() => setDateKind('best-before')} />
        </View>

        <Pressable onPress={save} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save inventory</Text></Pressable>
        {ingredient.photoUri ? <Pressable onPress={() => Alert.alert('Delete saved scan photo?', 'The ingredient will remain in your kitchen, but the original scan photo will be removed from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete photo', style: 'destructive', onPress: () => updateIngredient(ingredient.id, { photoUri: undefined }) }])} style={({ pressed }) => [styles.photoButton, { borderColor: colors.border }, pressed && styles.pressed]}><Feather name="image" size={16} color={colors.foreground} /><Text style={[styles.photoButtonText, { color: colors.foreground }]}>Delete saved scan photo</Text></Pressable> : null}
        <Pressable onPress={remove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><Text style={[styles.removeText, { color: colors.destructive }]}>Remove from kitchen</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 15, marginBottom: 8 },
  input: { height: 50, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  quantityRow: { flexDirection: 'row', gap: 8 },
  quantityInput: { flex: 1 },
  unitInput: { flex: 1 },
  helper: { fontSize: 11, lineHeight: 16, marginTop: 7, marginBottom: 9 },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 9 },
  saveButton: { height: 53, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  saveText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  removeButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  removeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  photoButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 10 },
  photoButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  missingTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', paddingHorizontal: 20 },
  pressed: { opacity: 0.72 },
});