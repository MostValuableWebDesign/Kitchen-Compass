import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { ExternalRecipe } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

/** Providers without a public recipe permalink expose their cooking steps in the current session. */
export function OnlineRecipeDetails({ recipe }: { recipe: ExternalRecipe }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'View'} recipe: ${recipe.title}`} onPress={() => setExpanded((value) => !value)}>
      <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>{expanded ? 'Hide recipe' : 'View recipe'}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: 10 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Ingredients</Text>
      {recipe.ingredients.map((item, index) => <Text key={index} style={{ color: colors.foreground }}>{item.measure || item.name}</Text>)}
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Instructions</Text>
      {recipe.instructions.split('\n').filter(Boolean).map((step, index) => <Text key={index} style={{ color: colors.foreground }}>{index + 1}. {step}</Text>)}
      <Text style={{ color: colors.mutedForeground }}>Review ingredients, quantities, and cooking safety before cooking. Available for this search session.</Text>
      <Pressable onPress={() => void Linking.openURL(recipe.provider === 'RecipeAPI.io' ? 'https://recipeapi.io' : 'https://api-ninjas.com/api/recipe')}><Text style={{ color: colors.primary }}>Provided by {recipe.provider} ↗</Text></Pressable>
    </View> : null}
  </View>;
}
