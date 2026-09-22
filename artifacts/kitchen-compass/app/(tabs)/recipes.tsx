import { Feather } from '@expo/vector-icons';
import { useDiscoverRecipes, type RecipeDiscoveryFiltersMealType } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, RecipeCard } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';
import { confirmedDateStatus, ingredientIdentitiesMatch, recipeAvailabilityLabel, recipeMatchesPreferences, recipeReadiness } from '@/lib/kitchenLogic';
import { buildRecipeDiscoveryRequest, mapDiscoveredRecipe, recipeVersion, type RecipeFilterState } from '@/lib/recipeDiscovery';
import { getAvailableRecipes } from '@/lib/recipeLookup';

type ResultFilter = 'All' | 'Ready to cook' | 'Almost ready' | 'Check quantities' | 'Quick meals' | 'Use soon' | 'Favorites';

const resultFilters: ResultFilter[] = ['All', 'Ready to cook', 'Almost ready', 'Check quantities', 'Quick meals', 'Use soon', 'Favorites'];
const mealTypes: RecipeDiscoveryFiltersMealType[] = ['Any', 'Breakfast', 'Lunch', 'Dinner'];
const timeOptions: Array<number | undefined> = [undefined, 30, 45, 60];
const healthOptions: Array<number | undefined> = [undefined, 70, 85];

