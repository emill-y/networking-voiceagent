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
  danger: "#C98A7D", // dusty terracotta for errors and destructive actions
} as const;

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
