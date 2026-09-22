import { Feather, Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/KitchenUI';
import { Preferences, useKitchen } from '@/context/KitchenContext';
import { supportedEquipmentOptions } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';

const nutritionOptions = ['More vegetables', 'More protein', 'Lower sodium', 'Lower added sugar'];
const restrictionOptions = ['Vegetarian', 'Pescatarian', 'Vegan', 'Gluten free', 'Dairy free'];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { preferences, completeOnboarding } = useKitchen();
  const [draft, setDraft] = useState<Preferences>(preferences);
  const updateList = (key: 'allergies' | 'dietaryRestrictions' | 'dislikes' | 'cuisines', value: string) => setDraft((current) => ({ ...current, [key]: value.split(',').map((item) => item.trim()).filter(Boolean) }));
  const toggleList = (key: 'equipment' | 'nutrition', value: string) => setDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  const finish = () => completeOnboarding({ ...draft, householdSize: Math.max(1, draft.householdSize), servings: Math.max(1, draft.servings) });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><View style={[styles.logo, { backgroundColor: colors.primary }]}><Ionicons name="compass-outline" size={24} color={colors.primaryForeground} /></View><Text style={[styles.eyebrow, { color: colors.primary }]}>KITCHEN COMPASS</Text></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Make your kitchen work for you.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Tell us what fits your household. You can change every answer later in Settings. Cuisines and nutrition are optional, so leaving them empty keeps the full recipe catalog available.</Text>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Household</Text>
        <View style={styles.twoColumn}><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Household size</Text><TextInput value={String(draft.householdSize)} onChangeText={(value) => setDraft((current) => ({ ...current, householdSize: Number(value) || 1 }))} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /></View><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Default servings</Text><TextInput value={String(draft.servings)} onChangeText={(value) => setDraft((current) => ({ ...current, servings: Number(value) || 1 }))} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /></View></View>
        <Text style={[styles.label, { color: colors.foreground }]}>Allergies <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(comma separated)</Text></Text>
        <TextInput value={draft.allergies.join(', ')} onChangeText={(value) => updateList('allergies', value)} placeholder="e.g. peanuts, egg" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Dietary restrictions</Text>
        <View style={styles.chipWrap}>{restrictionOptions.map((item) => <Chip key={item} label={item} selected={draft.dietaryRestrictions.includes(item)} onPress={() => setDraft((current) => ({ ...current, dietaryRestrictions: current.dietaryRestrictions.includes(item) ? current.dietaryRestrictions.filter((value) => value !== item) : [...current.dietaryRestrictions, item] }))} />)}</View>
        <Text style={[styles.label, { color: colors.foreground }]}>Dislikes</Text>
        <TextInput value={draft.dislikes.join(', ')} onChangeText={(value) => updateList('dislikes', value)} placeholder="e.g. cilantro" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Cuisines <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(optional)</Text></Text>
        <TextInput value={draft.cuisines.join(', ')} onChangeText={(value) => updateList('cuisines', value)} placeholder="Leave blank for all cuisines" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>How you cook</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Skill</Text>
        <View style={styles.chipWrap}>{(['Beginner', 'Comfortable', 'Confident'] as const).map((skill) => <Chip key={skill} label={skill} selected={draft.skill === skill} onPress={() => setDraft((current) => ({ ...current, skill }))} />)}</View>
        <Text style={[styles.label, { color: colors.foreground }]}>Maximum cooking time</Text>
        <View style={styles.chipWrap}>{[30, 45, 60, 90].map((time) => <Chip key={time} label={`${time} min`} selected={draft.cookTime === time} onPress={() => setDraft((current) => ({ ...current, cookTime: time }))} />)}</View>
        <Text style={[styles.label, { color: colors.foreground }]}>Equipment available</Text>
        <View style={styles.chipWrap}>{supportedEquipmentOptions.map((item) => <Chip key={item} label={item} selected={draft.equipment.includes(item)} onPress={() => toggleList('equipment', item)} />)}</View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Nutrition focus <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(optional)</Text></Text>
        <View style={styles.chipWrap}>{nutritionOptions.map((item) => <Chip key={item} label={item} selected={draft.nutrition.includes(item)} onPress={() => toggleList('nutrition', item)} />)}</View>
        <Pressable testID="finish-onboarding" onPress={finish} style={({ pressed }) => [styles.finish, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.finishText, { color: colors.primaryForeground }]}>Start using Kitchen Compass</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  logo: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 },
  title: { fontSize: 30, lineHeight: 35, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 20 },
  sectionTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', marginTop: 18, marginBottom: 6 },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 12, marginBottom: 8 },
  twoColumn: { flexDirection: 'row', gap: 10 },
  input: { height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_500Medium' },
  chipWrap: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  finish: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 28 },
  finishText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});