import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { NAV } from "@/components/nav";
import { Txt } from "@/components/Txt";
import { makeStyles, space, useTheme } from "@/lib/theme";

// Phone tabs: the four daily destinations and the record button. Map,
// Search and Profile open from Home's header.
const TABS = ["/", "/contacts", "/follow-ups", "/events"].map((href) => NAV.find((n) => n.href === href)!);

export function showsTabBar(pathname: string): boolean {
  return ["/", "/contacts", "/network", "/profile", "/follow-ups", "/search", "/events", "/invite"].includes(pathname) ||
    /^\/contacts\/[^/]+$/.test(pathname);
}

export const TAB_BAR_SPACE = 84;

export function TabBar() {
  const s = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const tab = (t: (typeof TABS)[number]) => {
    const active = t.match(pathname);
    return (
      <Pressable key={t.label} onPress={() => router.navigate(t.href)} accessibilityRole="tab"
        accessibilityState={{ selected: active }} accessibilityLabel={t.label} style={s.tab} hitSlop={4}>
        <Icon name={t.icon} size={21} color={active ? colors.accentText : colors.textTertiary} />
        <Txt variant="caption" weight="500" style={{ color: active ? colors.text : colors.textTertiary, fontSize: 11 }}>
          {t.label === "Plan Events" ? "Events" : t.label}
        </Txt>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]} accessibilityRole="tablist">
      {TABS.slice(0, 2).map(tab)}
      <View style={s.tab}>
        <Pressable onPress={() => router.push("/record")} onLongPress={() => router.push("/session")} delayLongPress={350}
          accessibilityRole="button" accessibilityLabel="Remember someone" accessibilityHint="Hold to start a networking session"
          style={({ pressed }) => [s.record, pressed && { transform: [{ scale: 0.95 }] }]}>
          <Icon name="mic" size={22} color={colors.onAccent} />
        </Pressable>
      </View>
      {TABS.slice(2).map(tab)}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    bar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      paddingTop: space.xs,
      backgroundColor: colors.chrome,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 48 },
    record: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
  }),
);
