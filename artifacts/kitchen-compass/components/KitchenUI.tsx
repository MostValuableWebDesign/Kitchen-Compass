import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import type { Ingredient } from '@/context/KitchenContext';
import type { Recipe } from '@/data/recipes';
import { FoodIllustrationsExtra } from '@/components/FoodIllustrationsExtra';
import { confirmedDateStatus } from '@/lib/kitchenLogic';
import { foodIconForIngredient, type FoodIconName, type FoodIconTone } from '@/lib/foodIcons';

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

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: string; testID?: string }) {
  const colors = useColors();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [
      styles.chip,
      { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
      pressed && styles.pressed,
    ]}>
      {icon ? <Ionicons name={icon as 'checkmark'} size={14} color={selected ? colors.primaryForeground : colors.mutedForeground} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

export function RecipeCard({ recipe, hasIngredients, statusText, favorite, onFavorite, onArchive, onPress }: { recipe: Recipe; hasIngredients?: boolean; statusText?: string; favorite?: boolean; onFavorite?: () => void; onArchive?: () => void; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable testID={`recipe-${recipe.id}`} onPress={onPress} style={({ pressed }) => [styles.recipeCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
      {recipe.image ? <Image source={typeof recipe.image === 'string' ? { uri: recipe.image } : recipe.image} contentFit="cover" style={styles.recipeImage} /> : <View style={[styles.recipeImage, { backgroundColor: colors.secondary }]}><Ionicons name="restaurant-outline" size={34} color={colors.primary} /></View>}
      <View style={styles.recipeBody}>
        <View style={styles.titleLine}>
          <Text numberOfLines={2} style={[styles.recipeTitle, { color: colors.foreground }]}>{recipe.title}</Text>
          {onFavorite ? <Pressable testID={`favorite-${recipe.id}`} accessibilityLabel={favorite ? 'Remove favorite' : 'Add favorite'} onPress={onFavorite} hitSlop={8} style={styles.favoriteButton}><Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? colors.destructive : colors.mutedForeground} /></Pressable> : null}
        </View>
        <Text style={[styles.recipeMeta, { color: colors.mutedForeground }]}>{recipe.cuisine} · {recipe.prep + recipe.cook} min · {recipe.difficulty}</Text>
        <View style={[styles.healthRow, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.healthLabel, { color: colors.secondaryForeground }]}>Health score</Text>
          <Text testID={`health-score-${recipe.id}`} style={[styles.healthValue, { color: colors.primary }]}>{recipe.healthScore.score !== undefined ? `${recipe.healthScore.score}/100` : 'Unavailable'}</Text>
        </View>
        {recipe.healthScore.score === undefined ? <Text style={[styles.healthHint, { color: colors.mutedForeground }]} numberOfLines={2}>{recipe.healthScore.note}</Text> : null}
        <Text numberOfLines={2} style={[styles.recipeDescription, { color: colors.mutedForeground }]}>{recipe.description}</Text>
        {recipe.imageSource ? <Text style={[styles.imageCredit, { color: colors.mutedForeground }]}>{recipe.imageSource === 'AI-generated' ? 'Illustrative AI image' : 'Photo: TheMealDB'}</Text> : null}
        <View style={styles.recipeFooter}>
          <View style={[styles.statusPill, { backgroundColor: hasIngredients ? colors.secondary : colors.muted }]}>
            <View style={[styles.statusDot, { backgroundColor: hasIngredients ? colors.primary : colors.mutedForeground }]} />
            <Text style={[styles.statusText, { color: hasIngredients ? colors.primary : colors.mutedForeground }]}>{statusText ?? (hasIngredients ? 'Ready with your kitchen' : 'Check ingredients')}</Text>
          </View>
          <View style={styles.recipeFooterActions}>
            {onArchive ? <Pressable testID={`archive-${recipe.id}`} accessibilityLabel={`Archive ${recipe.title}`} onPress={(event) => { event.stopPropagation(); onArchive(); }} style={styles.archiveButton}><Feather name="archive" size={17} color={colors.mutedForeground} /></Pressable> : null}
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FoodIllustration({ icon, size, colors }: { icon: FoodIconName; size: number; colors: ReturnType<typeof useColors> }) {
  const herb = colors.primary;
  const highlight = colors.secondaryForeground;
  const flesh = colors.accent;
  const seed = colors.accentForeground;

  switch (icon) {
    case 'illustration-avocado':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M24 4C18 4 17 12 13 19 9 26 8 31 12 37c5 7 19 7 24 0 4-6 3-11-1-18C31 12 30 4 24 4Z" fill={herb} />
          <Path d="M24 10c-4 0-5 7-8 12-3 5-4 9-1 13 3 4 15 4 18 0 3-4 2-8-1-13-3-5-4-12-8-12Z" fill={flesh} />
          <Ellipse cx="24" cy="29" rx="5" ry="6" fill={seed} />
        </Svg>
      );
    case 'illustration-tomato':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M24 13c-4-3-9-3-13 0-7 5-7 17-1 23 6 6 18 7 27 1 9-7 8-20 0-25-4-2-9-2-13 1Z" fill={colors.destructive} />
          <Path d="m24 17-3-7-5 2 3-6 6 4 4-5 1 7 7-1-5 6-6-2-2 6-3-6-7 2 4-6Z" fill={herb} />
          <Path d="M24 9c0-3 2-5 5-6" fill="none" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" />
        </Svg>
      );
    case 'illustration-broccoli':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M18 25h12l3 16H15l3-16Z" fill={flesh} />
          <Circle cx="15" cy="21" r="8" fill={herb} />
          <Circle cx="24" cy="15" r="10" fill={herb} />
          <Circle cx="33" cy="21" r="8" fill={herb} />
          <Circle cx="18" cy="20" r="2" fill={highlight} opacity="0.5" />
          <Circle cx="27" cy="14" r="2" fill={highlight} opacity="0.5" />
        </Svg>
      );
    case 'illustration-garlic':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M23 11c-2-4-1-7 1-9 3 3 3 6 2 9 6 1 11 7 12 14 2 10-5 17-14 18-9-1-16-8-14-18 1-7 6-12 13-14Z" fill={colors.card} stroke={seed} strokeWidth="2.2" />
          <Path d="M23 14c-2 8-3 18 0 26M26 14c4 8 5 17 3 24M20 15c-4 8-5 16-3 21" fill="none" stroke={seed} strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M23 10c-4-5-8-5-11-4 2 4 5 6 10 7m5-3c4-5 8-5 11-4-2 4-5 6-10 7" fill={herb} />
        </Svg>
      );
    case 'illustration-basil':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M12 39c9-9 14-16 24-30" fill="none" stroke={herb} strokeWidth="2.4" strokeLinecap="round" />
          <Path d="M14 34C7 32 6 26 8 21c6 0 10 4 9 10m4-9c-2-7 2-12 7-14 4 5 3 11-3 15m2 3c1-7 7-9 12-8 1 6-3 11-10 11" fill={herb} />
          <Path d="m12 26 5 5m7-12-1 5m11 1-6 5" fill="none" stroke={highlight} strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case 'illustration-parsley':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M24 42V21m0 13L13 23m11 7 11-10" fill="none" stroke={herb} strokeWidth="2.3" strokeLinecap="round" />
          <Path d="M24 23c-7 0-11-5-9-11 6-1 10 2 9 11Zm1-1c-1-7 3-11 9-10 2 6-2 10-9 10ZM14 28c-6-1-9-6-7-11 6 0 9 4 7 11Zm22-2c1-6 6-9 11-7 0 6-4 9-11 7Z" fill={herb} />
          <Circle cx="24" cy="12" r="2" fill={highlight} opacity="0.65" />
          <Circle cx="10" cy="20" r="1.7" fill={highlight} opacity="0.65" />
          <Circle cx="43" cy="21" r="1.7" fill={highlight} opacity="0.65" />
        </Svg>
      );
    case 'illustration-spinach':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M24 40V18m0 17L12 25m12 4 12-12" fill="none" stroke={highlight} strokeWidth="2" strokeLinecap="round" />
          <Path d="M24 21C13 22 8 16 10 7c10-2 16 3 14 14Zm1-2C25 9 31 4 40 7c1 10-5 15-15 12ZM13 29c-7 0-10-5-8-11 7-1 11 3 8 11Zm23-2c1-7 6-10 12-7 0 7-4 10-12 7Z" fill={herb} />
        </Svg>
      );
    case 'illustration-onion':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M24 7c-3 6-12 9-14 19-2 9 4 16 14 17 10-1 16-8 14-17C36 16 27 13 24 7Z" fill={flesh} stroke={seed} strokeWidth="2" />
          <Path d="M24 11c-2 9-2 21 0 29m-1-24c-5 5-7 12-5 19m7-19c5 5 7 12 5 19" fill="none" stroke={seed} strokeWidth="1.6" strokeLinecap="round" />
          <Path d="M23 8c-1-3 0-5 2-7" fill="none" stroke={herb} strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case 'illustration-cucumber':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M11 34c-3-3-2-9 2-14L28 5c4-4 10-4 13 0s4 9 0 13L27 33c-5 5-12 5-16 1Z" fill={herb} />
          <Path d="m15 31 19-22m-14 27L39 17" fill="none" stroke={highlight} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
          <Circle cx="12" cy="33" r="2" fill={flesh} />
          <Circle cx="40" cy="7" r="2" fill={flesh} />
        </Svg>
      );
    case 'illustration-potato':
      return (
        <Svg viewBox="0 0 48 48" width={size} height={size}>
          <Path d="M7 25C7 15 15 9 25 10c10-1 17 5 17 14s-8 15-18 15C14 39 7 34 7 25Z" fill={flesh} stroke={seed} strokeWidth="1.7" />
          <Circle cx="17" cy="20" r="1.6" fill={seed} />
          <Circle cx="29" cy="17" r="1.4" fill={seed} />
          <Circle cx="33" cy="28" r="1.5" fill={seed} />
          <Circle cx="20" cy="31" r="1.3" fill={seed} />
        </Svg>
      );
    default:
      return <FoodIllustrationsExtra icon={icon} size={size} colors={colors} />;
  }
}

