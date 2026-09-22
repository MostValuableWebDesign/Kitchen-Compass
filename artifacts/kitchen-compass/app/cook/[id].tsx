import { Feather, Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecipe, formatTemperature, scaledIngredient, type RecipeMethod, type RecipeStep } from '@/data/recipes';
import { useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';

type TemperatureUnit = 'F' | 'C';

function methodSteps(recipeSteps: RecipeStep[], method?: RecipeMethod) {
  return method?.steps ?? recipeSteps;
}

export default function CookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, plannedMealId } = useLocalSearchParams<{ id: string; plannedMealId?: string }>();
  const recipe = getRecipe(id);
  const { plan, preferences, previewCook, completeCook } = useKitchen();
  const resolvedMealId = plannedMealId ?? plan.find((meal) => meal.recipeId === recipe.id)?.id;
  const plannedMeal = plan.find((meal) => meal.id === resolvedMealId);
  const isLeftoverMeal = Boolean(plannedMeal?.leftoverId);
  const preview = useMemo(() => resolvedMealId ? previewCook(resolvedMealId) : null, [previewCook, resolvedMealId]);
  const [step, setStep] = useState(0);
  const [timer, setTimer] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [servings, setServings] = useState(String(preview?.servings ?? preferences.servings));
  const [leftoverPortions, setLeftoverPortions] = useState('0');
  const [deductions, setDeductions] = useState(preview?.deductions ?? []);
  const [unit, setUnit] = useState<TemperatureUnit>('F');
  const [keepAwake, setKeepAwake] = useState(false);
  const [methodId, setMethodId] = useState<string | undefined>();
  const method = recipe.methods?.find((item) => item.id === methodId);
  const steps = useMemo(() => methodSteps(recipe.steps, method), [method, recipe.steps]);
  const current = steps[Math.min(step, steps.length - 1)] ?? recipe.steps[0]!;
  const targetServings = Math.max(1, Number(servings) || preview?.servings || recipe.servings);

  useEffect(() => {
    if (keepAwake) {
      void activateKeepAwakeAsync('kitchen-compass-cooking');
    } else {
      void deactivateKeepAwake('kitchen-compass-cooking');
    }
    return () => { void deactivateKeepAwake('kitchen-compass-cooking'); };
  }, [keepAwake]);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    setDeductions(preview?.deductions ?? []);
    setServings(String(preview?.servings ?? preferences.servings));
  }, [preferences.servings, preview]);

  useEffect(() => {
    setStep(0);
    setTimer(0);
  }, [methodId]);

  const finish = () => {
    if (!preview) {
      Alert.alert('Plan this meal first', 'Cooking deductions are tied to a planned meal so the same inventory cannot be deducted twice.');
      return;
    }
    setConfirmOpen(true);
  };

  const confirm = () => {
    if (!preview) return;
    const ok = completeCook({
      transactionId: preview.transactionId,
      plannedMealId: preview.plannedMealId,
      recipeId: preview.recipeId,
      servings: targetServings,
      deductions: deductions.map(({ inventoryId, quantity, unit }) => ({ inventoryId, quantity: Math.max(0, Number(quantity) || 0), unit })),
      leftoverPortions: Math.max(0, Number(leftoverPortions) || 0),
    });
    if (!ok) {
      Alert.alert('Already completed', 'This cooking session was already confirmed.');
      return;
    }
    setConfirmOpen(false);
    router.back();
  };

  const timerLabel = timer > 0 ? `${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}` : 'Start timer';
  const amountLabel = (amount: number, ingredientUnit: string) => `${amount} ${ingredientUnit}`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.primary, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel="Close cooking mode" onPress={() => router.back()}><Feather name="x" size={23} color={colors.primaryForeground} /></Pressable>
        <Text style={[styles.topLabel, { color: colors.primaryForeground }]}>COOKING MODE</Text>
        <Text style={[styles.stepCount, { color: colors.primaryForeground }]}>STEP {current.order} OF {steps.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.main} showsVerticalScrollIndicator={false}>
        <Text style={[styles.recipeName, { color: colors.accent }]}>{recipe.title}</Text>
        {recipe.methods?.length ? (
          <View style={styles.methodRow}>
            <Pressable onPress={() => setMethodId(undefined)} style={[styles.methodChip, { backgroundColor: !method ? colors.primaryForeground : colors.secondary }]}>
              <Text style={[styles.methodChipText, { color: !method ? colors.primary : colors.secondaryForeground }]}>Primary method</Text>
            </Pressable>
            {recipe.methods.map((item) => (
              <Pressable key={item.id} onPress={() => setMethodId(item.id)} style={[styles.methodChip, { backgroundColor: method?.id === item.id ? colors.primaryForeground : colors.secondary }]}>
                <Text style={[styles.methodChipText, { color: method?.id === item.id ? colors.primary : colors.secondaryForeground }]}>{item.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.stepHeading}>
          <View style={[styles.stepBadge, { backgroundColor: colors.accent }]}><Text style={[styles.stepBadgeText, { color: colors.accentForeground }]}>{current.order}</Text></View>
          <Text style={[styles.stepTitle, { color: colors.primaryForeground }]}>{current.title}</Text>
        </View>
        <Text style={[styles.stepBody, { color: colors.primaryForeground }]}>{current.body}</Text>

        {current.ingredientAmounts?.length ? (
          <View style={[styles.detailCard, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.detailHeading, { color: colors.secondaryForeground }]}>For {targetServings} servings</Text>
            {current.ingredientAmounts.map((item) => {
              const scaled = scaledIngredient(recipe, { name: item.name, amount: '', quantity: item.quantity, unit: item.unit }, targetServings);
              return <Text key={`${item.name}-${item.note ?? ''}`} style={[styles.detailText, { color: colors.secondaryForeground }]}>{amountLabel(scaled.quantity, scaled.unit)} {item.name}{item.note ? ` · ${item.note}` : ''}</Text>;
            })}
          </View>
        ) : null}

        {current.temperature ? <View style={[styles.temperature, { backgroundColor: colors.secondary }]}><Ionicons name="thermometer-outline" size={19} color={colors.primary} /><Text style={[styles.temperatureText, { color: colors.secondaryForeground }]}>{formatTemperature(current.temperature, unit)}</Text></View> : null}
        {current.safetyTemperature ? <View style={[styles.safetyCard, { borderColor: colors.accent }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} /><Text style={[styles.safetyText, { color: colors.primaryForeground }]}>{current.safetyTemperature.food} safety target: {formatTemperature(current.safetyTemperature.temperature, unit)}</Text></View> : null}
        {current.cues.length ? <View style={styles.noteBlock}><Text style={[styles.noteLabel, { color: colors.accent }]}>LOOK FOR</Text>{current.cues.map((cue) => <Text key={cue} style={[styles.noteText, { color: colors.primaryForeground }]}>• {cue}</Text>)}</View> : null}
        {current.mistakes.length ? <View style={styles.noteBlock}><Text style={[styles.noteLabel, { color: colors.accent }]}>AVOID</Text>{current.mistakes.map((mistake) => <Text key={mistake} style={[styles.noteText, { color: colors.primaryForeground }]}>• {mistake}</Text>)}</View> : null}
      </ScrollView>

      <View>
        <View style={styles.utilityRow}>
          <Pressable onPress={() => setUnit((value) => value === 'F' ? 'C' : 'F')} style={[styles.utilityButton, { backgroundColor: colors.secondary }]}><Ionicons name="thermometer-outline" size={17} color={colors.primary} /><Text style={[styles.utilityText, { color: colors.secondaryForeground }]}>{unit === 'F' ? 'Show °C' : 'Show °F'}</Text></Pressable>
          <View style={[styles.awakeButton, { backgroundColor: colors.secondary }]}><Ionicons name="phone-portrait-outline" size={17} color={colors.primary} /><Text style={[styles.utilityText, { color: colors.secondaryForeground }]}>Keep awake</Text><Switch value={keepAwake} onValueChange={setKeepAwake} trackColor={{ false: colors.muted, true: colors.accent }} thumbColor={keepAwake ? colors.accentForeground : colors.card} /></View>
        </View>
        <Pressable disabled={!current.duration} onPress={() => setTimer(timer > 0 ? 0 : (current.duration ?? 0) * 60)} style={({ pressed }) => [styles.timer, { backgroundColor: colors.secondary, opacity: current.duration ? 1 : 0.5 }, pressed && styles.pressed]}><Ionicons name="timer-outline" size={20} color={colors.primary} /><Text style={[styles.timerText, { color: colors.secondaryForeground }]}>{current.duration ? `${timerLabel}${timer === 0 ? ` · ${current.duration} min` : ''}` : 'No timer for this step'}</Text></Pressable>
        <View style={styles.controls}>
          <Pressable disabled={step === 0} onPress={() => setStep((value) => Math.max(0, value - 1))} style={[styles.controlButton, { borderColor: colors.primaryForeground, opacity: step === 0 ? 0.35 : 1 }]}><Feather name="arrow-left" size={18} color={colors.primaryForeground} /><Text style={[styles.controlText, { color: colors.primaryForeground }]}>Back</Text></Pressable>
          {step === steps.length - 1 ? <Pressable onPress={finish} style={({ pressed }) => [styles.finishButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}><Text style={[styles.finishText, { color: colors.accentForeground }]}>Review cooking</Text><Ionicons name="checkmark" size={18} color={colors.accentForeground} /></Pressable> : <Pressable onPress={() => setStep((value) => Math.min(steps.length - 1, value + 1))} style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.primaryForeground }, pressed && styles.pressed]}><Text style={[styles.nextText, { color: colors.primary }]}>Next step</Text><Feather name="arrow-right" size={18} color={colors.primary} /></Pressable>}
        </View>
      </View>

      <Modal animationType="slide" transparent visible={confirmOpen} onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.confirmSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Confirm cooking</Text><Pressable onPress={() => setConfirmOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
           <Text style={[styles.confirmIntro, { color: colors.mutedForeground }]}>{isLeftoverMeal ? 'Confirm the portions you consumed. The original recipe ingredients will not be deducted again.' : 'Review quantities before saving. Inventory is deducted once, reservations are released, and leftovers are saved.'}</Text>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Servings cooked</Text>
          <TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          {deductions.map((deduction, index) => <View key={`${deduction.inventoryId}-${index}`} style={styles.deduction}><View style={{ flex: 1 }}><Text style={[styles.itemName, { color: colors.foreground }]}>{deduction.ingredientName}</Text><Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>{deduction.inventoryName}</Text></View><TextInput value={String(deduction.quantity)} onChangeText={(value) => setDeductions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(value) || 0 } : item))} keyboardType="decimal-pad" style={[styles.quantityInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.unit, { color: colors.mutedForeground }]}>{deduction.unit}</Text></View>)}
           {isLeftoverMeal ? null : <><Text style={[styles.fieldLabel, { color: colors.foreground }]}>Leftover portions</Text><TextInput value={leftoverPortions} onChangeText={setLeftoverPortions} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /></>}
          <Pressable onPress={confirm} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.finishText, { color: colors.primaryForeground }]}>Confirm and save</Text></Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  stepCount: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  main: { paddingTop: 30, paddingBottom: 24 },
  recipeName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 14 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 20 },
  methodChip: { borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  methodChipText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stepBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  stepTitle: { flex: 1, fontSize: 31, lineHeight: 37, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  stepBody: { fontSize: 17, lineHeight: 26, opacity: 0.92, marginTop: 18 },
  detailCard: { borderRadius: 15, padding: 12, marginTop: 18 },
  detailHeading: { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7 },
  detailText: { fontSize: 13, lineHeight: 20 },
  temperature: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, marginTop: 18 },
  temperatureText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  safetyCard: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 10 },
  safetyText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  noteBlock: { marginTop: 18 },
  noteLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  noteText: { fontSize: 12, lineHeight: 18, opacity: 0.84 },
  utilityRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  utilityButton: { height: 42, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', gap: 6, alignItems: 'center' },
  awakeButton: { flex: 1, height: 42, borderRadius: 14, paddingLeft: 11, flexDirection: 'row', gap: 6, alignItems: 'center' },
  utilityText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  timer: { height: 47, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 12 },
  timerText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  controls: { flexDirection: 'row', gap: 10 },
  controlButton: { height: 54, flex: 1, borderWidth: 1, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  nextButton: { height: 54, flex: 1.4, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  finishButton: { height: 54, flex: 1.4, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  finishText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(32,53,44,0.35)' },
  confirmSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  confirmIntro: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium' },
  deduction: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  itemName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  itemMeta: { fontSize: 11, marginTop: 3 },
  quantityInput: { width: 76, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 9, textAlign: 'right' },
  unit: { width: 42, fontSize: 12 },
  saveButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  pressed: { opacity: 0.72 },
});