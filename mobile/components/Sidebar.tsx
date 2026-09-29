import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { colors, fonts, radius, spacing } from "@/lib/theme";

const LINKS: { href: Href; label: string; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  { href: "/people", label: "People", match: (p) => p.startsWith("/people") },
  { href: "/network", label: "Map", match: (p) => p.startsWith("/network") },
  { href: "/follow-ups", label: "Follow-ups", match: (p) => p.startsWith("/follow-ups") },
  { href: "/search", label: "Search", match: (p) => p.startsWith("/search") },
  { href: "/you", label: "You", match: (p) => p.startsWith("/you") },
];

// Desktop web navigation. Quiet: a wordmark, a few words, one action.
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
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
      {/* Recording starts from the orb on Home, so this takes you there. */}
      <Button title="New memory" icon="mic" onPress={() => go("/")} />
      <Pressable onPress={() => go("/write")} accessibilityRole="button" style={styles.write}>
        <Text style={styles.writeText}>or write one</Text>
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
  write: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  writeText: {
    fontSize: 13,
    color: colors.muted,
  },
});
