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
    background: '#050b1d',
    backgroundGlow: '#0b1532',
    foreground: '#eef3ff',

    // Cards / elevated surfaces
    card: '#0b1630',
    cardForeground: '#eef3ff',

    // Primary action color (buttons, links, active states)
    primary: '#2867ff',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#111e3e',
    secondaryForeground: '#e9efff',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#111e3e',
    mutedForeground: '#91a2c5',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#7955ff',
    accentForeground: '#ffffff',

    // Destructive actions (delete, error states)
    destructive: '#ff7186',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#1b2b54',
    input: '#1b2b54',
    success: '#00d99a',
    successSurface: 'rgba(0, 217, 154, 0.12)',
    successBorder: 'rgba(0, 217, 154, 0.28)',
    errorSurface: 'rgba(255, 113, 134, 0.12)',
    iconSurface: '#111f48',
    badgeSurface: 'rgba(79, 105, 255, 0.18)',
    pendingSurface: 'rgba(121, 85, 255, 0.13)',
    selectedCard: '#0d1d44',
    radioBorder: '#53648d',
    orbEdge: '#344cff',
    navSurface: '#07112b',
    placeholder: '#7182a6',
  },
  dark: {
    text: '#eef3ff',
    tint: '#4c83f4',
    background: '#050b1d',
    backgroundGlow: '#0b1532',
    foreground: '#eef3ff',
    card: '#0b1630',
    cardForeground: '#eef3ff',
    primary: '#2867ff',
    primaryForeground: '#ffffff',
    secondary: '#111e3e',
    secondaryForeground: '#e9efff',
    muted: '#111e3e',
    mutedForeground: '#91a2c5',
    accent: '#7955ff',
    accentForeground: '#ffffff',
    destructive: '#ff7186',
    destructiveForeground: '#ffffff',
    border: '#1b2b54',
    input: '#1b2b54',
    success: '#00d99a',
    successSurface: 'rgba(0, 217, 154, 0.12)',
    successBorder: 'rgba(0, 217, 154, 0.28)',
    errorSurface: 'rgba(255, 113, 134, 0.12)',
    iconSurface: '#111f48',
    badgeSurface: 'rgba(79, 105, 255, 0.18)',
    pendingSurface: 'rgba(121, 85, 255, 0.13)',
    selectedCard: '#0d1d44',
    radioBorder: '#53648d',
    orbEdge: '#344cff',
    navSurface: '#07112b',
    placeholder: '#7182a6',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
