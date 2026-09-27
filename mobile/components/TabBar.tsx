import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Icon, type IconName } from "@/components/Icon";
import { colors } from "@/lib/theme";

const TABS: { href: Href; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  { href: "/people", label: "People", icon: "people", match: (p) => p.startsWith("/people") },
  { href: "/network", label: "Map", icon: "map", match: (p) => p.startsWith("/network") },
  { href: "/you", label: "You", icon: "user", match: (p) => p.startsWith("/you") },
];

// Screens where the tab bar shows (not during capture, review or editing).
export function showsTabBar(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/people" ||
    pathname === "/network" ||
    pathname === "/you" ||
    pathname === "/follow-ups" ||
    pathname === "/search"
  );
}

export const TAB_BAR_SPACE = 110;

// A floating glass pill with the record button raised in the middle.
export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  const tab = (t: (typeof TABS)[number]) => {
    const active = t.match(pathname);
    return (
      <Pressable
        key={t.label}
        onPress={() => router.navigate(t.href)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t.label}
        style={styles.tab}
        hitSlop={6}
      >
        <Icon name={t.icon} size={22} color={active ? colors.text : colors.faint} />
        <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {left.map(tab)}
        <View style={styles.centerSpace} />
        {right.map(tab)}
      </View>
      <Pressable
        onPress={() => router.push("/record")}
        accessibilityRole="button"
        accessibilityLabel="Record a new memory"
        style={({ pressed }) => [styles.record, { bottom: Math.max(insets.bottom, 12) + 22 }, pressed && styles.pressed]}
      >
        <Svg style={StyleSheet.absoluteFill} width={62} height={62}>
          <Defs>
            <RadialGradient id="tabOrb" cx="35%" cy="28%" r="80%">
              <Stop offset="0" stopColor="#F6EFE4" />
              <Stop offset="0.55" stopColor={colors.accentBright} />
              <Stop offset="1" stopColor="#8E7556" />
            </RadialGradient>
          </Defs>
          <Circle cx={31} cy={31} r={31} fill="url(#tabOrb)" />
        </Svg>
        <View style={styles.glyph}>
          <Icon name="mic" size={26} color={colors.background} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    width: "92%",
    maxWidth: 440,
    height: 66,
    paddingHorizontal: 8,
    borderRadius: 33,
    backgroundColor: "rgba(28, 32, 36, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(242, 238, 232, 0.09)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: "100%",
  },
  centerSpace: {
    width: 72,
  },
  label: {
    fontSize: 10.5,
    color: colors.faint,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.text,
  },
  record: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#C98B55",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  glyph: {
    position: "relative",
    zIndex: 1,
  },
});
