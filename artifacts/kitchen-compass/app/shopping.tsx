import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { recipes } from '@/data/recipes';
import { calculateShoppingNeeds } from '@/lib/kitchenLogic';
import { useColors } from '@/hooks/useColors';

const categories = ['Produce', 'Protein', 'Dairy & eggs', 'Pantry', 'Other'] as const;

export default function ShoppingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, ingredients } = useKitchen();
  const [checked, setChecked] = useState<string[]>([]);
  const [manualItem, setManualItem] = useState('');
  const [manualItems, setManualItems] = useState<string[]>([]);
  const needs = useMemo(() => calculateShoppingNeeds(plan, recipes, ingredients, 2), [ingredients, plan]);
  const shareList = async () => {
    const lines = [...needs.map((item) => `${item.quantityCheckNeeded ? 'Check quantity: ' : ''}${item.name}${item.quantity ? ` — ${item.quantity} ${item.unit}` : ''}`), ...manualItems.map((item) => `Manual: ${item}`)];
    await Share.share({ message: `Kitchen Compass shopping list\n\n${lines.join('\n')}` });
  };
  const addManualItem = () => {
    if (!manualItem.trim()) return;
    setManualItems((current) => [...current, manualItem.trim()]);
    setManualItem('');
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={21} color={colors.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.primary }]}>THIS WEEK</Text><Text style={[styles.title, { color: colors.foreground }]}>Shopping list</Text></View><Pressable onPress={shareList}><Feather name="share-2" size={19} color={colors.primary} /></Pressable></View>
        <View style={[styles.note, { backgroundColor: colors.secondary }]}><Ionicons name="information-circle-outline" size={18} color={colors.primary} /><Text style={[styles.noteText, { color: colors.secondaryForeground }]}>This list uses the full planned week and subtracts only confirmed, known quantities. Unknown quantities stay flagged for a kitchen check.</Text></View>
        {categories.map((category) => {
          const categoryNeeds = needs.filter((item) => item.category === category);
          if (!categoryNeeds.length) return null;
          return <View key={category} style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{category}</Text><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{categoryNeeds.map((item) => <Pressable key={item.id} onPress={() => setChecked((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} style={styles.item}><View style={[styles.checkbox, { borderColor: checked.includes(item.id) ? colors.primary : colors.border, backgroundColor: checked.includes(item.id) ? colors.primary : 'transparent' }]}>{checked.includes(item.id) ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}</View><View style={{ flex: 1 }}><Text style={[styles.itemName, { color: checked.includes(item.id) ? colors.mutedForeground : colors.foreground, textDecorationLine: checked.includes(item.id) ? 'line-through' : 'none' }]}>{item.name}</Text><Text style={[styles.itemMeta, { color: item.quantityCheckNeeded ? colors.accentForeground : colors.mutedForeground }]}>{item.quantityCheckNeeded ? 'Quantity check needed' : `${item.quantity} ${item.unit}`}</Text></View></Pressable>)}</View></View>;
        })}
        <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Manual items</Text><View style={styles.manualRow}><TextInput value={manualItem} onChangeText={setManualItem} onSubmitEditing={addManualItem} placeholder="Add a grocery item" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addManualItem} style={[styles.addButton, { backgroundColor: colors.primary }]}><Feather name="plus" size={18} color={colors.primaryForeground} /></Pressable></View>{manualItems.map((item) => <View key={item} style={[styles.manualItem, { borderBottomColor: colors.border }]}><Text style={[styles.itemName, { color: colors.foreground }]}>{item}</Text><Pressable onPress={() => setManualItems((current) => current.filter((value) => value !== item))}><Feather name="trash-2" size={16} color={colors.mutedForeground} /></Pressable></View>)}</View>
        <Pressable onPress={() => Alert.alert('Purchased items', 'Adding groceries to My Kitchen requires an explicit confirmation flow. That flow will keep quantities and units instead of assuming a full purchase.', [{ text: 'OK' }])} style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.confirmText, { color: colors.foreground }]}>Add purchased items to My Kitchen</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 20 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  title: { fontSize: 29, fontFamily: 'Inter_700Bold' },
  note: { flexDirection: 'row', gap: 9, borderRadius: 16, padding: 14, marginBottom: 22 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14 },
  item: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#00000010' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  itemMeta: { fontSize: 11, marginTop: 4 },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular' },
  addButton: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  manualItem: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  confirmButton: { height: 52, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});