import type { Href } from "expo-router";

import type { IconName } from "@/components/Icon";

// Every destination, in one place, so the sidebar and tab bar never disagree.
// Nomi is three things: sessions, search, and the map of who you know.
export const NAV: { href: Href; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Sessions", icon: "radio", match: (p) => p === "/" || p.startsWith("/sessions") },
  { href: "/search", label: "Search", icon: "search", match: (p) => p.startsWith("/search") },
  { href: "/network", label: "Map", icon: "map", match: (p) => p.startsWith("/network") },
];
