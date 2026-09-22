import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Ingredient } from '@/context/KitchenContext';
import type { Recipe } from '@/data/recipes';

export function AppHeader({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable testID="header-action" onPress={onAction} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card }, pressed && styles.pressed]}>
          <Feather name={action as 'settings'} size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionTitleText, { color: colors.foreground }]}>{title}</Text>
      {action && onPress ? <Pressable onPress={onPress}><Text style={[styles.link, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: string }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.chip,
      { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
      pressed && styles.pressed,
    ]}>
      {icon ? <Ionicons name={icon as 'checkmark'} size={14} color={selected ? colors.primaryForeground : colors.mutedForeground} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

export function RecipeCard({ recipe, hasIngredients, statusText, onPress }: { recipe: Recipe; hasIngredients?: boolean; statusText?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable testID={`recipe-${recipe.id}`} onPress={onPress} style={({ pressed }) => [styles.recipeCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
      {recipe.image ? <Image source={recipe.image} contentFit="cover" style={styles.recipeImage} /> : <View style={[styles.recipeImage, { backgroundColor: colors.secondary }]}><Ionicons name="restaurant-outline" size={34} color={colors.primary} /></View>}
      <View style={styles.recipeBody}>
        <View style={styles.recipeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.recipeTitle, { color: colors.foreground }]}>{recipe.title}</Text>
            <Text style={[styles.recipeMeta, { color: colors.mutedForeground }]}>{recipe.cuisine} · {recipe.prep + recipe.cook} min · {recipe.difficulty}</Text>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: recipe.score >= 85 ? colors.secondary : colors.accent }]}>
            <Text style={[styles.scoreText, { color: recipe.score >= 85 ? colors.primary : colors.accentForeground }]}>{recipe.score}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={[styles.recipeDescription, { color: colors.mutedForeground }]}>{recipe.description}</Text>
        <View style={styles.recipeFooter}>
          <View style={[styles.statusPill, { backgroundColor: hasIngredients ? colors.secondary : colors.muted }]}>
            <View style={[styles.statusDot, { backgroundColor: hasIngredients ? colors.primary : colors.mutedForeground }]} />
            <Text style={[styles.statusText, { color: hasIngredients ? colors.primary : colors.mutedForeground }]}>{statusText ?? (hasIngredients ? 'Ready with your kitchen' : 'Check ingredients')}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

export function IngredientRow({ ingredient, onPress, onDelete }: { ingredient: Ingredient; onPress?: () => void; onDelete?: () => void }) {
  const colors = useColors();
  const locationIcon = ingredient.location === 'Refrigerator' ? 'thermometer' : ingredient.location === 'Freezer' ? 'cloud-snow' : 'archive';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ingredientRow, { borderBottomColor: colors.border }, pressed && styles.pressed]}>
      <View style={[styles.ingredientIcon, { backgroundColor: ingredient.status === 'low' ? colors.accent : colors.secondary }]}>
        <Feather name={locationIcon as 'archive'} size={17} color={ingredient.status === 'low' ? colors.accentForeground : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.recipeRow}>
          <Text style={[styles.ingredientName, { color: colors.foreground }]}>{ingredient.name}</Text>
          {ingredient.confidence === 'uncertain' ? <Text style={[styles.uncertain, { color: colors.accentForeground }]}>Uncertain</Text> : null}
        </View>
        <Text style={[styles.ingredientMeta, { color: colors.mutedForeground }]}>{ingredient.quantity ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}` : 'Quantity unknown'} · {ingredient.location}</Text>
      </View>
      {onDelete ? <Pressable testID={`delete-${ingredient.id}`} onPress={onDelete} hitSlop={10}><Feather name="trash-2" size={17} color={colors.mutedForeground} /></Pressable> : <Feather name="chevron-right" size={17} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  headerTitle: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleText: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  chip: { minHeight: 36, paddingHorizontal: 14, borderWidth: 1, borderRadius: 18, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  recipeCard: { borderWidth: 1, borderRadius: 22, overflow: 'hidden', marginBottom: 14 },
  recipeImage: { width: '100%', height: 168 },
  recipeBody: { padding: 15 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recipeTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  recipeMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  recipeDescription: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  recipeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  scoreBadge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  statusPill: { borderRadius: 13, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  ingredientIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  ingredientMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  uncertain: { fontSize: 10, fontFamily: 'Inter_700Bold', backgroundColor: '#f1c872', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  pressed: { opacity: 0.72 },
});