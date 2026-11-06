import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { NAV } from "@/components/nav";
import { Txt } from "@/components/Txt";
import { makeStyles, space, useTheme } from "@/lib/theme";

// Phone navigation: Sessions, Search and Map, with the one action that
// matters (start a session) right beside them.
export function showsTabBar(pathname: string): boolean {
  return ["/", "/network", "/search"].includes(pathname);
}

// Room to leave under scrolling content so the floating bar never covers it.
export const TAB_BAR_SPACE = 96;

export function TabBar() {
  const s = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[s.wrap, { bottom: Math.max(insets.bottom, space.sm) }]} pointerEvents="box-none">
      <View style={s.bar} accessibilityRole="tablist">
        {NAV.map((t) => {
          const active = t.match(pathname);
          return (
            <Pressable key={t.label} onPress={() => router.navigate(t.href)} accessibilityRole="tab"
              accessibilityState={{ selected: active }} accessibilityLabel={t.label} style={s.tab}>
              <Icon name={t.icon} size={21} color={active ? colors.text : colors.textTertiary} strokeWidth={active ? 2.2 : 1.8} />
              <Txt variant="overline" style={{ color: active ? colors.text : colors.textTertiary, letterSpacing: 0.3, textTransform: "none" }}>{t.label}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => router.push("/session")} accessibilityRole="button" accessibilityLabel="Start a session"
        style={({ pressed }) => [s.action, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Icon name="mic" size={24} color={colors.onAccent} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    wrap: { position: "absolute", left: space.md, right: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
    bar: {
      flex: 1,
      height: 64,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: space.xxs,
      borderRadius: 32,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.raised,
    },
    tab: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 2 },
    action: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      ...shadow.raised,
    },
  }),
);
