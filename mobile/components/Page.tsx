import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Backdrop } from "@/components/Backdrop";
import { Icon } from "@/components/Icon";
import { TAB_BAR_SPACE } from "@/components/TabBar";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { layout, makeStyles, space, useTheme } from "@/lib/theme";

type Props = {
  title?: string;
  // Only when it tells the user something they need (a count, a status).
  subtitle?: string;
  // Buttons on the right of the title.
  actions?: ReactNode;
  // A "‹ Contacts" link above the title.
  back?: { label: string; href?: string };
  width?: "page" | "narrow";
  // Pages that manage their own scrolling (the map) pass false.
  scroll?: boolean;
  // Full-screen flows (recording, review) don't leave room for the tab bar.
  tabBar?: boolean;
  children: ReactNode;
};

// Every page: the same width, gutters, header and backdrop.
export function Page({ title, subtitle, actions, back, width = "page", scroll = true, tabBar = true, children }: Props) {
  const s = useStyles();
  const desktop = useDesktop();
  const router = useRouter();
  const { colors } = useTheme();
  const maxWidth = width === "narrow" ? layout.narrow : layout.page;
  const frame = [
    s.content,
    { maxWidth },
    desktop ? s.desktop : s.phone,
    !desktop && tabBar && { paddingBottom: TAB_BAR_SPACE + space.md },
  ];

  const header =
    title || back ? (
      <View style={s.headerBlock}>
        {back && (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace((back.href ?? "/") as never))}
            accessibilityRole="link"
            hitSlop={8}
            style={({ hovered }: { hovered?: boolean }) => [s.back, hovered && { opacity: 0.7 }]}
          >
            <Icon name="back" size={16} color={colors.textSecondary} />
            <Txt variant="small" tone="secondary" weight="500">{back.label}</Txt>
          </Pressable>
        )}
        {title ? (
          <View style={s.header}>
            <View style={s.titles}>
              <Txt variant="display" style={!desktop && s.titlePhone} accessibilityRole="header">{title}</Txt>
              {subtitle ? <Txt variant="small" tone="secondary">{subtitle}</Txt> : null}
            </View>
            {actions ? <View style={s.actions}>{actions}</View> : null}
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <Backdrop />
      {scroll ? (
        <ScrollView contentContainerStyle={frame} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[frame, s.fill]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { width: "100%", alignSelf: "center", gap: space.lg },
    desktop: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xxl },
    phone: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xl },
    fill: { flex: 1 },
    headerBlock: { gap: space.xs },
    back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
    header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
    titles: { gap: 2, flexShrink: 1 },
    titlePhone: { fontSize: 26, lineHeight: 32 },
    actions: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  }),
);
