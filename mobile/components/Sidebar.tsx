import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Monogram } from "@/components/Monogram";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { displayName, profileLine } from "@/lib/account";
import { colors, fonts, orb, radius, spacing } from "@/lib/theme";

const LINKS: { href: Href; label: string; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  { href: "/people", label: "People", match: (p) => p.startsWith("/people") },
  { href: "/network", label: "Map", match: (p) => p.startsWith("/network") },
  { href: "/follow-ups", label: "Follow-ups", match: (p) => p.startsWith("/follow-ups") },
  { href: "/plans", label: "Go together", match: (p) => p.startsWith("/plans") },
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
  const name = displayName(session);
  const detail = profile?.school || profileLine(profile);
  // Sidebar destinations replace whatever is open, so screens never pile up
  // on top of each other (e.g. "New memory" then "or write one").
  const go = (href: Href) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(href);
  };
  return (
    <View style={styles.sidebar} role="navigation">
      <Pressable onPress={() => go("/")} accessibilityRole="link" style={styles.brand}>
        <Svg width={26} height={26}>
          <Defs>
            <RadialGradient id="brand-orb" cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor={orb.light} />
              <Stop offset="0.45" stopColor={orb.mid} />
              <Stop offset="0.85" stopColor={orb.deep} />
              <Stop offset="1" stopColor={orb.shadow} />
            </RadialGradient>
          </Defs>
          <Circle cx={13} cy={13} r={13} fill="url(#brand-orb)" />
        </Svg>
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
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.xl,
    marginLeft: spacing.xs,
  },
  wordmark: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.5,
  },
  links: {
    gap: 2,
  },
  link: {
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  linkHover: {
    backgroundColor: colors.surface,
  },
  linkActive: {
    backgroundColor: colors.raised,
    borderLeftColor: colors.accent,
  },
  linkText: {
    fontSize: 16,
    fontWeight: "500",
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
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    borderRadius: radius.sm,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
  },
  accountDetail: {
    fontSize: 12,
    color: colors.muted,
  },
});
