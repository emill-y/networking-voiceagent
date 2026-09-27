// Nomi design tokens: dark editorial minimalism.
// Screens import from here instead of hard-coding colors, so the palette
// can change in one place.

export const colors = {
  background: "#171A1D", // near-black page
  surface: "#20252A", // dark charcoal section
  raised: "#2A3035", // interactive surface
  text: "#F2EEE8", // warm ivory
  textSoft: "#D8D1C8",
  muted: "#A8A19A", // warm gray metadata
  faint: "#6F6A64",
  hairline: "rgba(242, 238, 232, 0.08)",
  accent: "#C9B79C", // restrained warm sand, used sparingly
  accentBright: "#E6C9A0", // highlight end of the warm gradient
  glowWarm: "#C98B55", // background light, top
  glowCool: "#5B6BB0", // background light, bottom
  card: "rgba(32, 37, 42, 0.72)", // cards float over the glow
  cardBorder: "rgba(242, 238, 232, 0.07)",
  danger: "#C98A7D", // dusty terracotta for errors and destructive actions
} as const;

// A personal color for each person: muted, warm-leaning tints that read on
// the dark background and never compete with text. Chosen by name, so a
// person keeps their color everywhere.
export const personTints = [
  "#C9956B", // clay
  "#8FA98A", // sage
  "#7E9CC4", // sky
  "#C48BA0", // rose
  "#A392C9", // lavender
  "#6FA8A0", // teal
  "#C9B26B", // ochre
  "#9AA3AE", // slate
] as const;

export function tintFor(name: string | null | undefined): string {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return personTints[hash % personTints.length];
}

// Serif = personality / memory. Sans (the platform system font) = function.
export const fonts = {
  serif: "CormorantGaramond_500Medium",
  serifItalic: "CormorantGaramond_500Medium_Italic",
  serifBold: "CormorantGaramond_600SemiBold",
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
  display: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 46, color: colors.text },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.text },
  heading: { fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28, color: colors.text },
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
