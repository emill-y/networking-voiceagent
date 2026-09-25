import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, radius, spacing, type } from "@/lib/theme";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  hint?: string;
} & Pick<
  TextInputProps,
  "autoCapitalize" | "keyboardType" | "placeholder" | "autoCorrect" | "secureTextEntry" | "textContentType"
>;

// A labelled text input. Understated: surface contrast, no heavy borders.
export function Field({ label, value, onChangeText, multiline, hint, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={colors.faint}
        selectionColor={colors.accent}
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline]}
        {...rest}
      />
      {hint && <Text style={[type.meta, styles.hint]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  hint: {
    color: colors.faint,
  },
});
