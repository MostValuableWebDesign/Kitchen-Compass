import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { formatTemperature } from '@/data/recipes';
import { scaledIngredient, scaledNutrition } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';
import { ingredientIdentitiesMatch, recipeAvailabilityLabel, recipeMatchesPreferences, recipeReadiness } from '@/lib/kitchenLogic';
import { recipeVersion } from '@/lib/recipeDiscovery';
import { lookupRecipe } from '@/lib/recipeLookup';

export default function RecipeDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, plannedMealId: requestedPlannedMealId } = useLocalSearchParams<{ id: string; plannedMealId?: string }>();
  const { ingredients, preferences, reservations, plan, savedRecipes, favoriteRecipeVersions, toggleFavoriteRecipe } = useKitchen();
  const requestedId = Array.isArray(requestedPlannedMealId) ? requestedPlannedMealId[0] : requestedPlannedMealId;
  const plannedOccurrences = plan.filter((meal) => meal.recipeId === id);
  const plannedMeal = plannedOccurrences.find((meal) => meal.id === requestedId)
    ?? (plannedOccurrences.length === 1 ? plannedOccurrences[0] : undefined);
  const recipe = lookupRecipe(id, savedRecipes, plannedMeal?.recipeVersion);
  if (!recipe) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card }]}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable>
        <View style={styles.unavailable}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={[styles.unavailableTitle, { color: colors.foreground }]}>Recipe unavailable</Text>
          <Text style={[styles.unavailableBody, { color: colors.mutedForeground }]}>This planned recipe version is no longer saved. The meal plan is preserved and no other recipe was substituted.</Text>
        </View>
      </View>
    );
  }
  const required = recipe.ingredients.filter((item) => item.required !== false);
  const have = (name: string) => ingredients.some((item) => ingredientIdentitiesMatch(name, item));
  const eligible = recipeMatchesPreferences(recipe, preferences);
  const servingTarget = plannedMeal?.servings ?? preferences.servings;
  const safety = recipeReadiness(recipe, ingredients, preferences.allergies, servingTarget, reservations, plannedMeal?.id);
  const nutrition = scaledNutrition(recipe, servingTarget);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 35 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>{recipe.image ? <Image source={recipe.image} contentFit="cover" style={styles.heroImage} /> : <View style={[styles.heroImage, styles.placeholderHero, { backgroundColor: colors.secondary }]}><Ionicons name="restaurant-outline" size={46} color={colors.primary} /><Text style={[styles.placeholderText, { color: colors.secondaryForeground }]}>Finished-dish image unavailable</Text></View>}<Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.background }]}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable></View>
        <View style={styles.content}>
           <View style={styles.detailHeader}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.foreground }]}>{recipe.title}</Text><Text style={[styles.description, { color: colors.mutedForeground }]}>{recipe.description}</Text></View><View style={styles.headerActions}><Pressable testID="favorite-detail" onPress={() => toggleFavoriteRecipe(recipe)} style={[styles.favoriteButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name={favoriteRecipeVersions.includes(recipeVersion(recipe)) ? 'heart' : 'heart-outline'} size={21} color={favoriteRecipeVersions.includes(recipeVersion(recipe)) ? colors.destructive : colors.mutedForeground} /></Pressable><View style={[styles.score, { backgroundColor: colors.secondary }]}><Text style={[styles.scoreNumber, { color: colors.primary }]}>{recipe.healthScore.score ?? '—'}</Text><Text style={[styles.scoreLabel, { color: colors.primary }]}>score</Text></View></View></View>
          <View style={styles.stats}>{[[`${recipe.prep}m`, 'prep'], [`${recipe.cook}m`, 'cook'], [recipe.difficulty, 'level']].map(([value, label]) => <View key={label} style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>)}</View>
           <View style={[styles.scoreNote, { backgroundColor: colors.accent }]}><Ionicons name="leaf-outline" size={18} color={colors.accentForeground} /><View style={{ flex: 1 }}><Text style={[styles.scoreNoteText, { color: colors.accentForeground }]}>{safety.allergenConflict ? 'This recipe conflicts with a saved allergy and is excluded.' : safety.allergenIncomplete ? 'Allergen information incomplete — this recipe is not labeled allergy-safe.' : `${recipeAvailabilityLabel(safety)} · ${recipe.healthScore.note}`}</Text>{recipe.healthScore.factors.map((factor) => <Text key={factor.key} style={[styles.factorText, { color: colors.accentForeground }]}>{factor.direction === 'positive' ? '+' : '−'} {factor.label}: {factor.detail}</Text>)}</View></View>
           <Text style={[styles.section, { color: colors.foreground }]}>Ingredients · {servingTarget} servings</Text>
            <View style={[styles.ingredientsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{recipe.ingredients.map((item) => { const scaled = scaledIngredient(recipe, item, servingTarget); return <View key={item.name} style={styles.ingredientLine}><Ionicons name={item.required === false ? 'ellipse-outline' : have(item.name) ? 'checkmark-circle' : 'alert-circle-outline'} size={18} color={item.required === false ? colors.mutedForeground : have(item.name) ? colors.primary : colors.destructive} /><Text style={[styles.ingredientText, { color: colors.foreground }]}><Text style={{ fontFamily: 'Inter_700Bold' }}>{scaled.quantity} {scaled.unit}</Text> {item.name}{item.required === false ? ' · optional' : ''}</Text><Text style={[styles.haveText, { color: item.required === false ? colors.mutedForeground : have(item.name) ? colors.primary : colors.destructive }]}>{item.required === false ? '' : have(item.name) ? 'have' : 'missing'}</Text></View>; })}</View>
            <Text style={[styles.section, { color: colors.foreground }]}>Nutrition · per serving</Text>
              <View style={[styles.nutrition, { backgroundColor: colors.card, borderColor: colors.border }]}>{nutrition.status === 'calculated' && nutrition.perServing ? [['Calories', `${nutrition.perServing.calories}`], ['Protein', `${nutrition.perServing.protein}g`], ['Carbs', `${nutrition.perServing.carbs}g`], ['Fat', `${nutrition.perServing.fat}g`], ['Fiber', `${nutrition.perServing.fiber}g`], ['Sodium', `${nutrition.perServing.sodium}mg`]].map(([label, value]) => <View key={label} style={styles.nutritionItem}><Text style={[styles.nutritionValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>{label}</Text></View>) : <Text style={[styles.insufficientText, { color: colors.accentForeground }]}>Insufficient information for a reliable nutrition calculation.</Text>}<Text style={[styles.nutritionNote, { color: colors.mutedForeground }]}>{nutrition.status === 'calculated' ? `${nutrition.ingredientCoverage * 100}% of ingredient quantities covered. ${nutrition.source.label}` : `Unsupported or missing reference data: ${nutrition.uncoveredIngredients.join(', ') || 'servings'}.`}</Text></View>
           <Text style={[styles.section, { color: colors.foreground }]}>Equipment</Text><View style={styles.chips}>{recipe.equipment.map((item) => <Chip key={item} label={item} />)}</View>
            {recipe.substitutions?.length ? <><Text style={[styles.section, { color: colors.foreground }]}>Validated substitutions</Text><View style={[styles.substitutionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{recipe.substitutions.filter((item) => item.validated).map((item) => <View key={`${item.from}-${item.to}`} style={styles.substitutionLine}><Ionicons name="swap-horizontal-outline" size={17} color={colors.primary} /><Text style={[styles.substitutionText, { color: colors.foreground }]}><Text style={{ fontFamily: 'Inter_700Bold' }}>{item.from} → {item.to}</Text>{` · ${item.reason}`}</Text></View>)}</View></> : null}
             <Text style={[styles.section, { color: colors.foreground }]}>Method · {recipe.steps.length} steps</Text><View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{recipe.steps.map((step, index) => <View key={`${step.title}-${index}`} style={styles.stepLine}><View style={[styles.stepNumber, { backgroundColor: colors.secondary }]}><Text style={[styles.stepNumberText, { color: colors.primary }]}>{step.order}</Text></View><View style={{ flex: 1 }}><Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text><Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{step.body}</Text>{step.duration ? <Text style={[styles.stepMeta, { color: colors.primary }]}>⏱ {step.duration} min</Text> : null}{step.temperature ? <Text style={[styles.stepMeta, { color: colors.primary }]}>🌡 {formatTemperature(step.temperature, 'F')}</Text> : null}{step.safetyTemperature ? <Text style={[styles.stepSafety, { color: colors.destructive }]}>Safety: {step.safetyTemperature.food} to {formatTemperature(step.safetyTemperature.temperature, 'F')}</Text> : null}{step.ingredientAmounts?.length ? <View style={styles.stepAmounts}>{step.ingredientAmounts.map((item) => { const scaled = scaledIngredient(recipe, { name: item.name, amount: '', quantity: item.quantity, unit: item.unit }, servingTarget); return <Text key={`${item.name}-${item.note ?? ''}`} style={[styles.amountText, { color: colors.foreground }]}>{scaled.quantity} {scaled.unit} {item.name}{item.note ? ` · ${item.note}` : ''}</Text>; })}</View> : step.ingredients?.length ? <Text style={[styles.stepMeta, { color: colors.mutedForeground }]}>Uses: {step.ingredients.join(' · ')}</Text> : null}{step.cues.length ? <Text style={[styles.stepNote, { color: colors.mutedForeground }]}>Look for: {step.cues.join(' ')}</Text> : null}{step.mistakes.length ? <Text style={[styles.stepNote, { color: colors.mutedForeground }]}>Avoid: {step.mistakes.join(' ')}</Text> : null}</View></View>)}</View>
             {recipe.methods?.length ? <><Text style={[styles.section, { color: colors.foreground }]}>Complete alternatives</Text><View style={[styles.alternativesCard, { backgroundColor: colors.secondary }]}>{recipe.methods.map((method) => <View key={method.id} style={styles.alternativeLine}><Text style={[styles.alternativeTitle, { color: colors.secondaryForeground }]}>{method.title}</Text><Text style={[styles.alternativeBody, { color: colors.secondaryForeground }]}>{method.description} · {method.steps.length} complete steps · {method.equipment.join(', ')}</Text></View>)}</View></> : null}
             <Text style={[styles.section, { color: colors.foreground }]}>Serving and storage</Text><View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{recipe.servingSuggestions?.map((item) => <Text key={item} style={[styles.infoText, { color: colors.foreground }]}>• {item}</Text>)}<Text style={[styles.infoLabel, { color: colors.foreground }]}>Storage</Text><Text style={[styles.infoText, { color: colors.mutedForeground }]}>{recipe.storageInstructions}</Text><Text style={[styles.infoLabel, { color: colors.foreground }]}>Reheating</Text><Text style={[styles.infoText, { color: colors.mutedForeground }]}>{recipe.reheatingInstructions}</Text>{recipe.commonMistakes?.length ? <><Text style={[styles.infoLabel, { color: colors.foreground }]}>Common mistakes</Text>{recipe.commonMistakes.map((item) => <Text key={item} style={[styles.infoText, { color: colors.mutedForeground }]}>• {item}</Text>)}</> : null}</View>
            <Text style={[styles.versionNote, { color: colors.mutedForeground }]}>Recipe version {recipeVersion(recipe)} · {recipe.source === 'server-ai' ? 'server-validated discovery' : 'curated example'}</Text>
           {plannedOccurrences.length ? <View style={[styles.occurrenceCard, { backgroundColor: colors.secondary }]}><Text style={[styles.occurrenceTitle, { color: colors.secondaryForeground }]}>Choose the planned meal to cook</Text><View style={styles.chips}>{plannedOccurrences.map((meal) => <Chip key={meal.id} label={`${meal.day} · ${meal.meal}`} selected={plannedMeal?.id === meal.id} onPress={() => router.setParams({ plannedMealId: meal.id })} />)}</View><Text style={[styles.occurrenceNote, { color: colors.secondaryForeground }]}>{plannedOccurrences.length > 1 && !plannedMeal ? 'This recipe is planned more than once. Select the exact occurrence before cooking.' : 'This selection controls which reservation is used and deducted.'}</Text></View> : null}
            <Pressable disabled={!safety.ready || !eligible || !plannedMeal} testID="start-cooking" onPress={() => plannedMeal && router.push(`/cook/${recipe.id}?plannedMealId=${plannedMeal.id}`)} style={({ pressed }) => [styles.cookButton, { backgroundColor: safety.ready && eligible && plannedMeal ? colors.primary : colors.muted }, pressed && styles.pressed]}><Ionicons name="flame-outline" size={21} color={safety.ready && eligible && plannedMeal ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.cookText, { color: safety.ready && eligible && plannedMeal ? colors.primaryForeground : colors.mutedForeground }]}>{safety.allergenConflict ? 'Excluded for allergy' : safety.allergenIncomplete ? 'Allergen review needed' : !eligible ? 'Excluded by preferences' : !plannedMeal ? 'Plan this meal first' : 'Start cooking'}</Text></Pressable>
           {safety.missingIngredients.length ? <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Missing: {safety.missingIngredients.join(', ')}.</Text> : null}
           {safety.insufficientIngredients.length ? <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Not enough: {safety.insufficientIngredients.join(', ')}.</Text> : null}
           {safety.quantityCheckIngredients.length ? <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Quantity check needed: {safety.quantityCheckIngredients.join(', ')}.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  unavailableTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  unavailableBody: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  heroWrap: { height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  placeholderHero: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  backButton: { position: 'absolute', top: 56, left: 18, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 22 },
  detailHeader: { flexDirection: 'row', gap: 15 },
  headerActions: { alignItems: 'center', gap: 8 },
  favoriteButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 35, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  score: { width: 57, height: 57, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  scoreLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 20 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 15, paddingVertical: 11, alignItems: 'center' },
  statValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, marginTop: 3 },
  scoreNote: { borderRadius: 15, padding: 12, flexDirection: 'row', gap: 9, marginTop: 15 },
  scoreNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  factorText: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  section: { fontSize: 19, fontFamily: 'Inter_700Bold', marginTop: 27, marginBottom: 12 },
  ingredientsCard: { borderWidth: 1, borderRadius: 18, padding: 14 },
  ingredientLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 35 },
  ingredientText: { flex: 1, fontSize: 13, lineHeight: 18 },
  haveText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  nutrition: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', flexWrap: 'wrap' },
  nutritionItem: { width: '33.33%', paddingVertical: 7 },
  nutritionValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  nutritionLabel: { fontSize: 10, marginTop: 2 },
  nutritionNote: { width: '100%', fontSize: 10, lineHeight: 15, marginTop: 8 },
  insufficientText: { width: '100%', fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  substitutionCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 11 },
  substitutionLine: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  substitutionText: { flex: 1, fontSize: 12, lineHeight: 18 },
  stepsCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 16 },
  stepLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  stepTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  stepBody: { fontSize: 12, lineHeight: 18 },
  stepMeta: { fontSize: 11, lineHeight: 17, marginTop: 7, fontFamily: 'Inter_600SemiBold' },
  stepSafety: { fontSize: 11, lineHeight: 17, marginTop: 4, fontFamily: 'Inter_700Bold' },
  stepAmounts: { marginTop: 7, gap: 2 },
  amountText: { fontSize: 11, lineHeight: 16 },
  stepNote: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  alternativesCard: { borderRadius: 18, padding: 14, gap: 12 },
  alternativeLine: { gap: 3 },
  alternativeTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  alternativeBody: { fontSize: 12, lineHeight: 18 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 5 },
  infoLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 8 },
  infoText: { fontSize: 12, lineHeight: 18 },
  versionNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 18 },
  occurrenceCard: { borderRadius: 16, padding: 13, marginTop: 24 },
  occurrenceTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 9 },
  occurrenceNote: { fontSize: 11, lineHeight: 16, marginTop: 9 },
  cookButton: { height: 54, borderRadius: 17, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  cookText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  pressed: { opacity: 0.72 },
});