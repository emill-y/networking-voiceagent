// Nomi design tokens: a calm, paper-like look (in the spirit of Granola).
// Warm white pages, near-black type, a serif for titles, hairline borders,
// black primary buttons, and one live color: green, meaning "recording".
// Every screen reads colors through the theme and sizes from the scales below.
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "dark" | "light";

type Palette = {
  // Surfaces, back to front
  bg: string; // page
  chrome: string; // sidebar, tab bar
  surface: string; // cards
  surfaceHover: string;
  sunken: string; // inputs, segmented controls, tracks
  overlay: string; // modal scrim
  border: string;
  borderStrong: string;
  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  // Brand: Jupiter orange
  accent: string;
  accentHover: string;
  accentSoft: string; // tinted backgrounds
  accentText: string; // accent used as text on surfaces (contrast-checked)
  onAccent: string;
  // Support (the 20%): selections, avatars, chips, secondary emphasis
  support: string;
  supportSoft: string;
  supportText: string;
  // Live: a session is recording
  live: string;
  liveSoft: string;
  // Status
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  // Network: why two people are connected
  edgeWork: string;
  edgeEvent: string;
  edgeInterest: string;
  edgeYou: string;
  // Cosmic backdrop
  glow: string;
  orbit: string;
  // Skeletons
  skeleton: string;
  // The network map keeps its original neutral surface
  mapSurface: string;
  mapBorder: string;
};

// One light palette, used everywhere. (The "dark" key stays so older
// call sites keep working; it is the same paper look.)
const light: Palette = {
  bg: "#FAF9F6",
  chrome: "#F5F3EF",
  surface: "#FFFFFF",
  surfaceHover: "#F7F6F2",
  sunken: "#F2F0EB",
  overlay: "rgba(24, 22, 18, 0.28)",
  border: "#ECE9E3",
  borderStrong: "#DCD8D0",
  text: "#1B1A17",
  textSecondary: "#5E5B55",
  textTertiary: "#8E8A82",
  accent: "#1B1A17",
  accentHover: "#33312C",
  accentSoft: "rgba(27, 26, 23, 0.06)",
  accentText: "#1B1A17",
  onAccent: "#FFFFFF",
  support: "#5E5B55",
  supportSoft: "#F1EFEA",
  supportText: "#3F3D38",
  live: "#2E7D52",
  liveSoft: "rgba(46, 125, 82, 0.10)",
  success: "#2E7D52",
  successSoft: "rgba(46, 125, 82, 0.10)",
  warning: "#A2670F",
  warningSoft: "rgba(162, 103, 15, 0.10)",
  danger: "#BF3B2B",
  dangerSoft: "rgba(191, 59, 43, 0.08)",
  edgeWork: "#5878B4",
  edgeEvent: "#C26B36",
  edgeInterest: "#4C8A63",
  edgeYou: "rgba(27, 26, 23, 0.14)",
  glow: "rgba(0, 0, 0, 0)",
  orbit: "rgba(27, 26, 23, 0.07)",
  skeleton: "#EFECE6",
  mapSurface: "#FFFFFF",
  mapBorder: "#ECE9E3",
};
const dark: Palette = light;

// Spacing scale (4pt grid). Use these, never ad-hoc numbers.
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// Page widths on desktop.
export const layout = {
  page: 1080,
  narrow: 720,
  sidebar: 232,
  // Below this width, the phone layout (tab bar) is used.
  desktopBreakpoint: 900,
} as const;

// Titles: Newsreader (a quiet serif). UI headings: Inter Tight. Body: the
// platform's UI font (San Francisco on iPhone).
export const font = {
  serif: "Newsreader_500Medium",
  heading: "InterTight_600SemiBold",
  headingBold: "InterTight_700Bold",
  medium: "InterTight_500Medium",
} as const;

