import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { NAV } from "@/components/nav";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { layout, makeStyles, radius, space, useTheme } from "@/lib/theme";

// Desktop navigation: brand, destinations, and the account.
export function Sidebar() {
  const s = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const account = useAccount();
  // Destinations replace whatever is open, so screens never pile up.
  const go = (href: Href) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(href);
  };

  const item = (label: string, icon: Parameters<typeof Icon>[0]["name"], active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        s.item,
        (hovered || pressed) && s.itemHover,
        active && s.itemActive,
      ]}
    >
      <Icon name={icon} size={17} color={active ? colors.text : colors.textSecondary} />
      <Txt variant="label" style={{ color: active ? colors.text : colors.textSecondary }}>{label}</Txt>
    </Pressable>
  );

  return (
    <View style={s.sidebar} role="navigation">
      <Pressable onPress={() => go("/")} accessibilityRole="link" accessibilityLabel="Nomi home" style={s.brand}>
        <LogoMark size={22} />
        <Txt variant="title" style={s.wordmark}>Nomi</Txt>
      </Pressable>

      <View style={s.items}>{NAV.map((n) => item(n.label, n.icon, n.match(pathname), () => go(n.href)))}</View>

      <View style={s.spacer} />
      <Pressable
        onPress={() => go("/profile")}
        accessibilityRole="link"
        accessibilityLabel="Profile and settings"
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          s.account,
          (hovered || pressed) && s.itemHover,
          pathname.startsWith("/profile") && s.itemActive,
        ]}
      >
        <Avatar name={account.name} uri={account.avatarUrl} size={30} />
        <View style={s.accountText}>
          <Txt variant="label" numberOfLines={1}>{account.name}</Txt>
          {account.email ? <Txt variant="caption" numberOfLines={1}>{account.email}</Txt> : null}
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    sidebar: {
      width: layout.sidebar,
      paddingTop: space.lg,
      paddingBottom: space.md,
      paddingHorizontal: space.sm,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      backgroundColor: colors.chrome,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, marginBottom: space.lg },
    wordmark: { fontSize: 21, lineHeight: 26 },
    items: { gap: 2 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      height: 36,
      paddingHorizontal: space.sm,
      borderRadius: radius.sm,
    },
    itemHover: { backgroundColor: colors.surfaceHover },
    itemActive: { backgroundColor: colors.supportSoft },
    spacer: { flex: 1 },
    account: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      marginTop: space.xs,
      padding: space.xs,
      borderRadius: radius.md,
    },
    accountText: { flex: 1, minWidth: 0 },
  }),
);
