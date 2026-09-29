import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { Monogram } from "@/components/Monogram";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { colors, fonts, radius, spacing } from "@/lib/theme";

const LINKS: { href: Href; label: string; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  { href: "/people", label: "People", match: (p) => p.startsWith("/people") },
  { href: "/network", label: "Map", match: (p) => p.startsWith("/network") },
  { href: "/follow-ups", label: "Follow-ups", match: (p) => p.startsWith("/follow-ups") },
  { href: "/search", label: "Search", match: (p) => p.startsWith("/search") },
  { href: "/you", label: "You", match: (p) => p.startsWith("/you") },
];

// Desktop web navigation: wordmark, destinations, and who's signed in.
// (Recording starts from the orb on Home, so there's no second record button.)
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const profile = useProfile();
  const name = (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email ?? "You";
  const detail = [profile?.school, profile?.major].filter(Boolean).join(" · ") || "Your account";
  // Sidebar destinations replace whatever is open, so screens never pile up
  // on top of each other (e.g. "New memory" then "or write one").
  const go = (href: Href) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(href);
  };
  return (
    <View style={styles.sidebar} role="navigation">
      <Pressable onPress={() => go("/")} accessibilityRole="link">
        <Text style={styles.wordmark}>Nomi</Text>
      </Pressable>
      <View style={styles.links}>
        {LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <Pressable
              key={link.label}
              onPress={() => go(link.href)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                styles.link,
                (hovered || pressed) && styles.linkHover,
                active && styles.linkActive,
              ]}
            >
              <Text style={[styles.linkText, active && styles.linkTextActive]}>{link.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.spacer} />
      <Pressable
        onPress={() => go("/you")}
        accessibilityRole="link"
        accessibilityLabel="Your account"
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          styles.account,
          (hovered || pressed) && styles.linkHover,
        ]}
      >
        <Monogram name={name} size={36} />
        <View style={styles.accountText}>
          <Text style={styles.accountName} numberOfLines={1}>{name}</Text>
          <Text style={styles.accountDetail} numberOfLines={1}>{detail}</Text>
        </View>
        <Icon name="chevron" size={16} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.hairline,
    backgroundColor: colors.background,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: spacing.xl,
    marginLeft: spacing.sm,
  },
  links: {
    gap: 2,
  },
  link: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm,
  },
  linkHover: {
    backgroundColor: colors.surface,
  },
  linkActive: {
    backgroundColor: colors.raised,
  },
  linkText: {
    fontSize: 15,
    color: colors.muted,
  },
  linkTextActive: {
    color: colors.text,
  },
  spacer: {
    flex: 1,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  accountDetail: {
    fontSize: 12,
    color: colors.muted,
  },
});
