// Nomi design tokens. Every screen reads colors through the theme (dark by
// default, optional light) and sizes from the scales below, so spacing,
// type and color stay consistent everywhere.
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
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
};

const dark: Palette = {
  bg: "#0A0B0F",
  chrome: "#0D0E13",
  surface: "#13151B",
  surfaceHover: "#191C23",
  sunken: "#0E1015",
  overlay: "rgba(4, 5, 8, 0.72)",
  border: "rgba(255, 255, 255, 0.07)",
  borderStrong: "rgba(255, 255, 255, 0.13)",
  text: "#F3EFE9",
  textSecondary: "#A9A49C",
  textTertiary: "#706B64",
  accent: "#F08A4B",
  accentHover: "#F79A60",
  accentSoft: "rgba(240, 138, 75, 0.13)",
  accentText: "#F5A06C",
  onAccent: "#1B0F07",
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
};

const light: Palette = {
  bg: "#F7F5F1",
  chrome: "#F1EEE8",
  surface: "#FFFFFF",
  surfaceHover: "#FBF9F6",
  sunken: "#EFECE6",
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

function typeScale(c: Palette) {
  return {
    display: { fontFamily: font.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.7, color: c.text },
    title: { fontFamily: font.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: c.text },
    heading: { fontFamily: font.heading, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: c.text },
    body: { fontSize: 15, lineHeight: 22, color: c.text },
    bodySecondary: { fontSize: 15, lineHeight: 22, color: c.textSecondary },
    label: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const, color: c.text },
    small: { fontSize: 13, lineHeight: 18, color: c.textSecondary },
    caption: { fontSize: 12, lineHeight: 16, color: c.textTertiary },
    overline: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "600" as const,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      color: c.textTertiary,
    },
    stat: { fontFamily: font.heading, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: c.text },
  };
}

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

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...themes[mode],
      setMode: (next: ThemeMode) => {
        setModeState(next);
        void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      },
    }),
    [mode],
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
