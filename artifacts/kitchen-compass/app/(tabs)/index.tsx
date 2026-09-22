import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, RecipeCard, SectionTitle } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { recipes } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';
import { recipeReadiness } from '@/lib/kitchenLogic';
import { recipeMatchesPreferences } from '@/lib/kitchenLogic';

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ingredients, preferences, plan, reservations, setPreferences } = useKitchen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const plannedToday = plan.filter((meal) => meal.day === today);
  const useSoon = ingredients.filter((item) => item.expires || item.status === 'low').slice(0, 3);
  const hasIngredient = (recipeId: string) => {
    const recipe = recipes.find((item) => item.id === recipeId);
    return !!recipe && recipeMatchesPreferences(recipe, preferences) && recipeReadiness(recipe, ingredients, preferences.allergies, preferences.servings, reservations).ready;
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="Kitchen Compass" title="Good morning" action="settings" onAction={() => setSettingsOpen(true)} />
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroEyebrow, { color: colors.accent }]}>YOUR KITCHEN, IN FOCUS</Text>
            <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>What can you cook today?</Text>
            <Text style={[styles.heroBody, { color: colors.primaryForeground }]}>Scan what you have and turn it into your next good meal.</Text>
          </View>
          <Pressable testID="scan-hero-button" onPress={() => router.push('/scan')} style={({ pressed }) => [styles.heroButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
            <Ionicons name="scan-outline" size={22} color={colors.accentForeground} />
            <Text style={[styles.heroButtonText, { color: colors.accentForeground }]}>Scan kitchen</Text>
          </Pressable>
        </View>

        <SectionTitle title={`Today · ${today}`} action="Meal plan" onPress={() => router.push('/plan')} />
        <View style={[styles.mealsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['Breakfast', 'Lunch', 'Dinner'] as const).map((meal) => {
            const planned = plannedToday.find((item) => item.meal === meal);
            const recipe = recipes.find((item) => item.id === planned?.recipeId);
            return (
              <Pressable key={meal} onPress={() => router.push('/plan')} style={({ pressed }) => [styles.mealRow, { borderBottomColor: colors.border }, pressed && styles.pressed]}>
                <View style={[styles.mealIcon, { backgroundColor: colors.secondary }]}><Ionicons name={meal === 'Breakfast' ? 'sunny-outline' : meal === 'Lunch' ? 'partly-sunny-outline' : 'moon-outline'} size={17} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mealLabel, { color: colors.mutedForeground }]}>{meal}</Text>
                  <Text style={[styles.mealName, { color: recipe ? colors.foreground : colors.mutedForeground }]}>{recipe?.title ?? 'Nothing planned yet'}</Text>
                </View>
                <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>

        <SectionTitle title="Use soon" action={useSoon.length ? 'My kitchen' : undefined} onPress={() => router.push('/kitchen')} />
        {useSoon.length ? (
          <View style={[styles.useSoonCard, { backgroundColor: colors.accent }]}>
            <View style={styles.useSoonHeader}><Ionicons name="time-outline" size={20} color={colors.accentForeground} /><Text style={[styles.useSoonTitle, { color: colors.accentForeground }]}>A little attention saves a lot of waste</Text></View>
            {useSoon.map((item) => <Text key={item.id} style={[styles.useSoonItem, { color: colors.accentForeground }]}>• {item.name}{item.status === 'low' ? ' · running low' : ''}</Text>)}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="leaf-outline" size={24} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your kitchen is in good shape</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Add ingredients to see what needs using soon.</Text></View>
        )}

        <SectionTitle title="Quick inspiration" action="See all" onPress={() => router.push('/recipes')} />
        {recipes.filter((recipe) => recipeMatchesPreferences(recipe, preferences)).slice(0, 2).map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} hasIngredients={hasIngredient(recipe.id)} onPress={() => router.push(`/recipe/${recipe.id}`)} />)}
        <View style={{ height: 18 }} />
      </ScrollView>

      <Modal animationType="slide" transparent visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: 'rgba(32,53,44,0.35)' }]}>
          <View style={[styles.settingsSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Your preferences</Text><Pressable onPress={() => setSettingsOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Household size</Text>
            <TextInput value={String(preferences.servings)} keyboardType="number-pad" onChangeText={(value) => setPreferences({ servings: Math.max(1, Number(value) || 1) })} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Allergies</Text>
             <TextInput value={preferences.allergies.join(', ')} onChangeText={(value) => setPreferences({ allergies: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="e.g. peanuts, egg" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Dietary restrictions</Text>
             <TextInput value={preferences.dietaryRestrictions.join(', ')} onChangeText={(value) => setPreferences({ dietaryRestrictions: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="e.g. vegetarian" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Dislikes</Text>
             <TextInput value={preferences.dislikes.join(', ')} onChangeText={(value) => setPreferences({ dislikes: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="e.g. cilantro" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Cuisines</Text>
             <TextInput value={preferences.cuisines.join(', ')} onChangeText={(value) => setPreferences({ cuisines: value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="e.g. Mediterranean, Italian" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Cooking skill</Text>
             <View style={styles.chipWrap}>{(['Beginner', 'Comfortable', 'Confident'] as const).map((skill) => <Chip key={skill} label={skill} selected={preferences.skill === skill} onPress={() => setPreferences({ skill })} />)}</View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Cooking time</Text>
            <View style={styles.chipWrap}>{[30, 45, 60].map((time) => <Chip key={time} label={`${time} min`} selected={preferences.cookTime === time} onPress={() => setPreferences({ cookTime: time })} />)}</View>
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Equipment</Text>
             <View style={styles.chipWrap}>{['Stovetop', 'Oven', 'Microwave'].map((item) => <Chip key={item} label={item} selected={preferences.equipment.includes(item)} onPress={() => setPreferences({ equipment: preferences.equipment.includes(item) ? preferences.equipment.filter((value) => value !== item) : [...preferences.equipment, item] })} />)}</View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nutrition focus</Text>
             <View style={styles.chipWrap}>{['More vegetables', 'More protein'].map((item) => <Chip key={item} label={item} selected={preferences.nutrition.includes(item)} onPress={() => setPreferences({ nutrition: preferences.nutrition.includes(item) ? preferences.nutrition.filter((value) => value !== item) : [...preferences.nutrition, item] })} />)}</View>
            <Pressable onPress={() => setSettingsOpen(false)} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>Save preferences</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { borderRadius: 26, padding: 20, minHeight: 210, marginBottom: 26, overflow: 'hidden' },
  heroEyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 12 },
  heroTitle: { fontSize: 28, lineHeight: 33, fontFamily: 'Inter_700Bold', maxWidth: 245 },
  heroBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', opacity: 0.85, marginTop: 10, maxWidth: 260 },
  heroButton: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginTop: 20 },
  heroButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  mealsCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, marginBottom: 26 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  mealIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mealLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  mealName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  useSoonCard: { borderRadius: 20, padding: 16, marginBottom: 25 },
  useSoonHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  useSoonTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  useSoonItem: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 5 },
  emptyCard: { borderRadius: 20, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 26 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 8 },
  emptyBody: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'center' },
  pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  settingsSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium' },
  chipWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  saveButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  saveButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
