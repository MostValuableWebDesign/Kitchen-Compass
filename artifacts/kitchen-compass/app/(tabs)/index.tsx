import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, Chip, RecipeCard, SectionTitle } from '@/components/KitchenUI';
import { useKitchen } from '@/context/KitchenContext';
import { supportedEquipmentOptions } from '@/data/recipes';
import { useColors } from '@/hooks/useColors';
import { confirmedDateStatus, recipeReadiness, recipeMatchesPreferences } from '@/lib/kitchenLogic';
import { getAvailableRecipes, lookupPlannedRecipe } from '@/lib/recipeLookup';
import { isArchivedRecipe } from '@/lib/recipeArchive';

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ingredients, preferences, plan, reservations, savedRecipes, archivedRecipes, setPreferences, reminders, setReminderSettings, clearSavedScanPhotos, eraseAllData, theme, setTheme } = useKitchen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const plannedToday = plan.filter((meal) => meal.day === today);
  const useSoon = ingredients.filter((item) => (item.dateConfirmed && confirmedDateStatus(item.expires)) || item.status === 'low').slice(0, 3);
  const hasIngredient = (recipeId: string) => {
    const planned = plan.find((item) => item.recipeId === recipeId);
    const recipe = planned
      ? lookupPlannedRecipe(planned, savedRecipes)
      : getAvailableRecipes(savedRecipes).find((item) => item.id === recipeId);
    return !!recipe && recipeMatchesPreferences(recipe, preferences) && recipeReadiness(recipe, ingredients, preferences.allergies, preferences.servings, reservations).ready;
  };
  const reminderTimeLabel = `${String(reminders.hour % 12 || 12)}:${String(reminders.minute).padStart(2, '0')} ${reminders.hour >= 12 ? 'PM' : 'AM'}`;
  const confirmErase = () => Alert.alert('Erase all Kitchen Compass data?', 'This removes inventory, saved recipes, plans, preferences, scan photos, and reminder settings from this device. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Erase everything', style: 'destructive', onPress: () => void eraseAllData() }]);
  const confirmPhotoDelete = () => Alert.alert('Delete saved scan photos?', 'This removes the photo copies stored by Kitchen Compass. Photos in your iPhone library, ingredient names, and quantities remain.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete photos', style: 'destructive', onPress: clearSavedScanPhotos }]);

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
            const recipe = lookupPlannedRecipe(planned, savedRecipes);
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
         {getAvailableRecipes(savedRecipes)
           .filter((recipe) => !isArchivedRecipe(recipe, archivedRecipes) && recipeMatchesPreferences(recipe, preferences))
           .slice(0, 2)
           .map((recipe) => (
             <RecipeCard
               key={`${recipe.id}-${recipe.sourceVersion}`}
               recipe={recipe}
               hasIngredients={hasIngredient(recipe.id)}
               onPress={() => router.push(`/recipe/${recipe.id}`)}
             />
           ))}
        <View style={{ height: 18 }} />
      </ScrollView>

      <Modal animationType="slide" transparent visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: 'rgba(32,53,44,0.35)' }]}>
          <View style={[styles.settingsSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Your preferences</Text><Pressable onPress={() => setSettingsOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
             <ScrollView
               contentContainerStyle={styles.settingsScroll}
               keyboardShouldPersistTaps="handled"
               showsVerticalScrollIndicator
             >
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Household size</Text>
            <TextInput value={String(preferences.householdSize)} keyboardType="number-pad" onChangeText={(value) => setPreferences({ householdSize: Math.max(1, Number(value) || 1) })} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Default servings</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Equipment used by available recipes</Text>
              <View style={styles.chipWrap}>{supportedEquipmentOptions.map((item) => <Chip key={item} label={item} selected={preferences.equipment.includes(item)} onPress={() => setPreferences({ equipment: preferences.equipment.includes(item) ? preferences.equipment.filter((value) => value !== item) : [...preferences.equipment, item] })} />)}</View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nutrition focus</Text>
             <View style={styles.chipWrap}>{['More vegetables', 'More protein'].map((item) => <Chip key={item} label={item} selected={preferences.nutrition.includes(item)} onPress={() => setPreferences({ nutrition: preferences.nutrition.includes(item) ? preferences.nutrition.filter((value) => value !== item) : [...preferences.nutrition, item] })} />)}</View>
             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Daily meal reminders</Text>
             <View style={styles.chipWrap}><Chip label="Off" selected={!reminders.enabled} onPress={() => void setReminderSettings({ enabled: false })} /><Chip label="On" selected={reminders.enabled} onPress={async () => { const enabled = await setReminderSettings({ enabled: true }); if (!enabled) Alert.alert('Notifications remain off', 'Kitchen Compass could not get notification permission. You can enable it later in iPhone Settings.'); }} /></View>
             {reminders.enabled ? <><Text style={[styles.reminderHint, { color: colors.mutedForeground }]}>Reminder time · {reminderTimeLabel}</Text><View style={styles.chipWrap}>{[7, 8, 12, 18, 20].map((hour) => <Chip key={hour} label={`${hour % 12 || 12}${hour >= 12 ? ' PM' : ' AM'}`} selected={reminders.hour === hour} onPress={() => void setReminderSettings({ hour })} />)}</View></> : null}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Appearance</Text>
              <View style={styles.chipWrap}><Chip label="Light" selected={theme === 'light'} onPress={() => setTheme('light')} /><Chip label="Dark" selected={theme === 'dark'} onPress={() => setTheme('dark')} /></View>
             <View style={[styles.offlineNote, { backgroundColor: colors.muted }]}><Ionicons name="phone-portrait-outline" size={17} color={colors.primary} /><Text style={[styles.offlineText, { color: colors.mutedForeground }]}>Inventory, saved recipes, preferences, and your current plan stay on this device and remain readable offline. Scanning and recipe discovery need internet.</Text></View>
             <View style={[styles.offlineNote, { backgroundColor: colors.muted }]}><Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} /><Text style={[styles.offlineText, { color: colors.mutedForeground }]}>A scan photo is sent to the Kitchen Compass server and external AI service only when you ask for recognition. Kitchen Compass keeps a lasting local copy only if you choose that option. Photos already in your iPhone library remain there.</Text></View>
             <Pressable onPress={confirmPhotoDelete} style={[styles.dataButton, { borderColor: colors.border }]}><Feather name="image" size={16} color={colors.foreground} /><Text style={[styles.dataButtonText, { color: colors.foreground }]}>Delete saved scan photos</Text></Pressable>
             <Pressable onPress={confirmErase} style={[styles.dataButton, { borderColor: colors.destructive }]}><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[styles.dataButtonText, { color: colors.destructive }]}>Erase all local data</Text></Pressable>
            <Pressable onPress={() => setSettingsOpen(false)} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>Save preferences</Text></Pressable>
             </ScrollView>
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
  settingsSheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20 },
  settingsScroll: { paddingBottom: 4 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium' },
  chipWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reminderHint: { fontSize: 12, marginTop: 10, marginBottom: 7 },
  offlineNote: { flexDirection: 'row', gap: 9, borderRadius: 14, padding: 12, marginTop: 14 },
  offlineText: { flex: 1, fontSize: 11, lineHeight: 16 },
  dataButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 10 },
  dataButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  saveButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  saveButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
