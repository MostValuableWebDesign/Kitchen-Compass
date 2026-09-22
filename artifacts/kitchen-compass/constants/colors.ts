/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#20352c',
    tint: '#2f6f54',

    // Core surfaces
    background: '#f8f6ef',
    foreground: '#20352c',

    // Cards / elevated surfaces
    card: '#fffdf8',
    cardForeground: '#20352c',

    // Primary action color (buttons, links, active states)
    primary: '#2f6f54',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e6eee7',
    secondaryForeground: '#28513d',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#eeeae0',
    mutedForeground: '#7b8178',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f1c872',
    accentForeground: '#5b4820',

    // Destructive actions (delete, error states)
    destructive: '#bc5546',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e0ddd3',
    input: '#d4d7cc',
  },

  dark: {
    text: '#eef2e8',
    tint: '#9bc7a4',
    background: '#18221d',
    foreground: '#eef2e8',
    card: '#223029',
    cardForeground: '#eef2e8',
    primary: '#9bc7a4',
    primaryForeground: '#18311f',
    secondary: '#2e4336',
    secondaryForeground: '#dcebdd',
    muted: '#2b382f',
    mutedForeground: '#afbaaf',
    accent: '#e7c77b',
    accentForeground: '#473a1e',
    destructive: '#e18c7c',
    destructiveForeground: '#321915',
    border: '#3a493f',
    input: '#435248',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
