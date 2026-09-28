// Nomi design tokens: dark editorial minimalism.
// Screens import from here instead of hard-coding colors, so the palette
// can change in one place.

export const colors = {
  background: "#080605", // near-black with a warm undertone
  surface: "#15100D", // dark ember section
  raised: "#221914", // interactive surface
  text: "#FFF6EE", // warm white
  textSoft: "#EFE1D6",
  muted: "#AD9A8D", // warm gray metadata
  faint: "#6F5F55",
  hairline: "rgba(255, 220, 200, 0.08)",
  accent: "#FF7A2A", // molten orange
  accentBright: "#FFB37F", // highlight end of the orange gradient
  glowWarm: "#FF6B1A", // background light, top
  glowCool: "#B8360A", // deep ember light, bottom
  card: "rgba(28, 19, 14, 0.72)", // glass cards float over the glow
  cardBorder: "rgba(255, 200, 170, 0.09)",
  danger: "#FF8A7A", // errors and destructive actions
} as const;

// The glossy orange orb (record button, tab bar), light to shadow.
export const orb = {
  light: "#FFE3C7",
  mid: "#FF8A3D",
  deep: "#E2440C",
  shadow: "#5A1604",
  glow: "#FF6B1A",
} as const;

// A personal color for each person: muted, warm-leaning tints that read on
// the dark background and never compete with text. Chosen by name, so a
// person keeps their color everywhere.
export const personTints = [
  "#FF8A3D", // flame
  "#FFB37F", // apricot
  "#F2643A", // ember
  "#FFD29D", // sand
  "#E8866A", // clay
  "#C9A0FF", // lilac
  "#7FC8FF", // sky
  "#8FE3B0", // mint
] as const;

export function tintFor(name: string | null | undefined): string {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return personTints[hash % personTints.length];
}

// Display = Inter Tight, set tight and bold; body = the platform system font.
// (Keys kept from the earlier serif design so every screen picks this up.)
export const fonts = {
  serif: "InterTight_600SemiBold",
  serifItalic: "InterTight_500Medium_Italic",
  serifBold: "InterTight_700Bold",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const type = {
  display: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 42, letterSpacing: -1.2, color: colors.text },
  title: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 33, letterSpacing: -0.8, color: colors.text },
  heading: { fontFamily: fonts.serifBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.textSoft },
  meta: { fontSize: 13, lineHeight: 18, color: colors.muted, letterSpacing: 0.2 },
  label: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
} as const;
