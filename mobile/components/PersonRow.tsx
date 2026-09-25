import { Pressable, StyleSheet, Text, View } from "react-native";

import { Monogram } from "@/components/Monogram";
import { formatRelative } from "@/lib/format";
import { colors, spacing, type } from "@/lib/theme";

type Props = {
  name: string;
  detail?: string | null;
  when?: string | null;
  onPress: () => void;
};

export function PersonRow({ name, detail, when, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Monogram name={name} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {detail ? <Text style={type.meta} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {when ? <Text style={type.meta}>{formatRelative(when)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...type.heading,
    fontSize: 20,
    lineHeight: 24,
    color: colors.text,
  },
});
