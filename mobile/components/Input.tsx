import { forwardRef } from "react";
import { StyleSheet, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
};

// The one text field: optional label above, hint or error below.
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, hint, error, icon, containerStyle, multiline, style, ...rest },
  ref,
) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.wrap, containerStyle]}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <View style={[s.field, multiline && s.multilineField, !!error && s.fieldError]}>
        {icon && <Icon name={icon} size={16} color={colors.textTertiary} />}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          multiline={multiline}
          style={[s.input, multiline && s.multiline, style]}
          {...rest}
        />
      </View>
      {error ? <Txt variant="small" tone="danger">{error}</Txt> : hint ? <Txt variant="caption">{hint}</Txt> : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      minHeight: 40,
      paddingHorizontal: space.sm,
      borderRadius: radius.md,
      backgroundColor: colors.sunken,
      borderWidth: 1,
      borderColor: colors.border,
    },
    multilineField: { alignItems: "flex-start", paddingVertical: space.xs },
    fieldError: { borderColor: colors.danger },
    input: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 9,
      // No browser focus ring on web; the field border is the affordance.
      outlineStyle: "none",
    } as object,
    multiline: { minHeight: 88, textAlignVertical: "top" },
  }),
);
