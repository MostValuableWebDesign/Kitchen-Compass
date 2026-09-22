import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { getRecipe } from '@/data/recipes';
import { scaledIngredient, scaledNutrition } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';
import { ingredientIdentitiesMatch, recipeReadiness } from '@/lib/kitchenLogic';

export default function RecipeDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = getRecipe(id);
  const { ingredients, preferences } = useKitchen();
  const required = recipe.ingredients.filter((item) => item.required !== false);
  const have = (name: string) => ingredients.some((item) => ingredientIdentitiesMatch(name, item));
  const safety = recipeReadiness(recipe, ingredients, preferences.allergies);
  const nutrition = scaledNutrition(recipe, preferences.servings);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 35 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>{recipe.image ? <Image source={recipe.image} contentFit="cover" style={styles.heroImage} /> : <View style={[styles.heroImage, { backgroundColor: colors.secondary }]}><Ionicons name="restaurant-outline" size={46} color={colors.primary} /></View>}<Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.background }]}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable></View>
        <View style={styles.content}>
          <View style={styles.detailHeader}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.foreground }]}>{recipe.title}</Text><Text style={[styles.description, { color: colors.mutedForeground }]}>{recipe.description}</Text></View><View style={[styles.score, { backgroundColor: colors.secondary }]}><Text style={[styles.scoreNumber, { color: colors.primary }]}>{recipe.score}</Text><Text style={[styles.scoreLabel, { color: colors.primary }]}>score</Text></View></View>
          <View style={styles.stats}>{[[`${recipe.prep}m`, 'prep'], [`${recipe.cook}m`, 'cook'], [recipe.difficulty, 'level']].map(([value, label]) => <View key={label} style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>)}</View>
           <View style={[styles.scoreNote, { backgroundColor: colors.accent }]}><Ionicons name="leaf-outline" size={18} color={colors.accentForeground} /><Text style={[styles.scoreNoteText, { color: colors.accentForeground }]}>{safety.allergenConflict ? 'This recipe conflicts with a saved allergy and is excluded.' : safety.allergenIncomplete ? 'Allergen information incomplete — this recipe is not labeled allergy-safe.' : recipe.scoreNote} This is an app-defined estimate, not medical advice.</Text></View>
          <Text style={[styles.section, { color: colors.foreground }]}>Ingredients · {preferences.servings} servings</Text>
           <View style={[styles.ingredientsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{recipe.ingredients.map((item) => { const scaled = scaledIngredient(recipe, item, preferences.servings); return <View key={item.name} style={styles.ingredientLine}><Ionicons name={item.required === false ? 'ellipse-outline' : have(item.name) ? 'checkmark-circle' : 'alert-circle-outline'} size={18} color={item.required === false ? colors.mutedForeground : have(item.name) ? colors.primary : colors.destructive} /><Text style={[styles.ingredientText, { color: colors.foreground }]}><Text style={{ fontFamily: 'Inter_700Bold' }}>{scaled.quantity} {scaled.unit}</Text> {item.name}{item.required === false ? ' · optional' : ''}</Text><Text style={[styles.haveText, { color: item.required === false ? colors.mutedForeground : have(item.name) ? colors.primary : colors.destructive }]}>{item.required === false ? '' : have(item.name) ? 'have' : 'missing'}</Text></View>; })}</View>
          <Text style={[styles.section, { color: colors.foreground }]}>Estimated nutrition</Text>
           <View style={[styles.nutrition, { backgroundColor: colors.card, borderColor: colors.border }]}>{[['Calories', `${nutrition.calories}`], ['Protein', `${nutrition.protein}g`], ['Carbs', `${nutrition.carbs}g`], ['Fat', `${nutrition.fat}g`], ['Fiber', `${nutrition.fiber}g`], ['Sodium', `${nutrition.sodium}mg`]].map(([label, value]) => <View key={label} style={styles.nutritionItem}><Text style={[styles.nutritionValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>{label}</Text></View>)}<Text style={[styles.nutritionNote, { color: colors.mutedForeground }]}>Estimated recipe total for {preferences.servings} servings · {recipe.nutritionSource}</Text></View>
          <Text style={[styles.section, { color: colors.foreground }]}>Equipment</Text><View style={styles.chips}>{recipe.equipment.map((item) => <Chip key={item} label={item} />)}</View>
           <Pressable disabled={!safety.ready} testID="start-cooking" onPress={() => router.push(`/cook/${recipe.id}`)} style={({ pressed }) => [styles.cookButton, { backgroundColor: safety.ready ? colors.primary : colors.muted }, pressed && styles.pressed]}><Ionicons name="flame-outline" size={21} color={safety.ready ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.cookText, { color: safety.ready ? colors.primaryForeground : colors.mutedForeground }]}>{safety.allergenConflict ? 'Excluded for allergy' : safety.allergenIncomplete ? 'Allergen review needed' : 'Start cooking'}</Text></Pressable>
          {required.length > 0 && !required.every((item) => have(item.name)) ? <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Some required ingredients are missing. The app will not call this recipe ready to cook until they’re confirmed in My Kitchen.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heroWrap: { height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: 56, left: 18, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 22 },
  detailHeader: { flexDirection: 'row', gap: 15 },
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
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cookButton: { height: 54, borderRadius: 17, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  cookText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  pressed: { opacity: 0.72 },
});