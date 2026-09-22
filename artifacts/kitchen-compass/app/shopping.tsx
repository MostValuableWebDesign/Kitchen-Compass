import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { StorageLocation, useKitchen, type PurchaseRow } from '@/context/KitchenContext';
import { calculateShoppingNeeds } from '@/lib/kitchenLogic';
import { useColors } from '@/hooks/useColors';
import { getAvailableRecipes } from '@/lib/recipeLookup';

const categories = ['Produce', 'Protein', 'Dairy & eggs', 'Pantry', 'Other'] as const;

export default function ShoppingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, ingredients, preferences, reservations, savedRecipes, shoppingList, setShoppingList, addPurchasedItems } = useKitchen();
  const [manualItem, setManualItem] = useState('');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([]);
  const needs = useMemo(() => calculateShoppingNeeds(plan, getAvailableRecipes(savedRecipes), ingredients, preferences.servings, reservations), [ingredients, plan, preferences.servings, reservations, savedRecipes]);
  const checked = shoppingList.checkedIds;
  const manualItems = shoppingList.manualItems;
  const toggleChecked = (id: string) => setShoppingList({ checkedIds: checked.includes(id) ? checked.filter((value) => value !== id) : [...checked, id] });
  const shareList = async () => {
    const lines = [...needs.map((item) => `${item.quantityCheckNeeded ? 'Check quantity: ' : ''}${item.name}${item.quantity ? ` — ${item.quantity} ${item.unit}` : ''}`), ...manualItems.map((item) => `Manual: ${item}`)];
    await Share.share({ message: `Kitchen Compass shopping list\n\n${lines.join('\n')}` });
  };
  const addManualItem = () => {
    if (!manualItem.trim()) return;
    setShoppingList({ manualItems: [...manualItems, manualItem.trim()] });
    setManualItem('');
  };
  const openPurchaseConfirmation = () => {
    setPurchaseRows(needs.map((item) => ({ name: item.name, quantity: item.quantity ? `${item.quantity} ${item.unit}` : '', location: item.category === 'Pantry' ? 'Pantry' : 'Refrigerator', confirmed: false })));
    setPurchaseOpen(true);
  };
  const confirmPurchase = () => {
    addPurchasedItems(purchaseRows);
    setPurchaseOpen(false);
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={21} color={colors.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.primary }]}>THIS WEEK</Text><Text style={[styles.title, { color: colors.foreground }]}>Shopping list</Text></View><Pressable onPress={shareList}><Feather name="share-2" size={19} color={colors.primary} /></Pressable></View>
        <View style={[styles.note, { backgroundColor: colors.secondary }]}><Ionicons name="information-circle-outline" size={18} color={colors.primary} /><Text style={[styles.noteText, { color: colors.secondaryForeground }]}>This list uses {preferences.servings} servings and subtracts only confirmed, known quantities. Unknown quantities stay flagged for a kitchen check.</Text></View>
         {categories.map((category) => {
          const categoryNeeds = needs.filter((item) => item.category === category);
          if (!categoryNeeds.length) return null;
           return <View key={category} style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{category}</Text><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{categoryNeeds.map((item) => <Pressable key={item.id} onPress={() => toggleChecked(item.id)} style={styles.item}><View style={[styles.checkbox, { borderColor: checked.includes(item.id) ? colors.primary : colors.border, backgroundColor: checked.includes(item.id) ? colors.primary : 'transparent' }]}>{checked.includes(item.id) ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}</View><View style={{ flex: 1 }}><Text style={[styles.itemName, { color: checked.includes(item.id) ? colors.mutedForeground : colors.foreground, textDecorationLine: checked.includes(item.id) ? 'line-through' : 'none' }]}>{item.name}</Text><Text style={[styles.itemMeta, { color: item.quantityCheckNeeded ? colors.accentForeground : colors.mutedForeground }]}>{item.quantityCheckNeeded ? `${item.quantityCheckReasons.includes('unknown-inventory') ? 'Unknown quantity' : 'Incompatible unit'}${item.quantity ? ` · shortage ${item.quantity} ${item.unit}` : ''}` : `${item.quantity} ${item.unit}`}</Text></View></Pressable>)}</View></View>;
        })}
        <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Manual items</Text><View style={styles.manualRow}><TextInput value={manualItem} onChangeText={setManualItem} onSubmitEditing={addManualItem} placeholder="Add a grocery item" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addManualItem} style={[styles.addButton, { backgroundColor: colors.primary }]}><Feather name="plus" size={18} color={colors.primaryForeground} /></Pressable></View>{manualItems.map((item) => <View key={item} style={[styles.manualItem, { borderBottomColor: colors.border }]}><Text style={[styles.itemName, { color: colors.foreground }]}>{item}</Text><Pressable onPress={() => setShoppingList({ manualItems: manualItems.filter((value) => value !== item) })}><Feather name="trash-2" size={16} color={colors.mutedForeground} /></Pressable></View>)}</View>
        <Pressable onPress={openPurchaseConfirmation} style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.confirmText, { color: colors.foreground }]}>Review purchased items</Text></Pressable>
      </ScrollView>
      <Modal animationType="slide" visible={purchaseOpen} onRequestClose={() => setPurchaseOpen(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}><Pressable onPress={() => setPurchaseOpen(false)}><Feather name="x" size={21} color={colors.foreground} /></Pressable><Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirm groceries</Text><View style={{ width: 21 }} /></View>
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Edit every quantity and location. Only checked rows will be added to My Kitchen.</Text>
          <ScrollView contentContainerStyle={styles.purchaseContent}>{purchaseRows.map((row, index) => <View key={`${row.name}-${index}`} style={[styles.purchaseCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Pressable onPress={() => setPurchaseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, confirmed: !item.confirmed } : item))} style={styles.purchaseHeader}><View style={[styles.checkbox, { borderColor: row.confirmed ? colors.primary : colors.border, backgroundColor: row.confirmed ? colors.primary : 'transparent' }]}>{row.confirmed ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}</View><Text style={[styles.itemName, { color: colors.foreground }]}>{row.name}</Text></Pressable><TextInput value={row.quantity} onChangeText={(value) => setPurchaseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: value } : item))} placeholder="Quantity and unit, e.g. 2 cups" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /><View style={styles.chips}>{(['Refrigerator', 'Freezer', 'Pantry'] as StorageLocation[]).map((location) => <Chip key={location} label={location} selected={row.location === location} onPress={() => setPurchaseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, location } : item))} />)}</View></View>)}</ScrollView>
          <Pressable onPress={confirmPurchase} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.confirmText, { color: colors.primaryForeground }]}>Add confirmed items</Text></Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  modal: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 20 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  title: { fontSize: 29, fontFamily: 'Inter_700Bold' },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 21, fontFamily: 'Inter_700Bold' },
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
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular' },
  addButton: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  manualItem: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  confirmButton: { height: 52, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  saveButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  purchaseContent: { gap: 12, paddingVertical: 18 },
  purchaseCard: { borderRadius: 17, borderWidth: 1, padding: 13, gap: 10 },
  purchaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  pressed: { opacity: 0.72 },
});