type FoodIllustrationName = Extract<FoodIconName, `illustration-${string}`>;

function isFoodIllustration(icon: FoodIconName): icon is FoodIllustrationName {
  return icon.startsWith('illustration-');
}

export function FoodIdentityIcon({ name, size = 38 }: { name: string; size?: number }) {
  const colors = useColors();
  const visual = foodIconForIngredient(name);
  const tones: Record<FoodIconTone, { color: string; backgroundColor: string }> = {
    leaf: { color: colors.primary, backgroundColor: colors.secondary },
    citrus: { color: colors.accentForeground, backgroundColor: colors.accent },
    berry: { color: colors.destructive, backgroundColor: colors.muted },
    ocean: { color: colors.secondaryForeground, backgroundColor: colors.secondary },
    grain: { color: colors.accentForeground, backgroundColor: colors.secondary },
    neutral: { color: colors.mutedForeground, backgroundColor: colors.muted },
  };
  const tone = tones[visual.tone];

  return (
    <View
      accessible={false}
      style={[
        styles.ingredientIcon,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: tone.backgroundColor,
        },
      ]}
    >
      {isFoodIllustration(visual.icon)
        ? <FoodIllustration icon={visual.icon} size={Math.round(size * 0.66)} colors={colors} />
        : <MaterialCommunityIcons name={visual.icon} size={Math.round(size * 0.52)} color={tone.color} />}
    </View>
  );
}

