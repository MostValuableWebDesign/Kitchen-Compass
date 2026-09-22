import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecipe } from '@/data/recipes';
import { useKitchen } from '@/context/KitchenContext';
import { useColors } from '@/hooks/useColors';

export default function CookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = getRecipe(id);
  const { markCooked } = useKitchen();
  const [step, setStep] = useState(0);
  const [timer, setTimer] = useState(0);
  const current = recipe.steps[step];
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(interval);
  }, [timer]);
  const finish = () => {
    markCooked(recipe.ingredients.filter((item) => item.required !== false).map((item) => item.name));
    router.back();
  };
  const timerLabel = timer > 0 ? `${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}` : 'Start timer';
  return (
    <View style={[styles.screen, { backgroundColor: colors.primary, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.top}><Pressable onPress={() => router.back()}><Feather name="x" size={23} color={colors.primaryForeground} /></Pressable><Text style={[styles.topLabel, { color: colors.primaryForeground }]}>COOKING MODE</Text><Text style={[styles.stepCount, { color: colors.primaryForeground }]}>{step + 1}/{recipe.steps.length}</Text></View>
      <View style={styles.main}><Text style={[styles.recipeName, { color: colors.accent }]}>{recipe.title}</Text><Text style={[styles.stepTitle, { color: colors.primaryForeground }]}>{current.title}</Text><Text style={[styles.stepBody, { color: colors.primaryForeground }]}>{current.body}</Text>{current.temperature ? <View style={[styles.temperature, { backgroundColor: colors.secondary }]}><Ionicons name="thermometer-outline" size={19} color={colors.primary} /><Text style={[styles.temperatureText, { color: colors.secondaryForeground }]}>{current.temperature}</Text></View> : null}{current.ingredients?.length ? <Text style={[styles.uses, { color: colors.primaryForeground }]}>Uses: {current.ingredients.join(' · ')}</Text> : null}</View>
      <View><Pressable onPress={() => current.duration && setTimer(timer > 0 ? 0 : current.duration * 60)} style={({ pressed }) => [styles.timer, { backgroundColor: colors.secondary }, pressed && styles.pressed]}><Ionicons name="timer-outline" size={20} color={colors.primary} /><Text style={[styles.timerText, { color: colors.secondaryForeground }]}>{timerLabel}</Text></Pressable><View style={styles.controls}><Pressable disabled={step === 0} onPress={() => setStep((value) => value - 1)} style={[styles.controlButton, { borderColor: colors.primaryForeground, opacity: step === 0 ? 0.35 : 1 }]}><Feather name="arrow-left" size={18} color={colors.primaryForeground} /><Text style={[styles.controlText, { color: colors.primaryForeground }]}>Back</Text></Pressable>{step === recipe.steps.length - 1 ? <Pressable onPress={finish} style={({ pressed }) => [styles.finishButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}><Text style={[styles.finishText, { color: colors.accentForeground }]}>Mark cooked</Text><Ionicons name="checkmark" size={18} color={colors.accentForeground} /></Pressable> : <Pressable onPress={() => setStep((value) => value + 1)} style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.primaryForeground }, pressed && styles.pressed]}><Text style={[styles.nextText, { color: colors.primary }]}>Next step</Text><Feather name="arrow-right" size={18} color={colors.primary} /></Pressable>}</View></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  stepCount: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  main: { marginTop: 40 },
  recipeName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  stepTitle: { fontSize: 37, lineHeight: 43, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  stepBody: { fontSize: 18, lineHeight: 29, fontFamily: 'Inter_400Regular', opacity: 0.9, marginTop: 22 },
  temperature: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, marginTop: 22 },
  temperatureText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  uses: { fontSize: 12, fontFamily: 'Inter_500Medium', opacity: 0.78, marginTop: 25 },
  timer: { height: 47, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 12 },
  timerText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  controls: { flexDirection: 'row', gap: 10 },
  controlButton: { height: 54, flex: 1, borderWidth: 1, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  nextButton: { height: 54, flex: 1.4, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  finishButton: { height: 54, flex: 1.4, borderRadius: 17, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  finishText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});