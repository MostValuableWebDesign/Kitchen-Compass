import { Feather } from '@expo/vector-icons';
import { discoverRecipes, findExternalRecipes, type ExternalRecipe, type RecipeDiscoveryFiltersMealType } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, RecipeCard } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';
import { confirmedDateStatus, ingredientIdentitiesMatch, recipeAvailabilityLabel, recipeMatchesPreferences, recipeReadiness } from '@/lib/kitchenLogic';
import { buildRecipeDiscoveryRequest, mapDiscoveredRecipe, matchingSavedRecipes, novelRecipes, recipeTitleKey, recipeVersion, type RecipeFilterState } from '@/lib/recipeDiscovery';
import { getAvailableRecipes } from '@/lib/recipeLookup';
import { loadRecipeImages } from '@/lib/loadRecipeImages';
import { mapPublishedRecipe, publishedRecipeVersion } from '@/lib/publishedRecipeImport';
import { buildPublishedRecipeSearch, MAX_PUBLISHED_SEARCH_ANCHORS, publishedIngredientCategories, publishedIngredientCategory, rankPublishedSearchIngredients } from '@/lib/publishedRecipeSearch';
import { isArchivedPublished, isArchivedRecipe, type ArchivedRecipe } from '@/lib/recipeArchive';
import { isKidFriendlyRecipe, publishedRecipeAllowed } from '@/lib/kidFriendly';
import type { Recipe } from '@/data/recipes';

type ResultFilter = 'All' | 'Ready to cook' | 'Almost ready' | 'Check quantities' | 'Quick meals' | 'Use soon' | 'Favorites';

const resultFilters: ResultFilter[] = ['All', 'Ready to cook', 'Almost ready', 'Check quantities', 'Quick meals', 'Use soon', 'Favorites'];
const mealTypes: RecipeDiscoveryFiltersMealType[] = ['Any', 'Breakfast', 'Lunch', 'Dinner'];
const timeOptions: Array<number | undefined> = [undefined, 30, 45, 60];
const healthOptions: Array<number | undefined> = [undefined, 70, 85];
type ActiveSearch = { kind: 'kitchen' | 'published' | 'kids'; startedAt: number; complete: boolean };
type PublishedSearchStep = 'choice' | 'manual' | 'confirm';
type PublishedSelectionMode = 'automatic' | 'manual';
type RecipeSection = 'general' | 'kids';

