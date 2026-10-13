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
    text: '#eef3ff',
    tint: '#4c83f4',

    // Core surfaces
    background: '#080D1B',
    backgroundGlow: '#10172f',
    foreground: '#eef3ff',

    // Cards / elevated surfaces
    card: '#101a2c',
    cardForeground: '#eef3ff',

    // Primary action color (buttons, links, active states)
    primary: '#2f81ff',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#18243a',
    secondaryForeground: '#e9efff',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#18243a',
    mutedForeground: '#8e9bb3',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#9b7bff',
    accentForeground: '#ffffff',

    // Destructive actions (delete, error states)
    destructive: '#f06c7a',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#28354b',
    input: '#28354b',
  },
  dark: {
    text: '#eef3ff',
    tint: '#4c83f4',
    background: '#080D1B',
    backgroundGlow: '#10172f',
    foreground: '#eef3ff',
    card: '#101a2c',
    cardForeground: '#eef3ff',
    primary: '#2f81ff',
    primaryForeground: '#ffffff',
    secondary: '#18243a',
    secondaryForeground: '#e9efff',
    muted: '#18243a',
    mutedForeground: '#8e9bb3',
    accent: '#9b7bff',
    accentForeground: '#ffffff',
    destructive: '#f06c7a',
    destructiveForeground: '#ffffff',
    border: '#28354b',
    input: '#28354b',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