export function IngredientRow({ ingredient, onPress, onDelete }: { ingredient: Ingredient; onPress?: () => void; onDelete?: () => void }) {
  const colors = useColors();
  const dateStatus = ingredient.dateConfirmed ? confirmedDateStatus(ingredient.expires) : null;
  const quantityLabel = ingredient.quantityKnown && ingredient.quantityValue !== undefined && ingredient.unit
    ? `${ingredient.quantityValue} ${ingredient.unit}`
    : 'Quantity unknown';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ingredientRow, { borderBottomColor: colors.border }, pressed && styles.pressed]}>
      <FoodIdentityIcon name={ingredient.name} />
      <View style={{ flex: 1 }}>
        <View style={styles.recipeRow}>
          <Text style={[styles.ingredientName, { color: colors.foreground }]}>{ingredient.name}</Text>
          {ingredient.confidence === 'uncertain' ? <Text style={[styles.uncertain, { color: colors.accentForeground }]}>Uncertain</Text> : null}
        </View>
        <Text style={[styles.ingredientMeta, { color: colors.mutedForeground }]}>{quantityLabel} · {ingredient.location}</Text>
        {dateStatus ? <Text style={[styles.dateWarning, { color: colors.destructive }]}>{dateStatus === 'expired' ? 'Confirmed date has passed' : `${ingredient.dateKind === 'best-before' ? 'Best before' : 'Expires'} soon`}</Text> : null}
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
  recipeTitle: { flex: 1, minWidth: 0, fontSize: 18, fontFamily: 'Inter_700Bold' },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  favoriteButton: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  recipeMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  recipeDescription: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  imageCredit: { fontSize: 10, marginTop: 6 },
  recipeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  recipeFooterActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  archiveButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  healthRow: { minHeight: 36, borderRadius: 12, marginTop: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  healthLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  healthValue: { fontSize: 14, fontFamily: 'Inter_700Bold', flexShrink: 0 },
  healthHint: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  statusPill: { borderRadius: 13, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  ingredientIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  ingredientMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  uncertain: { fontSize: 10, fontFamily: 'Inter_700Bold', backgroundColor: '#f1c872', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  dateWarning: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  pressed: { opacity: 0.72 },
});
