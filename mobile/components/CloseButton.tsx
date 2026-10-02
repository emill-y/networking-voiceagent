import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { Icon } from "@/components/Icon";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  label?: string;
  // Defaults to going back, or home if there's nothing to go back to.
  onPress?: () => void;
};

// The one way out of a screen: a clear, red-tinted "✕ Close" pill.
export function CloseButton({ label = "Close", onPress }: Props) {
  const router = useRouter();
  const close = onPress ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <Pressable
      onPress={close}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.pill,
        (pressed || hovered) && styles.active,
      ]}
    >
      <Icon name="close" size={15} color={colors.danger} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 90, 75, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 120, 105, 0.35)",
  },
  active: {
    backgroundColor: "rgba(255, 90, 75, 0.22)",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
  },
});
