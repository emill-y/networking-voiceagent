import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { NAV } from "@/components/nav";
import { Sheet } from "@/components/Sheet";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// Phone navigation: a floating bar with the four daily destinations, and
// the main action broken out beside it. Map, Search and Profile open from
// Home's header. Detail and editing screens hide the bar entirely so their
// own actions have the room.
const TABS = ["/", "/contacts", "/follow-ups", "/events"].map((href) => NAV.find((n) => n.href === href)!);

export function showsTabBar(pathname: string): boolean {
  return ["/", "/contacts", "/network", "/follow-ups", "/search", "/events"].includes(pathname);
}

// Room to leave under scrolling content so the floating bar never covers it.
export const TAB_BAR_SPACE = 96;

export function TabBar() {
  const s = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [actions, setActions] = useState(false);

  const go = (href: Parameters<typeof router.push>[0]) => {
    setActions(false);
    router.push(href);
  };

  return (
    <>
      <View style={[s.wrap, { bottom: Math.max(insets.bottom, space.sm) }]} pointerEvents="box-none">
        <View style={s.bar} accessibilityRole="tablist">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Pressable key={t.label} onPress={() => router.navigate(t.href)} accessibilityRole="tab"
                accessibilityState={{ selected: active }} accessibilityLabel={t.label === "Plan Events" ? "Events" : t.label}
                style={s.tab}>
                <View style={[s.tabInner, active && s.tabActive]}>
                  <Icon name={t.icon} size={22} color={active ? colors.text : colors.textTertiary} strokeWidth={active ? 2.2 : 1.9} />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setActions(true)} onLongPress={() => go("/record")} delayLongPress={350}
          accessibilityRole="button" accessibilityLabel="Remember someone" accessibilityHint="Hold to start recording right away"
          style={({ pressed }) => [s.action, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Icon name="plus" size={26} color={colors.onAccent} strokeWidth={2.4} />
        </Pressable>
      </View>

      {/* The main action keeps you in place: a sheet with the three ways in. */}
      <Sheet visible={actions} title="Remember someone" onClose={() => setActions(false)} width={420}>
        <ActionRow icon="mic" title="Record a voice note" body="Say who you met in a sentence or two" primary onPress={() => go("/record")} />
        <ActionRow icon="pen" title="Type it" body="Write a quick note instead" onPress={() => go("/write")} />
        <ActionRow icon="radio" title="Start a session" body="At an event? Nomi listens and fills in everyone you meet" onPress={() => go("/session")} />
      </Sheet>
    </>
  );
}

function ActionRow({ icon, title, body, primary, onPress }: { icon: IconName; title: string; body: string; primary?: boolean; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [s.actionRow, pressed && { backgroundColor: colors.surfaceHover }]}>
      <View style={[s.actionIcon, primary && { backgroundColor: colors.accent }]}>
        <Icon name={icon} size={20} color={primary ? colors.onAccent : colors.supportText} />
      </View>
      <View style={s.flex}>
        <Txt variant="label">{title}</Txt>
        <Txt variant="small">{body}</Txt>
      </View>
      <Icon name="chevron" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    wrap: {
      position: "absolute",
      left: space.md,
      right: space.md,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
    },
    bar: {
      flex: 1,
      height: 64,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: space.xxs,
      borderRadius: 32,
      backgroundColor: colors.chrome,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.raised,
    },
    tab: { flex: 1, height: 56, alignItems: "center", justifyContent: "center" },
    tabInner: { width: 52, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    tabActive: { backgroundColor: colors.supportSoft },
    action: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: 0.45,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      minHeight: 64,
      paddingHorizontal: space.sm,
      paddingVertical: space.sm,
      marginHorizontal: -space.sm,
      borderRadius: radius.lg,
    },
    actionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.supportSoft,
    },
  }),
);
