import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, SectionTitle } from '@/components/KitchenUI';
import { MealType, useKitchen } from '@/context/KitchenContext';
import { recipes } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';
import { recipeReadiness } from '@/lib/kitchenLogic';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, setMeal, removeMeal, ingredients } = useKitchen();
  const getMeal = (day: string, meal: MealType) => plan.find((item) => item.day === day && item.meal === meal);
  const cycleMeal = (day: string, meal: MealType) => {
    const current = getMeal(day, meal);
    const candidates = recipes.filter((recipe) => meal === 'Breakfast' ? recipe.meal === 'Breakfast' : recipe.meal !== 'Breakfast');
    const next = candidates[(Math.max(0, candidates.findIndex((recipe) => recipe.id === current?.recipeId)) + 1) % candidates.length];
    setMeal(day, meal, next.id);
  };
  const missingCount = plan.reduce((count, meal) => {
    const recipe = recipes.find((item) => item.id === meal.recipeId);
    if (!recipe) return count;
    return count + recipe.ingredients.filter((ingredient) => ingredient.required !== false && !recipeReadiness(recipe, ingredients, []).ready && !ingredients.some((item) => item.name.toLowerCase() === ingredient.name.toLowerCase())).length;
  }, 0);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>MAKE IT A WEEK</Text><Text style={[styles.title, { color: colors.foreground }]}>Meal Plan</Text></View><Pressable onPress={() => router.push('/recipes')} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Feather name="plus" size={19} color={colors.primaryForeground} /><Text style={[styles.addText, { color: colors.primaryForeground }]}>Add meal</Text></Pressable></View>
        <View style={[styles.planIntro, { backgroundColor: colors.secondary }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><Text style={[styles.planIntroText, { color: colors.secondaryForeground }]}>Tap any meal slot to cycle through suggestions. Planning reserves ingredients without removing them from My Kitchen.</Text></View>
        <View style={styles.weekHeader}><Text style={[styles.weekTitle, { color: colors.foreground }]}>This week</Text><Text style={[styles.weekMeta, { color: colors.mutedForeground }]}>{plan.length} of 21 meals planned</Text></View>
        {days.map((day) => <View key={day} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.dayHeader}><Text style={[styles.dayName, { color: colors.foreground }]}>{day}</Text><Text style={[styles.dayMeta, { color: colors.mutedForeground }]}>{day === new Date().toLocaleDateString('en-US', { weekday: 'long' }) ? 'TODAY' : ''}</Text></View>{mealTypes.map((meal) => { const planned = getMeal(day, meal); const recipe = recipes.find((item) => item.id === planned?.recipeId); return <Pressable key={meal} onPress={() => cycleMeal(day, meal)} onLongPress={() => planned && removeMeal(day, meal)} style={({ pressed }) => [styles.mealSlot, { borderTopColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.mealType, { color: colors.mutedForeground }]}>{meal}</Text><View style={{ flex: 1 }}><Text style={[styles.mealRecipe, { color: recipe ? colors.foreground : colors.mutedForeground }]}>{recipe?.title ?? 'Tap to add'}</Text>{recipe ? <Text style={[styles.mealTime, { color: colors.mutedForeground }]}>{recipe.prep + recipe.cook} min · {recipe.score}/100 score</Text> : null}</View><Feather name={recipe ? 'refresh-cw' : 'plus'} size={15} color={recipe ? colors.primary : colors.mutedForeground} /></Pressable>; })}</View>)}
         <SectionTitle title="Shopping list" action={missingCount ? 'View needs' : undefined} onPress={() => router.push('/shopping')} />
         <Pressable onPress={() => router.push('/shopping')} style={({ pressed }) => [styles.shoppingCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.cartIcon, { backgroundColor: colors.accent }]}><Ionicons name="cart-outline" size={20} color={colors.accentForeground} /></View><View style={{ flex: 1 }}><Text style={[styles.shoppingTitle, { color: colors.foreground }]}>{missingCount ? `${missingCount} ingredients to check` : 'No shopping needs yet'}</Text><Text style={[styles.shoppingBody, { color: colors.mutedForeground }]}>{missingCount ? 'Missing ingredients are calculated from your saved plan.' : 'Add meals to create a smart list.'}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 5 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10 },
  addText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  planIntro: { borderRadius: 17, padding: 14, flexDirection: 'row', gap: 9, marginBottom: 25 },
  planIntroText: { flex: 1, fontSize: 12, lineHeight: 18 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  weekTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  weekMeta: { fontSize: 11 },
  dayCard: { borderRadius: 19, borderWidth: 1, paddingHorizontal: 14, marginBottom: 11 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 5 },
  dayName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  dayMeta: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  mealSlot: { minHeight: 54, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mealType: { width: 58, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  mealRecipe: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  mealTime: { fontSize: 10, marginTop: 3 },
  shoppingCard: { borderRadius: 19, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shoppingTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  shoppingBody: { fontSize: 11, marginTop: 4 },
  pressed: { opacity: 0.72 },
});