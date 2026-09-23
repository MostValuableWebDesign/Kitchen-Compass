import colors from '@/constants/colors';
import { useKitchen } from '@/context/KitchenContext';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * The persisted app appearance setting selects the palette directly, so the
 * same theme is used on native devices and in the web preview.
 */
export function useColors() {
  const { theme } = useKitchen();
  const palette =
    theme === 'dark' && 'dark' in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