export default function RecipesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    ingredients,
    preferences,
    reservations,
    savedRecipes,
    archivedRecipes,
    savedKidPublishedRecipes,
    favoriteRecipeVersions,
    saveDiscoveredRecipes,
    savePublishedRecipes,
    setDiscoveredRecipeImage,
    toggleFavoriteRecipe,
    archiveRecipe,
    archivePublishedRecipe,
    restoreRecipe,
    saveKidPublishedRecipes,
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
  const [externalRecipes, setExternalRecipes] = useState<ExternalRecipe[]>([]);
  const [discardedExternalRecipeIds, setDiscardedExternalRecipeIds] = useState<string[]>([]);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalMessage, setExternalMessage] = useState('');
  const [publishedPickerOpen, setPublishedPickerOpen] = useState(false);
  const [publishedDriverIds, setPublishedDriverIds] = useState<string[]>([]);
  const [publishedSearchStep, setPublishedSearchStep] = useState<PublishedSearchStep>('choice');
  const [publishedSelectionMode, setPublishedSelectionMode] = useState<PublishedSelectionMode>('automatic');
  const [kidMessage, setKidMessage] = useState('');
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [discoveryWarning, setDiscoveryWarning] = useState<string>();
  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [progressClock, setProgressClock] = useState(Date.now());
  const [imageBusy, setImageBusy] = useState(false);
  const [imageMessage, setImageMessage] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [section, setSection] = useState<RecipeSection>('general');
  const searchGuard = useRef(false);
  const imageJob = useRef(0);
  const pendingImages = useRef(new Set<string>());
  const searchRequest = useRef<AbortController | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenPublishedRecipeIds = useRef(new Set<string>());

  useEffect(() => {
    if (!activeSearch || activeSearch.complete) return;
    const timer = setInterval(() => setProgressClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, [activeSearch]);
  useEffect(() => () => {
    searchRequest.current?.abort();
    if (completionTimer.current) clearTimeout(completionTimer.current);
  }, []);

  const beginSearch = (kind: ActiveSearch['kind'], controller: AbortController) => {
    if (searchGuard.current) return false;
    searchGuard.current = true;
    searchRequest.current = controller;
    Keyboard.dismiss();
    const startedAt = Date.now();
    setProgressClock(startedAt);
    setActiveSearch({ kind, startedAt, complete: false });
    return true;
  };
  const finishSearch = (controller: AbortController, success: boolean) => {
    if (searchRequest.current !== controller) return;
    searchRequest.current = null;
    if (success) {
      setActiveSearch((current) => current ? { ...current, complete: true } : null);
      completionTimer.current = setTimeout(() => {
        setActiveSearch(null);
        searchGuard.current = false;
        completionTimer.current = null;
      }, 500);
    } else {
      setActiveSearch(null);
      searchGuard.current = false;
    }
  };
  const cancelSearch = () => {
    if (!activeSearch || activeSearch.complete) return;
    searchRequest.current?.abort();
    searchRequest.current = null;
    searchGuard.current = false;
    setActiveSearch(null);
    setDiscoveryBusy(false);
    setExternalBusy(false);
    if (activeSearch.kind === 'kitchen' || activeSearch.kind === 'kids') {
      setDiscoveryError(false);
      setDiscoveryWarning('Recipe search cancelled. Your saved recipes are unchanged.');
      if (activeSearch.kind === 'kids') setKidMessage('');
    } else {
      setExternalMessage('Online recipe search cancelled.');
    }
  };
  // The provider does not report work completed. Show elapsed wait as an estimate,
  // then reserve 100% for a response that has actually been processed.
  const progressLimitMs = activeSearch?.kind === 'published' ? 30_000 : 180_000;
  const progressPercent = activeSearch?.complete ? 100 : activeSearch
    ? Math.min(95, Math.floor(((progressClock - activeSearch.startedAt) / progressLimitMs) * 95))
    : 0;

  const availableRecipes = useMemo(() => getAvailableRecipes(savedRecipes), [savedRecipes]);
  const rankedPublishedIngredients = useMemo(() => rankPublishedSearchIngredients(ingredients), [ingredients]);
  const groupedPublishedIngredients = useMemo(() => publishedIngredientCategories.map((category) => ({
    category,
    ingredients: rankedPublishedIngredients.filter((ingredient) => publishedIngredientCategory(ingredient.name) === category),
  })).filter((group) => group.ingredients.length), [rankedPublishedIngredients]);
  useEffect(() => {
    const eligibleIds = new Set(rankedPublishedIngredients.map((ingredient) => ingredient.id));
    setPublishedDriverIds((current) => {
      const eligible = current.filter((id) => eligibleIds.has(id));
      return eligible.length === current.length ? current : eligible;
    });
  }, [rankedPublishedIngredients]);
  const visibleSavedCount = savedRecipes.filter((recipe) => !isArchivedRecipe(recipe, archivedRecipes) && (section === 'kids' ? isKidFriendlyRecipe(recipe) : recipe.audience !== 'kids')).length;
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
  const visibleExternalRecipes = useMemo(() => externalRecipes
    .filter((item) => !discardedExternalRecipeIds.includes(item.id)
      && !isArchivedPublished(item, archivedRecipes)
      && publishedRecipeAllowed(item, preferences.allergies, preferences.dislikes))
    .sort((left, right) => right.matchedIngredients.length - left.matchedIngredients.length || left.missingIngredients.length - right.missingIngredients.length),
    [archivedRecipes, discardedExternalRecipeIds, externalRecipes, preferences.allergies, preferences.dislikes]);

  const prepareImages = async (recipes: Recipe[]) => {
    const missing = recipes.filter((recipe) => !recipe.image && !isArchivedRecipe(recipe, archivedRecipes)
      && !pendingImages.current.has(recipeVersion(recipe))
      && !savedRecipes.some((saved) => recipeTitleKey(saved) === recipeTitleKey(recipe) && Boolean(saved.image))).slice(0, 8);
    if (!missing.length) return;
    missing.forEach((recipe) => pendingImages.current.add(recipeVersion(recipe)));
    const job = ++imageJob.current;
    setImageBusy(true);
    setImageMessage('Preparing recipe images in the background…');
    try {
      const saved = await loadRecipeImages(missing, setDiscoveredRecipeImage);
      if (imageJob.current === job) setImageMessage(saved < missing.length ? 'Some recipe images could not be loaded. You can retry below.' : '');
    } catch {
      if (imageJob.current === job) setImageMessage('Recipe images could not be loaded. You can retry below.');
    } finally {
      missing.forEach((recipe) => pendingImages.current.delete(recipeVersion(recipe)));
      if (imageJob.current === job) setImageBusy(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    const recipesMissingImages = savedRecipes
      .filter((recipe) => recipe.source === 'server-ai' && !recipe.image && !isArchivedRecipe(recipe, archivedRecipes))
      .slice(0, 8);
    if (recipesMissingImages.length) void prepareImages(recipesMissingImages);
  }, [hydrated, archivedRecipes]);

  const discover = async (different = false, audience: RecipeSection = 'general', existingController?: AbortController) => {
    const savedMatches = matchingSavedRecipes(savedRecipes, ingredients, preferences, filterState, reservations)
      .filter((recipe) => !isArchivedRecipe(recipe, archivedRecipes) && (audience === 'kids' ? isKidFriendlyRecipe(recipe) : recipe.audience !== 'kids'));
    const controller = existingController ?? new AbortController();
    if (!existingController && !beginSearch('kitchen', controller)) return;
    setDiscoveryBusy(true);
    setDiscoveryError(false);
    setDiscoveryWarning(undefined);
    const timeout = existingController ? null : setTimeout(() => controller.abort(), 180_000);
    try {
      const nextVariation = variation + 1;
      setVariation(nextVariation);
      const request = buildRecipeDiscoveryRequest(
        inventoryPayload,
        preferences,
        filterState,
        `${different ? 'different' : 'refresh'}-${nextVariation}`,
        availableRecipes.map(recipeVersion).slice(-30),
        availableRecipes.map((recipe) => recipe.title).slice(-30),
        archivedRecipes.map((entry) => entry.title).slice(0, 200),
        audience,
      );
      const result = await discoverRecipes(request, { signal: controller.signal });
      if (searchRequest.current !== controller || controller.signal.aborted) return;
      const recipes = novelRecipes(availableRecipes, result.recipes.map((recipe) => mapDiscoveredRecipe(recipe, audience)))
        .filter((recipe) => !isArchivedRecipe(recipe, archivedRecipes));
      if (recipes.length) saveDiscoveredRecipes(recipes);
      setSearch('');
      setResultFilter('All');
      setDiscoveryWarning(recipes.length
        ? `${recipes.length} new recipe${recipes.length === 1 ? '' : 's'} added.${result.warning ? ` ${result.warning}` : ''}`
        : savedMatches.length
          ? 'No new recipes were found. Your saved matching recipes are shown below.'
          : result.warning ?? 'No new recipes were found. Your saved recipes are still available.');
      setDiscoveryBusy(false);
      finishSearch(controller, true);
      void prepareImages([...recipes, ...savedMatches]);
    } catch {
      if (searchRequest.current !== controller) return;
      setDiscoveryError(true);
      setDiscoveryBusy(false);
      finishSearch(controller, false);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const findKids = async () => {
    const confirmed = ingredients.filter((item) => item.status !== 'used' && item.confidence === 'confirmed').map((item) => item.name);
    if (!confirmed.length) { setKidMessage('Add at least one confirmed ingredient to find kids’ meals.'); return; }
    const controller = new AbortController();
    if (!beginSearch('kids', controller)) return;
    setKidMessage('Looking for familiar published recipes first…');
    setDiscoveryError(false);
    const overallTimeout = setTimeout(() => controller.abort(), 180_000);
    const sourceController = new AbortController();
    const abortSource = () => sourceController.abort();
    controller.signal.addEventListener('abort', abortSource);
    const sourceTimeout = setTimeout(abortSource, 25_000);
    try {
      const result = await findExternalRecipes([...new Set(confirmed)].slice(0, 30), preferences.allergies, sourceController.signal,
        undefined,
        [...savedKidPublishedRecipes.map((recipe) => recipe.id), ...archivedRecipes.flatMap((entry) => entry.externalRecipe ? [entry.externalRecipe.id] : [])].slice(-200),
        [...new Set([...archivedRecipes.map((entry) => entry.title), ...availableRecipes.map((recipe) => recipe.title), ...savedKidPublishedRecipes.map((recipe) => recipe.title)])].slice(0, 200), 'kids');
      if (searchRequest.current !== controller || controller.signal.aborted) return;
      const knownIds = new Set(savedKidPublishedRecipes.map((recipe) => recipe.id));
      const knownTitles = new Set([...availableRecipes.map(recipeTitleKey), ...savedKidPublishedRecipes.map(recipeTitleKey)]);
      const newRecipes = result.recipes.filter((recipe) => {
        const title = recipeTitleKey(recipe);
        if (knownIds.has(recipe.id) || knownTitles.has(title) || isArchivedPublished(recipe, archivedRecipes)
          || !publishedRecipeAllowed(recipe, preferences.allergies, preferences.dislikes)) return false;
        knownIds.add(recipe.id);
        knownTitles.add(title);
        return true;
      });
      if (newRecipes.length) {
        saveKidPublishedRecipes(newRecipes);
        setKidMessage(result.safetyNotice);
        finishSearch(controller, true);
        clearTimeout(overallTimeout);
        return;
      }
    } catch {
      if (searchRequest.current !== controller || controller.signal.aborted) return;
    } finally {
      clearTimeout(sourceTimeout);
      controller.signal.removeEventListener('abort', abortSource);
      if (searchRequest.current !== controller || controller.signal.aborted) clearTimeout(overallTimeout);
    }
    if (searchRequest.current !== controller || controller.signal.aborted) return;
    setKidMessage('');
    try {
      await discover(false, 'kids', controller);
    } finally {
      clearTimeout(overallTimeout);
    }
  };

  const findPublished = async () => {
    const searchInput = buildPublishedRecipeSearch(ingredients, publishedDriverIds, { manualSelection: publishedSelectionMode === 'manual' });
    if (!searchInput.anchors.length) { setExternalMessage('Add at least one eligible confirmed ingredient first.'); return; }
    const allergies = [...new Set((Array.isArray(preferences.allergies) ? preferences.allergies : [])
      .filter((allergy): allergy is string => typeof allergy === 'string')
      .map((allergy) => allergy.trim())
      .filter((allergy) => allergy.length > 0 && allergy.length <= 80))]
      .slice(0, 30);
    const controller = new AbortController();
    if (!beginSearch('published', controller)) return;
    setExternalBusy(true);
    setExternalMessage('');
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const result = await findExternalRecipes(
        searchInput.ingredients,
        allergies,
        controller.signal,
        searchInput.anchors,
        [
          ...seenPublishedRecipeIds.current,
          ...archivedRecipes.flatMap((entry) => entry.externalRecipe ? [entry.externalRecipe.id] : []),
        ].slice(0, 200),
        archivedRecipes.map((entry) => entry.title).slice(0, 200),
      );
      if (searchRequest.current !== controller || controller.signal.aborted) return;
      const visible = result.recipes.filter((recipe) => !isArchivedPublished(recipe, archivedRecipes));
      setExternalRecipes(visible);
      setDiscardedExternalRecipeIds([]);
      visible.forEach((recipe) => seenPublishedRecipeIds.current.add(recipe.id));
      setExternalMessage(visible.length
        ? result.safetyNotice
        : 'No new published recipes matched these ingredients. Archived recipes remain hidden.');
      setExternalBusy(false);
      finishSearch(controller, true);
    } catch {
      if (searchRequest.current !== controller) return;
      setExternalMessage('Published recipes are unavailable. Check the connection and TheMealDB setup; saved recipes remain available.');
      setExternalBusy(false);
      finishSearch(controller, false);
    } finally {
      clearTimeout(timeout);
    }
  };

  const openPublishedSearch = () => {
    setPublishedSearchStep('choice');
    setPublishedPickerOpen(true);
  };

  const chooseAutomaticPublishedSearch = () => {
    setPublishedDriverIds(rankedPublishedIngredients.slice(0, MAX_PUBLISHED_SEARCH_ANCHORS).map((ingredient) => ingredient.id));
    setPublishedSelectionMode('automatic');
    setPublishedSearchStep('confirm');
  };

  const savePublishedRecipe = (recipe: ExternalRecipe) => {
    savePublishedRecipes([mapPublishedRecipe(recipe)]);
    setExternalMessage(`“${recipe.title}” was added to your saved recipes. Allergens, nutrition, and cooking safety remain unverified.`);
  };

  const discardPublishedRecipe = (recipe: ExternalRecipe) => {
    setDiscardedExternalRecipeIds((current) => current.includes(recipe.id) ? current : [...current, recipe.id]);
  };

  const confirmPublishedSearch = () => {
    Alert.alert(
      'Find recipes now?',
      'Your selected confirmed ingredients will be sent to the online recipe search service.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Find recipes',
          onPress: () => {
            setPublishedPickerOpen(false);
            void findPublished();
          },
        },
      ],
    );
  };

  const confirmArchiveRecipe = (recipe: Recipe) => Alert.alert(
    `Archive ${recipe.title}?`,
    'This hides the recipe from suggestions and future searches. Saved images and existing planned meals stay available. You can restore it from Archived recipes.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive recipe', onPress: () => archiveRecipe(recipe) }],
  );
  const confirmArchivePublished = (recipe: ExternalRecipe) => Alert.alert(
    `Archive ${recipe.title}?`,
    'This hides the published recipe from future searches. You can restore it from Archived recipes.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive recipe', onPress: () => {
      archivePublishedRecipe(recipe);
      setExternalRecipes((current) => current.filter((item) => item.id !== recipe.id));
    } }],
  );
  const restoreArchived = (entry: ArchivedRecipe) => {
    restoreRecipe(entry.key);
    if (entry.externalRecipe && !savedKidPublishedRecipes.some((item) => item.id === entry.externalRecipe?.id)) setExternalRecipes((current) => current.some((item) => item.id === entry.externalRecipe?.id)
      ? current : [entry.externalRecipe!, ...current]);
  };

  const recipeUsesSoonIngredient = (recipe: (typeof availableRecipes)[number]) => recipe.ingredients.some((ingredient) => ingredients.some((item) =>
    ingredientIdentitiesMatch(ingredient.name, item)
    && item.dateConfirmed === true
    && Boolean(confirmedDateStatus(item.expires)),
  ));
  const publishedMatchedCount = (recipe: ExternalRecipe) => recipe.ingredients.filter((ingredient) => ingredients.some((item) =>
    item.status !== 'used' && item.confidence === 'confirmed' && ingredientIdentitiesMatch(ingredient.name, item),
  )).length;

  const filtered = useMemo(() => availableRecipes.filter((recipe) => {
    if (isArchivedRecipe(recipe, archivedRecipes) || (section === 'kids' ? !isKidFriendlyRecipe(recipe) : recipe.audience === 'kids')) return false;
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
  }).sort((a, b) => section === 'kids'
    ? Number(favoriteRecipeVersions.includes(recipeVersion(b))) - Number(favoriteRecipeVersions.includes(recipeVersion(a)))
    : 0), [archivedRecipes, availableRecipes, cuisine, dietaryPreference, equipment, favoriteRecipeVersions, ingredients, maxMinutes, mealType, minHealthScore, preferences, reservations, resultFilter, search, section]);

  const statusMessage = discoveryBusy
    ? section === 'kids' ? 'No new published match. Preparing a kid-friendly kitchen recipe…' : 'Checking your confirmed kitchen and preparing new ideas…'
    : discoveryError
      ? 'Recipe discovery is unavailable. Saved recipes and the built-in examples are still available offline.'
      : discoveryWarning;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="From what you have" title="Recipes" />
        <View style={[styles.sectionSwitch, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable testID="general-recipes-section" accessibilityRole="tab" accessibilityState={{ selected: section === 'general' }} onPress={() => { setSection('general'); setDiscoveryWarning(undefined); setDiscoveryError(false); }} style={[styles.sectionTab, section === 'general' && { backgroundColor: colors.secondary }]}><Text style={[styles.sectionTabText, { color: section === 'general' ? colors.primary : colors.mutedForeground }]}>General</Text></Pressable>
          <Pressable testID="kids-recipes-section" accessibilityRole="tab" accessibilityState={{ selected: section === 'kids' }} onPress={() => { setSection('kids'); setDiscoveryWarning(undefined); setDiscoveryError(false); }} style={[styles.sectionTab, section === 'kids' && { backgroundColor: colors.secondary }]}><Text style={[styles.sectionTabText, { color: section === 'kids' ? colors.primary : colors.mutedForeground }]}>Kid-friendly</Text></Pressable>
        </View>
        <Pressable testID="archived-recipes-toggle" onPress={() => setArchiveOpen((open) => !open)} style={[styles.archiveToggle, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="archive" size={17} color={colors.primary} /><Text style={[styles.archiveToggleText, { color: colors.foreground }]}>Archived recipes ({archivedRecipes.length})</Text><Feather name={archiveOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} /></Pressable>
        {archiveOpen ? <View style={[styles.archivePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {archivedRecipes.length ? archivedRecipes.map((entry) => <View key={entry.key} style={[styles.archivedRow, { borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.archivedTitle, { color: colors.foreground }]}>{entry.title}</Text><Text style={[styles.archivedSource, { color: colors.mutedForeground }]}>{entry.externalRecipe ? 'Published recipe' : 'Saved recipe'} · hidden from discovery</Text></View><Pressable accessibilityLabel={`Restore ${entry.title}`} onPress={() => restoreArchived(entry)} style={[styles.restoreButton, { backgroundColor: colors.secondary }]}><Text style={[styles.restoreText, { color: colors.primary }]}>Restore</Text></Pressable></View>)
            : <Text style={[styles.serviceText, { color: colors.mutedForeground }]}>No archived recipes yet.</Text>}
        </View> : null}
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search recipes or cuisines" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
          <Feather name="sliders" size={17} color={colors.mutedForeground} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {resultFilters.map((item) => <Chip key={item} label={item} selected={resultFilter === item} onPress={() => setResultFilter(item)} />)}
        </ScrollView>
        {section === 'general' ? <View style={[styles.discoveryCard, { backgroundColor: colors.secondary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.discoveryTitle, { color: colors.secondaryForeground }]}>Discover from your kitchen</Text>
            <Text style={[styles.discoveryBody, { color: colors.secondaryForeground }]}>Only confirmed inventory is sent for recipe matching. Allergies and restrictions are applied before results appear.</Text>
          </View>
          <Pressable testID="discover-recipes" onPress={() => void discover(false)} disabled={Boolean(activeSearch) || !hydrated} style={({ pressed }) => [styles.discoverButton, { backgroundColor: colors.primary }, pressed && styles.pressed, activeSearch && styles.disabled]}>
            <Feather name="star" size={16} color={colors.primaryForeground} />
            <Text style={[styles.discoverButtonText, { color: colors.primaryForeground }]}>{discoveryBusy ? 'Finding' : 'Find recipes'}</Text>
          </Pressable>
        </View> : <View style={[styles.discoveryCard, { backgroundColor: colors.secondary }]}>
          <View style={{ flex: 1 }}><Text style={[styles.discoveryTitle, { color: colors.secondaryForeground }]}>Ideas for picky eaters</Text><Text style={[styles.discoveryBody, { color: colors.secondaryForeground }]}>Find familiar, mild meals using your confirmed kitchen ingredients. Published recipes come first; if none match, we’ll create a new one.</Text></View>
          <Pressable testID="find-kids-recipes" onPress={() => void findKids()} disabled={Boolean(activeSearch) || !hydrated} style={[styles.discoverButton, { backgroundColor: colors.primary }, activeSearch && styles.disabled]}><Text style={[styles.discoverButtonText, { color: colors.primaryForeground }]}>Find kids’ recipes</Text></Pressable>
        </View>}
        {section === 'kids' ? <View style={[styles.serviceMessage, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="info" size={16} color={colors.primary} /><Text style={[styles.serviceText, { color: colors.mutedForeground }]}>Familiar foods are a starting point; each child’s likes vary. Adjust size and texture for your child’s age and supervise meals. Review every ingredient and allergy.</Text></View> : null}
        {statusMessage ? <View style={[styles.serviceMessage, { borderColor: discoveryError ? colors.destructive : colors.border, backgroundColor: colors.card }]}><Feather name={discoveryError ? 'wifi-off' : 'info'} size={16} color={discoveryError ? colors.destructive : colors.primary} /><Text style={[styles.serviceText, { color: colors.mutedForeground }]}>{statusMessage}</Text></View> : null}
        {imageMessage ? <View style={[styles.serviceMessage, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="image" size={16} color={colors.primary} /><Text style={[styles.serviceText, { color: colors.mutedForeground }]}>{imageMessage}</Text>{!imageBusy && savedRecipes.some((recipe) => recipe.source === 'server-ai' && !recipe.image && !isArchivedRecipe(recipe, archivedRecipes)) ? <Pressable testID="retry-recipe-images" onPress={() => void prepareImages(savedRecipes.filter((recipe) => recipe.source === 'server-ai' && !recipe.image && !isArchivedRecipe(recipe, archivedRecipes)).slice(0, 8))}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Retry</Text></Pressable> : null}</View> : null}
        {section === 'general' ? <View style={[styles.discoveryCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}><View style={{ flex: 1 }}><Text style={[styles.discoveryTitle, { color: colors.foreground }]}>Recipes from published sources</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>Find real recipes through TheMealDB using your confirmed ingredients. Choose automatic or manual search anchors after pressing Find online.</Text></View><Pressable testID="find-published-recipes" disabled={Boolean(activeSearch) || !hydrated} onPress={openPublishedSearch} style={[styles.discoverButton, { backgroundColor: colors.primary }]}><Text style={[styles.discoverButtonText, { color: colors.primaryForeground }]}>{externalBusy ? 'Finding' : 'Find online'}</Text></Pressable></View> : null}
        {(section === 'kids' ? kidMessage : externalMessage) ? <Text style={[styles.serviceText, { color: colors.mutedForeground, marginTop: 8 }]}>{section === 'kids' ? kidMessage : externalMessage}</Text> : null}
        {section === 'general' && visibleExternalRecipes.length ? <View style={styles.externalResultsHeader}>
          <View>
            <Text style={[styles.externalResultsTitle, { color: colors.foreground }]}>{visibleExternalRecipes.length} recipe{visibleExternalRecipes.length === 1 ? '' : 's'} found</Text>
            <Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>Best ingredient matches first · Swipe to browse</Text>
          </View>
          <Feather name="arrow-right" size={18} color={colors.primary} />
        </View> : null}
        {section === 'general' && visibleExternalRecipes.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={302} contentContainerStyle={styles.externalResults}>
        {visibleExternalRecipes.map((item) => {
          const saved = savedRecipes.some((recipe) => recipeVersion(recipe) === publishedRecipeVersion(item.id) || recipeTitleKey(recipe) === recipeTitleKey({ title: item.title }));
          return <View key={item.id} style={[styles.externalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.externalImage} /> : null}
            <View style={styles.externalCardBody}>
              <Text style={[styles.externalTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>{item.provider} · {item.matchedIngredients.length} matching · {item.missingIngredients.length} missing</Text>
              <Text style={[styles.resultIngredientText, { color: colors.primary }]}>Have: {item.matchedIngredients.join(', ') || 'No matched ingredients listed'}</Text>
              <Text style={[styles.resultIngredientText, { color: item.missingIngredients.length ? colors.destructive : colors.primary }]}>{item.missingIngredients.length ? `Missing: ${item.missingIngredients.join(', ')}` : 'All required ingredients are in your confirmed kitchen.'}</Text>
              <Text style={[styles.discoveryBody, { color: colors.accentForeground }]}>Allergens, quantities, nutrition, and cooking safety are unverified.</Text>
              <View style={styles.externalActions}>
                <Pressable onPress={() => void Linking.openURL(item.sourceUrl)} style={[styles.outlineButton, { borderColor: colors.border }]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>Open source ↗</Text></Pressable>
                <Pressable disabled={saved} onPress={() => savePublishedRecipe(item)} style={[styles.outlineButton, { borderColor: colors.border, backgroundColor: saved ? colors.muted : colors.secondary }]}><Text style={[styles.outlineButtonText, { color: saved ? colors.mutedForeground : colors.primary }]}>{saved ? 'Saved' : 'Add recipe'}</Text></Pressable>
                <Pressable onPress={() => discardPublishedRecipe(item)} style={[styles.outlineButton, { borderColor: colors.border }]}><Text style={[styles.outlineButtonText, { color: colors.destructive }]}>Discard</Text></Pressable>
                <Pressable accessibilityLabel={`Archive ${item.title}`} onPress={() => confirmArchivePublished(item)} style={[styles.outlineButton, { borderColor: colors.border }]}><Feather name="archive" size={15} color={colors.mutedForeground} /><Text style={[styles.outlineButtonText, { color: colors.mutedForeground }]}>Archive</Text></Pressable>
              </View>
            </View>
          </View>;
        })}
        </ScrollView> : null}
        {section === 'kids' && savedKidPublishedRecipes.filter((item) => !isArchivedPublished(item, archivedRecipes) && publishedRecipeAllowed(item, preferences.allergies, preferences.dislikes)).map((item) => <View key={item.id} style={[styles.kidExternalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.kidExternalImage} /> : null}<Pressable onPress={() => void Linking.openURL(item.sourceUrl)} style={{ flex: 1 }}><Text style={[styles.externalTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>{item.provider} · {publishedMatchedCount(item)} matching ingredients · {item.ingredients.length - publishedMatchedCount(item)} to check</Text><Text style={[styles.discoveryBody, { color: colors.accentForeground }]}>Allergens and quantities unverified. Open original recipe ↗</Text></Pressable><Pressable accessibilityLabel={`Archive ${item.title}`} onPress={() => confirmArchivePublished(item)} style={styles.archiveIconButton}><Feather name="archive" size={17} color={colors.mutedForeground} /></Pressable></View>)}
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
          <View><Text style={[styles.heading, { color: colors.foreground }]}>{resultFilter === 'All' ? 'A good place to start' : resultFilter}</Text><Text style={[styles.subheading, { color: colors.mutedForeground }]}>{visibleSavedCount ? `${visibleSavedCount} saved discover${visibleSavedCount === 1 ? 'y' : 'ies'} available offline` : ingredients.length ? 'Matched against your confirmed kitchen' : 'Add confirmed ingredients to make suggestions personal'}</Text></View>
          <Pressable testID="different-recipes" onPress={() => void (section === 'kids' ? findKids() : discover(true))} disabled={Boolean(activeSearch) || !hydrated} style={({ pressed }) => [styles.differentButton, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed, activeSearch && styles.disabled]}><Feather name="shuffle" size={15} color={colors.primary} /></Pressable>
        </View>
        {filtered.length ? filtered.map((recipe) => {
          const safety = recipeReadiness(recipe, ingredients, preferences.allergies, preferences.servings, reservations);
          const availability = recipeAvailabilityLabel(safety);
          const usesSoon = recipeUsesSoonIngredient(recipe);
          return <RecipeCard key={recipeVersion(recipe)} recipe={recipe} hasIngredients={safety.ready} statusText={usesSoon ? `${availability} · Use soon` : availability} favorite={favoriteRecipeVersions.includes(recipeVersion(recipe))} onFavorite={() => toggleFavoriteRecipe(recipe)} onArchive={() => confirmArchiveRecipe(recipe)} onPress={() => router.push(`/recipe/${recipe.id}`)} />;
        }) : <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No recipes match those filters</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Try a different category, clear a filter, or discover another set of recipes.</Text></View>}
      </ScrollView>
      <Modal visible={Boolean(activeSearch)} transparent animationType="fade" onRequestClose={cancelSearch}>
        <View style={styles.progressBackdrop}>
          <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.progressTitle, { color: colors.foreground }]}>{activeSearch?.kind === 'published' ? 'Finding online recipes' : activeSearch?.kind === 'kids' ? 'Finding kid-friendly recipes' : 'Finding recipes from your kitchen'}</Text>
            <Text style={[styles.progressPercent, { color: colors.primary }]}>{progressPercent}%</Text>
            <View testID="recipe-search-progress" accessibilityRole="progressbar" accessibilityLabel="Estimated recipe search progress" accessibilityValue={{ min: 0, max: 100, now: progressPercent }} style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progressPercent}%` }]} />
            </View>
            <Text style={[styles.progressNote, { color: colors.mutedForeground }]}>{activeSearch?.complete ? 'Recipes are ready. Images may continue to appear.' : 'Estimated progress while we wait for the recipe response.'}</Text>
            {!activeSearch?.complete ? <Pressable testID="cancel-recipe-search" accessibilityRole="button" onPress={cancelSearch} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel search</Text></Pressable> : null}
          </View>
        </View>
      </Modal>
      <Modal visible={publishedPickerOpen} transparent animationType="slide" onRequestClose={() => setPublishedPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card }]}>
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.progressTitle, { color: colors.foreground }]}>{publishedSearchStep === 'choice' ? 'Choose how to search' : publishedSearchStep === 'manual' ? 'Choose search ingredients' : 'Confirm search ingredients'}</Text>
                <Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>{publishedSearchStep === 'choice' ? 'Automatic ranking uses up to 30 confirmed ingredients. Manual selection starts empty.' : publishedSearchStep === 'manual' ? `${publishedDriverIds.length} of ${MAX_PUBLISHED_SEARCH_ANCHORS} selected` : `${publishedSelectionMode === 'automatic' ? 'Automatically selected' : 'Manually selected'} · ${publishedDriverIds.length} ingredients`}</Text>
              </View>
              <Pressable testID="close-published-ingredients" onPress={() => setPublishedPickerOpen(false)} style={[styles.outlineButton, { borderColor: colors.border }]}>
                <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Close</Text>
              </Pressable>
            </View>
            {publishedSearchStep === 'choice' ? <View style={styles.searchChoiceList}>
              <Pressable testID="published-ingredients-auto" onPress={chooseAutomaticPublishedSearch} style={[styles.searchChoice, { borderColor: colors.border, backgroundColor: colors.secondary }]}><Feather name="zap" size={21} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.searchOptionsTitle, { color: colors.foreground }]}>Automatic selection</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>Rank known quantities and manual/photo confirmations, then show up to 30 ingredients for approval.</Text></View></Pressable>
              <Pressable testID="published-ingredients-manual" onPress={() => { setPublishedDriverIds([]); setPublishedSelectionMode('manual'); setPublishedSearchStep('manual'); }} style={[styles.searchChoice, { borderColor: colors.border, backgroundColor: colors.background }]}><Feather name="check-square" size={21} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.searchOptionsTitle, { color: colors.foreground }]}>Choose manually</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>Start with nothing selected, then choose up to 30 ingredients grouped by food type.</Text></View></Pressable>
            </View> : null}
            {publishedSearchStep === 'manual' ? <ScrollView style={styles.pickerList} contentContainerStyle={{ gap: 14 }}>
              {groupedPublishedIngredients.map((group) => {
                return <View key={group.category} style={{ gap: 8 }}><Text style={[styles.pickerCategory, { color: colors.foreground }]}>{group.category}</Text>{group.ingredients.map((ingredient) => {
                  const selected = publishedDriverIds.includes(ingredient.id);
                  const disabled = !selected && publishedDriverIds.length >= MAX_PUBLISHED_SEARCH_ANCHORS;
                  return <Pressable key={ingredient.id} testID={`published-ingredient-${ingredient.id}`} disabled={disabled} onPress={() => setPublishedDriverIds((current) => selected ? current.filter((id) => id !== ingredient.id) : [...current, ingredient.id])} style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: selected ? colors.secondary : colors.background }, disabled && styles.disabled]}>
                    <Feather name={selected ? 'check-square' : 'square'} size={19} color={selected ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}><Text style={[styles.pickerIngredient, { color: colors.foreground }]}>{ingredient.name}</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>{ingredient.quantityKnown ? 'Known quantity' : 'Quantity to confirm'}{ingredient.source === 'manual' ? ' · Manual' : ingredient.source === 'scan' ? ' · Photo scan' : ''}</Text></View>
                  </Pressable>;
                })}</View>;
              })}
              {!rankedPublishedIngredients.length ? <Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>No eligible confirmed ingredients are available. Common seasonings and used ingredients are excluded from anchors.</Text> : null}
            </ScrollView> : null}
            {publishedSearchStep === 'confirm' ? <ScrollView style={styles.pickerList} contentContainerStyle={{ gap: 14 }}>
              <Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>These ingredients will drive the TheMealDB search. Up to 30 confirmed pantry ingredients are sent for matching.</Text>
              {groupedPublishedIngredients.map((group) => {
                const selected = group.ingredients.filter((ingredient) => publishedDriverIds.includes(ingredient.id));
                if (!selected.length) return null;
                return <View key={group.category} style={{ gap: 8 }}><Text style={[styles.pickerCategory, { color: colors.foreground }]}>{group.category}</Text>{selected.map((ingredient) => <View key={ingredient.id} style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}><Feather name="check-square" size={19} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.pickerIngredient, { color: colors.foreground }]}>{ingredient.name}</Text><Text style={[styles.discoveryBody, { color: colors.mutedForeground }]}>{ingredient.quantityKnown ? 'Known quantity' : 'Quantity to confirm'}{ingredient.source === 'manual' ? ' · Manual' : ingredient.source === 'scan' ? ' · Photo scan' : ''}</Text></View></View>)}</View>;
              })}
            </ScrollView> : null}
            {publishedSearchStep === 'manual' ? <View style={styles.manualActions}>
              <Pressable onPress={() => setPublishedSearchStep('choice')} style={({ pressed }) => [styles.manualBackButton, { borderColor: colors.border, backgroundColor: colors.background }, pressed && styles.pressed]}>
                <Feather name="arrow-left" size={17} color={colors.primary} />
                <Text style={[styles.confirmBackText, { color: colors.primary }]}>Back</Text>
              </Pressable>
              <Pressable disabled={!publishedDriverIds.length} onPress={() => setPublishedSearchStep('confirm')} style={({ pressed }) => [styles.manualReviewButton, { backgroundColor: publishedDriverIds.length ? colors.primary : colors.muted }, pressed && styles.pressed]}>
                <Text style={[styles.outlineButtonText, { color: publishedDriverIds.length ? colors.primaryForeground : colors.mutedForeground }]}>Review {publishedDriverIds.length} selected</Text>
                <Feather name="arrow-right" size={17} color={publishedDriverIds.length ? colors.primaryForeground : colors.mutedForeground} />
              </Pressable>
            </View> : null}
            {publishedSearchStep === 'confirm' ? <View style={[styles.confirmActions, { borderTopColor: colors.border }]}>
              <Pressable onPress={() => setPublishedSearchStep(publishedSelectionMode === 'manual' ? 'manual' : 'choice')} style={({ pressed }) => [styles.confirmBackButton, { borderColor: colors.border, backgroundColor: colors.background }, pressed && styles.pressed]}>
                <Feather name="arrow-left" size={18} color={colors.primary} />
                <Text style={[styles.confirmBackText, { color: colors.primary }]}>Back</Text>
              </Pressable>
              <Pressable testID="confirm-published-search" onPress={confirmPublishedSearch} style={({ pressed }) => [styles.confirmFindButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={[styles.confirmFindText, { color: colors.primaryForeground }]}>Find recipes</Text>
                <Feather name="search" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  sectionSwitch: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, padding: 4, marginBottom: 12 },
  sectionTab: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTabText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
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
  progressBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  progressCard: { width: '100%', maxWidth: 390, borderRadius: 22, padding: 24, alignItems: 'center' },
  progressTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  progressPercent: { fontSize: 34, fontFamily: 'Inter_700Bold', marginTop: 18 },
  progressTrack: { width: '100%', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: '100%', borderRadius: 6 },
  progressNote: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14 },
  cancelButton: { marginTop: 20, minHeight: 44, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  externalResultsHeader: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  externalResultsTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  externalResults: { gap: 12, paddingVertical: 12, paddingRight: 20 },
  externalCard: { width: 290, borderWidth: 1, borderRadius: 20, padding: 12, overflow: 'hidden' },
  kidExternalCard: { borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 10 },
  kidExternalImage: { width: 64, height: 64, borderRadius: 10 },
  externalImage: { width: '100%', height: 132, borderRadius: 14, marginBottom: 12 },
  externalCardBody: { flex: 1 },
  externalTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  searchOptions: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  searchOptionsTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  outlineButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.62)', justifyContent: 'flex-end' },
  pickerCard: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  pickerList: { maxHeight: 470 },
  pickerRow: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerIngredient: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  autoButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  searchChoiceList: { gap: 10 },
  searchChoice: { minHeight: 82, borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerCategory: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  confirmSelection: { gap: 12 },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  manualActions: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  manualBackButton: { minHeight: 48, minWidth: 96, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  manualReviewButton: { flex: 1, minHeight: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBackButton: { minHeight: 50, minWidth: 104, borderRadius: 16, borderWidth: 1, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmBackText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  confirmFindButton: { flex: 1, minHeight: 50, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  confirmFindText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  resultIngredientText: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  externalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  archiveToggle: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  archiveToggleText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  archivePanel: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  archivedRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  archivedTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  archivedSource: { fontSize: 11, marginTop: 3 },
  restoreButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11, justifyContent: 'center' },
  restoreText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  archiveIconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
