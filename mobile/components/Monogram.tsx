import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/lib/theme";

// Contacts default to initials. We never fabricate profile photos.
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Monogram({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.text, { fontSize: size * 0.42 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: fonts.serif,
    color: colors.textSoft,
  },
});
