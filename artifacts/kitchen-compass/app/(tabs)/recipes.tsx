import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, RecipeCard } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { recipes } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';

export default function RecipesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ingredients } = useKitchen();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [different, setDifferent] = useState(false);
  const filters = ['All', 'Ready to cook', 'Quick meals', 'Breakfast'];
  const filtered = useMemo(() => recipes.filter((recipe) => {
    const matchesSearch = `${recipe.title} ${recipe.cuisine}`.toLowerCase().includes(search.toLowerCase());
    const required = recipe.ingredients.filter((item) => item.required !== false);
    const ready = required.every((requiredItem) => ingredients.some((item) => item.name.toLowerCase().includes(requiredItem.name.toLowerCase()) || requiredItem.name.toLowerCase().includes(item.name.toLowerCase())));
    const matchesFilter = filter === 'All' || (filter === 'Ready to cook' && ready) || (filter === 'Quick meals' && recipe.prep + recipe.cook <= 30) || (filter === 'Breakfast' && recipe.meal === 'Breakfast');
    return matchesSearch && matchesFilter;
  }), [filter, ingredients, search]);
  const shown = different ? [...filtered].reverse() : filtered;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="From what you have" title="Recipes" />
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={18} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Search recipes or cuisines" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /><Feather name="sliders" size={17} color={colors.mutedForeground} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{filters.map((item) => <Chip key={item} label={item} selected={filter === item} onPress={() => setFilter(item)} />)}</ScrollView>
        <View style={styles.discoveryHeader}><View><Text style={[styles.heading, { color: colors.foreground }]}>{filter === 'All' ? 'A good place to start' : filter}</Text><Text style={[styles.subheading, { color: colors.mutedForeground }]}>{ingredients.length ? 'Matched against your confirmed kitchen' : 'Add ingredients to make these suggestions personal'}</Text></View><Pressable onPress={() => setDifferent((value) => !value)} style={({ pressed }) => [styles.differentButton, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><Feather name="shuffle" size={15} color={colors.primary} /></Pressable></View>
        {shown.length ? shown.map((recipe) => {
          const ready = recipe.ingredients.filter((item) => item.required !== false).every((required) => ingredients.some((item) => item.name.toLowerCase().includes(required.name.toLowerCase()) || required.name.toLowerCase().includes(item.name.toLowerCase())));
          return <RecipeCard key={recipe.id} recipe={recipe} hasIngredients={ready} onPress={() => router.push(`/recipe/${recipe.id}`)} />;
        }) : <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No recipes match that filter</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Try a different category or clear your search.</Text></View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  search: { height: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, alignItems: 'center', flexDirection: 'row', gap: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { gap: 8, paddingVertical: 15 },
  discoveryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heading: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  subheading: { fontSize: 12, marginTop: 4 },
  differentButton: { width: 39, height: 39, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 20, borderWidth: 1, padding: 25, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  emptyBody: { fontSize: 13, marginTop: 7 },
  pressed: { opacity: 0.72 },
});