// Phones read type larger than desktops (iOS body is 17pt, macOS 13pt), so
// the phone layout gets its own, bigger scale with the same names.
function typeScale(c: Palette, phone = false) {
  const z = phone
    ? { display: [34, 40], title: [26, 32], heading: [19, 24], body: [17, 24], label: [16, 22], small: [15, 20], caption: [13, 18], overline: [12, 16] }
    : { display: [34, 40], title: [24, 30], heading: [17, 22], body: [15, 22], label: [14, 20], small: [13, 18], caption: [12, 16], overline: [11, 14] };
  return {
    display: { fontFamily: font.serif, fontSize: z.display[0], lineHeight: z.display[1], letterSpacing: -0.6, color: c.text },
    title: { fontFamily: font.serif, fontSize: z.title[0], lineHeight: z.title[1], letterSpacing: -0.3, color: c.text },
    heading: { fontFamily: font.heading, fontSize: z.heading[0], lineHeight: z.heading[1], letterSpacing: -0.2, color: c.text },
    body: { fontSize: z.body[0], lineHeight: z.body[1], color: c.text },
    bodySecondary: { fontSize: z.body[0], lineHeight: z.body[1], color: c.textSecondary },
    label: { fontSize: z.label[0], lineHeight: z.label[1], fontWeight: "500" as const, color: c.text },
    small: { fontSize: z.small[0], lineHeight: z.small[1], color: c.textSecondary },
    caption: { fontSize: z.caption[0], lineHeight: z.caption[1], color: c.textTertiary },
    overline: {
      fontSize: z.overline[0],
      lineHeight: z.overline[1],
      fontWeight: "600" as const,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      color: c.textTertiary,
    },
    stat: { fontFamily: font.serif, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: c.text },
  };
}

const phoneType = { dark: typeScale(dark, true), light: typeScale(light, true) };

const paperShadow = {
  card: { shadowColor: "#1B1A17", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  raised: { shadowColor: "#1B1A17", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
};
const shadows = { dark: paperShadow, light: paperShadow };

export type Theme = {
  mode: ThemeMode;
  colors: Palette;
  type: ReturnType<typeof typeScale>;
  shadow: (typeof shadows)[ThemeMode];
};

export const themes: Record<ThemeMode, Theme> = {
  dark: { mode: "light", colors: dark, type: typeScale(dark), shadow: shadows.dark },
  light: { mode: "light", colors: light, type: typeScale(light), shadow: shadows.light },
};

// ---------- Provider ----------

const STORAGE_KEY = "nomi.theme";

type ThemeContextValue = Theme & { setMode: (mode: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue>({ ...themes.light, setMode: () => undefined });

export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: ThemeMode }) {
  // One look: light paper. (Kept as state so a dark look can return later.)
  const [mode, setModeState] = useState<ThemeMode>(initial ?? "light");

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    // Page background behind the app, and native form controls/scrollbars.
    document.documentElement.style.backgroundColor = themes[mode].colors.bg;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  // Phones (and narrow windows) get the larger phone type scale.
  const { width } = useWindowDimensions();
  const phone = Platform.OS !== "web" || width < 900;

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...themes[mode],
      type: phone ? phoneType[mode] : themes[mode].type,
      setMode: (next: ThemeMode) => {
        setModeState(next);
        void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      },
    }),
    [mode, phone],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Styles that depend on the theme, built once per mode:
//   const useStyles = makeStyles((t) => StyleSheet.create({ ... }));
//   const s = useStyles();
export function makeStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  return function useStyles() {
    const theme = useTheme();
    return (cache[theme.mode] ??= factory(themes[theme.mode]));
  };
}

// ---------- People ----------

// A personal color for each person, chosen by name so it's the same everywhere
// (soft, ink-like tones that sit quietly on paper).
const paperTints = ["#C2703E", "#A88A3C", "#B05B4A", "#7F68B4", "#4F76B5", "#3F8A5F", "#8E7B54", "#B25C7E"];
const tints = { dark: paperTints, light: paperTints } as const;

export function tintFor(name: string | null | undefined, mode: ThemeMode = "dark"): string {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const list = tints[mode];
  return list[hash % list.length];
}

// Nomi's one brand color: the small orange planet (logo, and "you" on the map).
export const orb = {
  light: "#FFD3B0",
  mid: "#E8743B",
  deep: "#C9531E",
  shadow: "#7A2E0D",
  glow: "#E8743B",
} as const;
