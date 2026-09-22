import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, SectionTitle } from '@/components/KitchenUI';
import { MealType, useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';
import { calculateShoppingNeeds } from '@/lib/kitchenLogic';
import { recipeVersion } from '@/lib/recipeDiscovery';
import { getAvailableRecipes, lookupPlannedRecipe, lookupRecipe } from '@/lib/recipeLookup';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, setMeal, removeMeal, generatePlan, swapMeal, moveMeal, planLeftover, preferences, ingredients, reservations, leftovers, savedRecipes } = useKitchen();
  const availableRecipes = getAvailableRecipes(savedRecipes);
  const getMeal = (day: string, meal: MealType) => plan.find((item) => item.day === day && item.meal === meal);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [slot, setSlot] = useState<{ day: string; meal: MealType } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState(days);
  const [selectedMeals, setSelectedMeals] = useState<MealType[]>(mealTypes);
  const [servings, setServings] = useState('');
  const selectedMeal = slot ? getMeal(slot.day, slot.meal) : undefined;
  const selectedRecipe = lookupPlannedRecipe(selectedMeal, savedRecipes);
  const openSlot = (day: string, meal: MealType) => {
    const current = getMeal(day, meal);
    setSlot({ day, meal });
    setServings(String(current?.servings ?? preferences.servings));
  };
  const saveServings = () => {
    if (!slot || !selectedMeal || !selectedRecipe) return;
    const nextServings = Math.max(1, Number(servings) || preferences.servings);
    setMeal(slot.day, slot.meal, selectedMeal.recipeId, nextServings, selectedMeal.recipeVersion ?? recipeVersion(selectedRecipe));
    setSlot(null);
  };
  const chooseMoveTarget = (day: string, meal: MealType) => {
    if (!slot) return;
    if (day === slot.day && meal === slot.meal) return;
    moveMeal(slot, { day, meal });
    setMoveOpen(false);
    setSlot(null);
  };
  const missingCount = calculateShoppingNeeds(plan, availableRecipes, ingredients, preferences.servings, reservations).length;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>MAKE IT A WEEK</Text><Text style={[styles.title, { color: colors.foreground }]}>Meal Plan</Text></View><View style={styles.headerActions}><Pressable onPress={() => setGeneratorOpen(true)} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.pressed]}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Generate</Text></Pressable><Pressable onPress={() => router.push('/recipes')} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Feather name="plus" size={19} color={colors.primaryForeground} /></Pressable></View></View>
        <View style={[styles.planIntro, { backgroundColor: colors.secondary }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><Text style={[styles.planIntroText, { color: colors.secondaryForeground }]}>Generate only the days or meals you choose. Your confirmed kitchen stock is reserved across the week without being subtracted, and unknown quantities are flagged for confirmation.</Text></View>
        <View style={styles.weekHeader}><Text style={[styles.weekTitle, { color: colors.foreground }]}>This week</Text><Text style={[styles.weekMeta, { color: colors.mutedForeground }]}>{plan.length} of 21 meals planned</Text></View>
        {days.map((day) => <View key={day} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.dayHeader}><Text style={[styles.dayName, { color: colors.foreground }]}>{day}</Text><Text style={[styles.dayMeta, { color: colors.mutedForeground }]}>{day === new Date().toLocaleDateString('en-US', { weekday: 'long' }) ? 'TODAY' : ''}</Text></View>{mealTypes.map((meal) => { const planned = getMeal(day, meal); const recipe = lookupPlannedRecipe(planned, savedRecipes); const unavailable = Boolean(planned && !recipe); const needsConfirmation = Boolean(planned?.needsConfirmation || reservations.some((reservation) => reservation.plannedMealId === planned?.id && !reservation.quantityKnown)); return <Pressable testID={`meal-${day}-${meal}`} key={meal} onPress={() => openSlot(day, meal)} style={({ pressed }) => [styles.mealSlot, { borderTopColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.mealType, { color: colors.mutedForeground }]}>{meal}</Text><View style={{ flex: 1 }}><Text style={[styles.mealRecipe, { color: recipe ? colors.foreground : colors.mutedForeground }]}>{unavailable ? 'Recipe unavailable · plan preserved' : planned?.leftoverId ? `Leftovers · ${recipe?.title ?? 'meal'}` : recipe?.title ?? 'Tap to add'}</Text>{recipe ? <Text style={[styles.mealTime, { color: colors.mutedForeground }]}>{recipe.prep + recipe.cook} min · {planned?.servings ?? preferences.servings} servings{needsConfirmation ? ' · Confirm quantities' : ''}</Text> : null}</View><Feather name={recipe ? 'edit-3' : unavailable ? 'alert-circle' : 'plus'} size={15} color={recipe ? colors.primary : unavailable ? colors.destructive : colors.mutedForeground} /></Pressable>; })}</View>)}
         <SectionTitle title="Shopping list" action={missingCount ? 'View needs' : undefined} onPress={() => router.push('/shopping')} />
         <Pressable onPress={() => router.push('/shopping')} style={({ pressed }) => [styles.shoppingCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.cartIcon, { backgroundColor: colors.accent }]}><Ionicons name="cart-outline" size={20} color={colors.accentForeground} /></View><View style={{ flex: 1 }}><Text style={[styles.shoppingTitle, { color: colors.foreground }]}>{missingCount ? `${missingCount} ingredients to check` : 'No shopping needs yet'}</Text><Text style={[styles.shoppingBody, { color: colors.mutedForeground }]}>{missingCount ? 'Missing ingredients are calculated from your saved plan.' : 'Add meals to create a smart list.'}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>
      </ScrollView>
      <Modal animationType="slide" transparent visible={generatorOpen} onRequestClose={() => setGeneratorOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Build part of your plan</Text><Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>Existing choices outside this selection stay untouched.</Text></View><Pressable onPress={() => setGeneratorOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Days</Text><View style={styles.chipWrap}>{days.map((day) => <Chip key={day} label={day.slice(0, 3)} selected={selectedDays.includes(day)} onPress={() => setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])} />)}</View>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Meals</Text><View style={styles.chipWrap}>{mealTypes.map((meal) => <Chip key={meal} label={meal} selected={selectedMeals.includes(meal)} onPress={() => setSelectedMeals((current) => current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal])} />)}</View>
          <Pressable disabled={!selectedDays.length || !selectedMeals.length} onPress={() => { generatePlan(selectedDays, selectedMeals); setGeneratorOpen(false); }} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: selectedDays.length && selectedMeals.length ? 1 : 0.45 }, pressed && styles.pressed]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Generate selected meals</Text></Pressable>
        </View></View>
      </Modal>
      <Modal animationType="slide" transparent visible={Boolean(slot) && !moveOpen} onRequestClose={() => setSlot(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{slot?.meal} · {slot?.day}</Text><Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>{selectedMeal ? selectedRecipe?.title ?? 'Recipe unavailable · plan preserved' : 'Nothing planned yet'}</Text></View><Pressable onPress={() => setSlot(null)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
           {selectedMeal && selectedRecipe ? <><Text style={[styles.fieldLabel, { color: colors.foreground }]}>Servings</Text><TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={saveServings} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Save servings</Text></Pressable><View style={styles.actionGrid}><Pressable onPress={() => slot && (swapMeal(slot.day, slot.meal), setSlot(null))} style={[styles.actionButton, { backgroundColor: colors.secondary }]}><Ionicons name="shuffle-outline" size={18} color={colors.primary} /><Text style={[styles.actionButtonText, { color: colors.secondaryForeground }]}>Swap</Text></Pressable><Pressable onPress={() => setMoveOpen(true)} style={[styles.actionButton, { backgroundColor: colors.secondary }]}><Ionicons name="return-down-forward-outline" size={18} color={colors.primary} /><Text style={[styles.actionButtonText, { color: colors.secondaryForeground }]}>Move</Text></Pressable></View><Pressable onPress={() => { if (slot) removeMeal(slot.day, slot.meal); setSlot(null); }} style={[styles.deleteButton, { borderColor: colors.border }]}><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[styles.deleteButtonText, { color: colors.destructive }]}>Remove from plan</Text></Pressable><Pressable onPress={() => { if (slot) router.push(`/cook/${selectedRecipe.id}?plannedMealId=${selectedMeal.id}`); setSlot(null); }} style={[styles.primaryButton, { backgroundColor: colors.accent }]}><Ionicons name="flame-outline" size={18} color={colors.accentForeground} /><Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>Start cooking</Text></Pressable></> : selectedMeal ? <><Text style={[styles.emptySheetText, { color: colors.destructive }]}>This planned recipe version is unavailable. The plan is preserved; restore the saved recipe or remove this meal.</Text><Pressable onPress={() => { if (slot) removeMeal(slot.day, slot.meal); setSlot(null); }} style={[styles.deleteButton, { borderColor: colors.border }]}><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[styles.deleteButtonText, { color: colors.destructive }]}>Remove from plan</Text></Pressable></> : <Text style={[styles.emptySheetText, { color: colors.mutedForeground }]}>Generate a plan or choose a recipe from Recipes to fill this slot.</Text>}
           {leftovers.length ? <><Text style={[styles.fieldLabel, { color: colors.foreground }]}>Plan leftovers intentionally</Text><View style={styles.leftoverList}>{leftovers.map((leftover) => { const recipe = lookupRecipe(leftover.recipeId, savedRecipes, leftover.recipeVersion); return <Pressable key={leftover.id} onPress={() => { if (slot && recipe && planLeftover(slot.day, slot.meal, leftover.id, Math.min(1, leftover.portions))) setSlot(null); }} style={[styles.leftoverButton, { backgroundColor: colors.secondary }]}><View style={{ flex: 1 }}><Text style={[styles.actionButtonText, { color: colors.secondaryForeground }]}>{recipe ? `Leftovers · ${recipe.title}` : 'Recipe unavailable · plan preserved'}</Text><Text style={[styles.leftoverMeta, { color: colors.mutedForeground }]}>{leftover.portions} portion{leftover.portions === 1 ? '' : 's'} · prepared {new Date(leftover.preparedAt).toLocaleDateString()}</Text></View><Feather name={recipe ? 'plus' : 'alert-circle'} size={16} color={recipe ? colors.primary : colors.destructive} /></Pressable>; })}</View></> : null}
        </View></View>
      </Modal>
      <Modal animationType="slide" transparent visible={moveOpen} onRequestClose={() => setMoveOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}><View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Move meal to</Text><Pressable onPress={() => setMoveOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View><Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>Choosing an occupied slot swaps the two meals.</Text>{days.map((day) => <View key={day} style={styles.moveRow}><Text style={[styles.dayName, { color: colors.foreground }]}>{day}</Text><View style={styles.chipWrap}>{mealTypes.map((meal) => <Chip key={meal} label={meal.slice(0, 1)} selected={false} onPress={() => chooseMoveTarget(day, meal)} />)}</View></View>)}</View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 5 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10 },
  addText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  secondaryButton: { minHeight: 40, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secondaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
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
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(32,53,44,0.35)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  sheetBody: { fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 280 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 12 },
  chipWrap: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium' },
  primaryButton: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 18 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  actionGrid: { flexDirection: 'row', gap: 9, marginTop: 10 },
  actionButton: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  actionButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  deleteButton: { minHeight: 45, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 10 },
  deleteButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  emptySheetText: { fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  leftoverList: { gap: 8, marginTop: 2 },
  leftoverButton: { borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  leftoverMeta: { fontSize: 11, marginTop: 4 },
  moveRow: { paddingVertical: 8, gap: 8 },
  pressed: { opacity: 0.72 },
});