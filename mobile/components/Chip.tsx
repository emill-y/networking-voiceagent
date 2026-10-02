import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  tone?: "default" | "accent";
};

export function Chip({ label, icon, onPress, tone = "default" }: Props) {
  const content = (
    <>
      {icon && <Icon name={icon} size={16} color={tone === "accent" ? colors.accentBright : colors.textSoft} />}
      <Text style={[styles.text, tone === "accent" && styles.accentText]}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={[styles.chip, tone === "accent" && styles.accent]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.chip, tone === "accent" && styles.accent, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "rgba(242, 238, 232, 0.06)",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  accent: {
    backgroundColor: "rgba(201, 183, 156, 0.12)",
    borderColor: "rgba(201, 183, 156, 0.28)",
  },
  pressed: {
    opacity: 0.75,
  },
  text: {
    fontSize: 14,
    color: colors.textSoft,
  },
  accentText: {
    color: colors.accentBright,
  },
});

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{children}</View>;
}