export default function RecipesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    ingredients,
    preferences,
    reservations,
    savedRecipes,
    favoriteRecipeVersions,
    saveDiscoveredRecipes,
    toggleFavoriteRecipe,
    hydrated,
  } = useKitchen();
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('All');
  const [mealType, setMealType] = useState<RecipeDiscoveryFiltersMealType>('Any');
  const [cuisine, setCuisine] = useState('');
  const [maxMinutes, setMaxMinutes] = useState<number>();
  const [equipment, setEquipment] = useState<string>();
  const [dietaryPreference, setDietaryPreference] = useState<string>();
  const [minHealthScore, setMinHealthScore] = useState<number>();
  const [variation, setVariation] = useState(0);

  const discovery = useDiscoverRecipes();
  const availableRecipes = useMemo(() => getAvailableRecipes(savedRecipes), [savedRecipes]);
  const inventoryPayload = useMemo(() => ingredients.map((item) => ({
    name: item.name,
    location: item.location,
    ...(item.quantityValue !== undefined ? { quantityValue: item.quantityValue } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
    quantityKnown: item.quantityKnown === true,
    status: item.status,
    ...(item.confidence ? { confidence: item.confidence } : {}),
  })), [ingredients]);
  const filterState: RecipeFilterState = { mealType, cuisine, maxMinutes, equipment, dietaryPreference, minHealthScore };

  const discover = (different = false) => {
    const nextVariation = variation + 1;
    setVariation(nextVariation);
    const request = buildRecipeDiscoveryRequest(
      inventoryPayload,
      preferences,
      filterState,
      `${different ? 'different' : 'refresh'}-${nextVariation}`,
      different ? savedRecipes.map(recipeVersion) : [],
    );
    discovery.mutate({ data: request }, {
      onSuccess: (result) => saveDiscoveredRecipes(result.recipes.map(mapDiscoveredRecipe)),
    });
  };

  const recipeUsesSoonIngredient = (recipe: (typeof availableRecipes)[number]) => recipe.ingredients.some((ingredient) => ingredients.some((item) =>
    ingredientIdentitiesMatch(ingredient.name, item)
    && item.dateConfirmed === true
    && Boolean(confirmedDateStatus(item.expires)),
  ));

  const filtered = useMemo(() => availableRecipes.filter((recipe) => {
    const safety = recipeReadiness(recipe, ingredients, preferences.allergies, preferences.servings, reservations);
    const availability = recipeAvailabilityLabel(safety);
    const totalMinutes = recipe.prep + recipe.cook;
    const usesSoon = recipeUsesSoonIngredient(recipe);
    const matchesSearch = `${recipe.title} ${recipe.cuisine} ${recipe.meal}`.toLowerCase().includes(search.toLowerCase().trim());
    const matchesSavedPreferences = recipeMatchesPreferences(recipe, preferences);
    const matchesLocalFilters = (mealType === 'Any' || recipe.meal === mealType)
      && (!cuisine.trim() || recipe.cuisine.toLowerCase().includes(cuisine.trim().toLowerCase()))
      && (maxMinutes === undefined || totalMinutes <= maxMinutes)
      && (!equipment || recipe.equipment.includes(equipment))
      && (!dietaryPreference || recipe.dietaryTags?.map((tag) => tag.toLowerCase()).includes(dietaryPreference.toLowerCase()) || recipeMatchesPreferences(recipe, { ...preferences, dietaryRestrictions: [dietaryPreference] }))
       && (minHealthScore === undefined || (recipe.healthScore.score !== undefined && recipe.healthScore.score >= minHealthScore));
    const matchesResultFilter = resultFilter === 'All'
      || (resultFilter === 'Quick meals' && totalMinutes <= 30)
      || (resultFilter === 'Use soon' && usesSoon)
      || (resultFilter === 'Favorites' && favoriteRecipeVersions.includes(recipeVersion(recipe)))
      || resultFilter === availability;
    return matchesSavedPreferences && matchesLocalFilters && matchesSearch && matchesResultFilter;
  }), [availableRecipes, cuisine, dietaryPreference, equipment, favoriteRecipeVersions, ingredients, maxMinutes, mealType, minHealthScore, preferences, reservations, resultFilter, search]);

  const statusMessage = discovery.isPending
    ? 'Checking your confirmed kitchen and preparing new ideas…'
    : discovery.isError
      ? 'Recipe discovery is unavailable. Saved recipes and the built-in examples are still available offline.'
      : discovery.data?.warning;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="From what you have" title="Recipes" />
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search recipes or cuisines" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
          <Feather name="sliders" size={17} color={colors.mutedForeground} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {resultFilters.map((item) => <Chip key={item} label={item} selected={resultFilter === item} onPress={() => setResultFilter(item)} />)}
        </ScrollView>
        <View style={[styles.discoveryCard, { backgroundColor: colors.secondary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.discoveryTitle, { color: colors.secondaryForeground }]}>Discover from your kitchen</Text>
            <Text style={[styles.discoveryBody, { color: colors.secondaryForeground }]}>Only confirmed inventory is sent for recipe matching. Allergies and restrictions are applied before results appear.</Text>
          </View>
          <Pressable testID="discover-recipes" onPress={() => discover(false)} disabled={discovery.isPending || !hydrated} style={({ pressed }) => [styles.discoverButton, { backgroundColor: colors.primary }, pressed && styles.pressed, discovery.isPending && styles.disabled]}>
            <Feather name="star" size={16} color={colors.primaryForeground} />
            <Text style={[styles.discoverButtonText, { color: colors.primaryForeground }]}>{discovery.isPending ? 'Finding' : 'Find recipes'}</Text>
          </Pressable>
        </View>
        {statusMessage ? <View style={[styles.serviceMessage, { borderColor: discovery.isError ? colors.destructive : colors.border, backgroundColor: colors.card }]}><Feather name={discovery.isError ? 'wifi-off' : 'info'} size={16} color={discovery.isError ? colors.destructive : colors.primary} /><Text style={[styles.serviceText, { color: colors.mutedForeground }]}>{statusMessage}</Text></View> : null}
        <View style={styles.filterHeader}><Text style={[styles.filterTitle, { color: colors.foreground }]}>Fine-tune ideas</Text><Text style={[styles.filterHint, { color: colors.mutedForeground }]}>Optional</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {mealTypes.map((item) => <Chip key={item} label={item === 'Any' ? 'Any meal' : item} selected={mealType === item} onPress={() => setMealType(item)} />)}
        </ScrollView>
        <TextInput value={cuisine} onChangeText={setCuisine} placeholder="Cuisine, such as Italian" placeholderTextColor={colors.mutedForeground} style={[styles.filterInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {timeOptions.map((item) => <Chip key={item ?? 'any-time'} label={item ? `${item} min` : 'Any time'} selected={maxMinutes === item} onPress={() => setMaxMinutes(item)} />)}
          {healthOptions.map((item) => <Chip key={item ?? 'any-score'} label={item ? `${item}+ score` : 'Any score'} selected={minHealthScore === item} onPress={() => setMinHealthScore(item)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Any equipment" selected={!equipment} onPress={() => setEquipment(undefined)} />
          {preferences.equipment.map((item) => <Chip key={item} label={item} selected={equipment === item} onPress={() => setEquipment(item)} />)}
          {['vegetarian', 'vegan', 'gluten free', 'dairy free'].map((item) => <Chip key={item} label={item} selected={dietaryPreference === item} onPress={() => setDietaryPreference(dietaryPreference === item ? undefined : item)} />)}
        </ScrollView>
        <View style={styles.discoveryHeader}>
          <View><Text style={[styles.heading, { color: colors.foreground }]}>{resultFilter === 'All' ? 'A good place to start' : resultFilter}</Text><Text style={[styles.subheading, { color: colors.mutedForeground }]}>{savedRecipes.length ? `${savedRecipes.length} saved discovery${savedRecipes.length === 1 ? '' : 'ies'} available offline` : ingredients.length ? 'Matched against your confirmed kitchen' : 'Add confirmed ingredients to make suggestions personal'}</Text></View>
          <Pressable testID="different-recipes" onPress={() => discover(true)} disabled={discovery.isPending || !hydrated} style={({ pressed }) => [styles.differentButton, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed, discovery.isPending && styles.disabled]}><Feather name="shuffle" size={15} color={colors.primary} /></Pressable>
        </View>
        {filtered.length ? filtered.map((recipe) => {
          const safety = recipeReadiness(recipe, ingredients, preferences.allergies, preferences.servings, reservations);
          const availability = recipeAvailabilityLabel(safety);
          const usesSoon = recipeUsesSoonIngredient(recipe);
          return <RecipeCard key={recipeVersion(recipe)} recipe={recipe} hasIngredients={safety.ready} statusText={usesSoon ? `${availability} · Use soon` : availability} favorite={favoriteRecipeVersions.includes(recipeVersion(recipe))} onFavorite={() => toggleFavoriteRecipe(recipe)} onPress={() => router.push(`/recipe/${recipe.id}`)} />;
        }) : <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No recipes match those filters</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Try a different category, clear a filter, or discover another set of recipes.</Text></View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  search: { height: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, alignItems: 'center', flexDirection: 'row', gap: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { gap: 8, paddingVertical: 10 },
  discoveryCard: { borderRadius: 19, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 },
  discoveryTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  discoveryBody: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  discoverButton: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 10, alignItems: 'center', gap: 4 },
  discoverButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  serviceMessage: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  serviceText: { flex: 1, fontSize: 11, lineHeight: 16 },
  filterHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 },
  filterTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  filterHint: { fontSize: 11 },
  filterInput: { height: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, marginTop: 2 },
  discoveryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 14 },
  heading: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  subheading: { fontSize: 12, marginTop: 4 },
  differentButton: { width: 39, height: 39, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 20, borderWidth: 1, padding: 25, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  emptyBody: { fontSize: 13, marginTop: 7, textAlign: 'center', lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.6 },
});