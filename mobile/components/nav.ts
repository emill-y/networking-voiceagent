import type { Href } from "expo-router";

import type { IconName } from "@/components/Icon";

// Every destination, in one place, so the sidebar and tab bar never disagree.
export const NAV: { href: Href; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  { href: "/contacts", label: "Contacts", icon: "people", match: (p) => p.startsWith("/contacts") || p === "/import-contacts" },
  { href: "/network", label: "Map", icon: "map", match: (p) => p.startsWith("/network") },
  { href: "/search", label: "Search", icon: "search", match: (p) => p.startsWith("/search") },
  { href: "/follow-ups", label: "Follow-ups", icon: "tasks", match: (p) => p.startsWith("/follow-ups") },
  { href: "/events", label: "Plan Events", icon: "ticket", match: (p) => p.startsWith("/events") },
];
