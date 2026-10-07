// Nomi design tokens. Every screen reads colors through the theme (dark by
// default, optional light) and sizes from the scales below, so spacing,
// type and color stay consistent everywhere.
//
// Color follows 70-20-10:
//   70% dominant: the neutral page (bg) and its starfield.
//   20% support:  a cool indigo for surfaces, chrome, avatars, chips,
//                 selections and anything that supports the content.
//   10% accent:   Jupiter orange, only for primary actions, the record
//                 button, "you", and the active place you are in.
// Reach for `support` before `accent`; if a screen looks orange, it's wrong.
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

const dark: Palette = {
  bg: "#0A0B0F",
  chrome: "#0D0F17",
  surface: "#131522",
  surfaceHover: "#1A1D2D",
  sunken: "#0F1119",
  overlay: "rgba(4, 5, 8, 0.72)",
  border: "rgba(170, 176, 255, 0.08)",
  borderStrong: "rgba(170, 176, 255, 0.15)",
  text: "#F3EFE9",
  textSecondary: "#A9A49C",
  textTertiary: "#706B64",
  accent: "#F08A4B",
  accentHover: "#F79A60",
  accentSoft: "rgba(240, 138, 75, 0.13)",
  accentText: "#F5A06C",
  onAccent: "#1B0F07",
  support: "#8B8FE0",
  supportSoft: "rgba(139, 143, 224, 0.14)",
  supportText: "#B7BAF2",
  success: "#5CC08C",
  successSoft: "rgba(92, 192, 140, 0.13)",
  warning: "#E6B450",
  warningSoft: "rgba(230, 180, 80, 0.13)",
  danger: "#F0705F",
  dangerSoft: "rgba(240, 112, 95, 0.13)",
  edgeWork: "#6FA0F6",
  edgeEvent: "#F08A4B",
  edgeInterest: "#5CC08C",
  edgeYou: "rgba(240, 138, 75, 0.22)",
  glow: "rgba(240, 138, 75, 0.10)",
  orbit: "rgba(255, 255, 255, 0.05)",
  skeleton: "rgba(255, 255, 255, 0.06)",
  mapSurface: "#0E1015",
  mapBorder: "rgba(255, 255, 255, 0.07)",
};

const light: Palette = {
  bg: "#F7F5F1",
  chrome: "#EFEEF5",
  surface: "#FFFFFF",
  surfaceHover: "#F7F7FC",
  sunken: "#ECEBF4",
  overlay: "rgba(23, 20, 15, 0.38)",
  border: "rgba(23, 20, 15, 0.08)",
  borderStrong: "rgba(23, 20, 15, 0.15)",
  text: "#18150F",
  textSecondary: "#5E5850",
  textTertiary: "#8E877D",
  accent: "#D9682A",
  accentHover: "#C85B20",
  accentSoft: "rgba(217, 104, 42, 0.10)",
  accentText: "#B8541C",
  onAccent: "#FFFFFF",
  support: "#5B5FB8",
  supportSoft: "rgba(91, 95, 184, 0.10)",
  supportText: "#474B9E",
  success: "#2F9463",
  successSoft: "rgba(47, 148, 99, 0.10)",
  warning: "#B7811C",
  warningSoft: "rgba(183, 129, 28, 0.11)",
  danger: "#D24B3A",
  dangerSoft: "rgba(210, 75, 58, 0.09)",
  edgeWork: "#3F74D8",
  edgeEvent: "#D9682A",
  edgeInterest: "#2F9463",
  edgeYou: "rgba(217, 104, 42, 0.22)",
  glow: "rgba(217, 104, 42, 0.07)",
  orbit: "rgba(23, 20, 15, 0.06)",
  skeleton: "rgba(23, 20, 15, 0.06)",
  mapSurface: "#EFECE6",
  mapBorder: "rgba(23, 20, 15, 0.08)",
};

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

// Headings: Inter Tight. Body: the platform's UI font.
export const font = {
  heading: "InterTight_600SemiBold",
  headingBold: "InterTight_700Bold",
  medium: "InterTight_500Medium",
} as const;

// Phones read type larger than desktops (iOS body is 17pt, macOS 13pt), so
// the phone layout gets its own, bigger scale with the same names.
function typeScale(c: Palette, phone = false) {
  const z = phone
    ? { display: [32, 38], title: [24, 30], heading: [19, 24], body: [17, 24], label: [16, 22], small: [15, 20], caption: [13, 18], overline: [12, 16] }
    : { display: [30, 36], title: [22, 28], heading: [17, 22], body: [15, 22], label: [14, 20], small: [13, 18], caption: [12, 16], overline: [11, 14] };
  return {
    display: { fontFamily: font.heading, fontSize: z.display[0], lineHeight: z.display[1], letterSpacing: -0.7, color: c.text },
    title: { fontFamily: font.heading, fontSize: z.title[0], lineHeight: z.title[1], letterSpacing: -0.4, color: c.text },
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
    stat: { fontFamily: font.heading, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: c.text },
  };
}

const phoneType = { dark: typeScale(dark, true), light: typeScale(light, true) };

const shadows = {
  dark: {
    card: {},
    raised: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  },
  light: {
    card: { shadowColor: "#2A2017", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    raised: { shadowColor: "#2A2017", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  },
} as const;

export type Theme = {
  mode: ThemeMode;
  colors: Palette;
  type: ReturnType<typeof typeScale>;
  shadow: (typeof shadows)[ThemeMode];
};

export const themes: Record<ThemeMode, Theme> = {
  dark: { mode: "dark", colors: dark, type: typeScale(dark), shadow: shadows.dark },
  light: { mode: "light", colors: light, type: typeScale(light), shadow: shadows.light },
};

// ---------- Provider ----------

const STORAGE_KEY = "nomi.theme";

type ThemeContextValue = Theme & { setMode: (mode: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue>({ ...themes.dark, setMode: () => undefined });

function storedModeSync(): ThemeMode | null {
  if (Platform.OS !== "web") return null;
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: ThemeMode }) {
  // Dark is the default. Web reads the saved choice synchronously (no flash).
  const [mode, setModeState] = useState<ThemeMode>(initial ?? storedModeSync() ?? "dark");

  useEffect(() => {
    if (initial || Platform.OS === "web") return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark") setModeState(value);
      })
      .catch(() => undefined);
  }, [initial]);

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

// A personal color for each person, chosen by name so it's the same everywhere.
const tints = {
  dark: ["#F08A4B", "#E7B07A", "#D97757", "#C8A2F0", "#7FB2F2", "#6CC6A0", "#E6C25A", "#EE8FA8"],
  light: ["#D9682A", "#B9803F", "#C0583A", "#8B63C9", "#3F74D8", "#2F9463", "#A5800F", "#C5507A"],
} as const;

export function tintFor(name: string | null | undefined, mode: ThemeMode = "dark"): string {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const list = tints[mode];
  return list[hash % list.length];
}

// The planet: the record button's glossy orb, the same in both themes.
export const orb = {
  light: "#FFE1C4",
  mid: "#F08A4B",
  deep: "#D2561C",
  shadow: "#5A1E08",
  glow: "#F08A4B",
} as const;
