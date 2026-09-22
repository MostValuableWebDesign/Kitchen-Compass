import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, IngredientRow, SectionTitle } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';

const filters = ['All', 'Refrigerator', 'Freezer', 'Pantry'] as const;

export default function KitchenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ingredients, removeIngredient, toggleLow } = useKitchen();
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => ingredients.filter((item) => (filter === 'All' || item.location === filter) && item.name.toLowerCase().includes(search.toLowerCase())), [filter, ingredients, search]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Your kitchen" title="My Kitchen" />
        <View style={[styles.summary, { backgroundColor: colors.secondary }]}>
          <View><Text style={[styles.summaryNumber, { color: colors.primary }]}>{ingredients.length}</Text><Text style={[styles.summaryLabel, { color: colors.secondaryForeground }]}>confirmed items</Text></View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.primary }]} />
          <View><Text style={[styles.summaryNumber, { color: colors.primary }]}>{ingredients.filter((item) => item.status === 'low').length}</Text><Text style={[styles.summaryLabel, { color: colors.secondaryForeground }]}>running low</Text></View>
          <Pressable onPress={() => router.push('/scan')} style={({ pressed }) => [styles.addCircle, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Feather name="plus" size={22} color={colors.primaryForeground} /></Pressable>
        </View>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Search ingredients" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{filters.map((item) => <Chip key={item} label={item} selected={filter === item} onPress={() => setFilter(item)} />)}</ScrollView>
        <SectionTitle title={filter === 'All' ? 'Everything' : filter} action={ingredients.length ? 'Manage' : undefined} />
        {filtered.length ? filtered.map((item) => <IngredientRow key={item.id} ingredient={item} onPress={() => toggleLow(item.id)} onDelete={() => Alert.alert(`Remove ${item.name}?`, 'This only removes it from your confirmed kitchen inventory.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeIngredient(item.id) }])} />) : (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="basket-outline" size={34} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{ingredients.length ? 'No matches' : 'Your kitchen is waiting'}</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{ingredients.length ? 'Try another search or storage filter.' : 'Scan a shelf or add an ingredient manually to start getting useful suggestions.'}</Text><Pressable onPress={() => router.push('/scan')} style={({ pressed }) => [styles.emptyButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.emptyButtonText, { color: colors.primaryForeground }]}>Add ingredients</Text></Pressable></View>
        )}
        <View style={[styles.note, { backgroundColor: colors.muted }]}><Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Tap an item to mark it running low. Quantity is never guessed from a photo.</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  summary: { borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 17 },
  summaryNumber: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  summaryDivider: { width: 1, height: 34, opacity: 0.25 },
  addCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  searchBar: { height: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  filterRow: { gap: 8, paddingBottom: 21 },
  empty: { borderRadius: 22, borderWidth: 1, alignItems: 'center', padding: 28, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7, maxWidth: 280 },
  emptyButton: { borderRadius: 15, paddingHorizontal: 18, paddingVertical: 12, marginTop: 18 },
  emptyButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  note: { flexDirection: 'row', gap: 9, padding: 13, borderRadius: 15, marginTop: 20 },
  noteText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  pressed: { opacity: 0.72 },
});