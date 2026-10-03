import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { font, tintFor, useTheme } from "@/lib/theme";

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

// A photo when we have one (only the user's own); otherwise initials in the
// person's color. We never invent photos for contacts.
export function Avatar({ name, size = 36, uri }: { name: string | null | undefined; size?: number; uri?: string | null }) {
  const { mode } = useTheme();
  const tint = tintFor(name, mode);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  return (
    <View
      style={[styles.circle, box, { backgroundColor: `${tint}22`, borderColor: `${tint}44` }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.38), color: tint }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: font.heading },
});
