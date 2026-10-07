import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { useDesktop } from "@/hooks/useDesktop";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  // While loading the button shows a spinner and ignores presses, so an
  // action can't be sent twice.
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// The one button. Primary for the main action on a screen (at most one),
// secondary for everything else, ghost for low-emphasis links, danger for
// destructive actions.
export function Button({
  title,
  onPress,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  accessibilityLabel,
  style,
}: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  // Phones: every button is at least a 44pt target with 16-17pt text.
  const phone = !useDesktop();
  const inactive = disabled || loading;
  const fg =
    variant === "primary" ? colors.onAccent : variant === "danger" ? colors.danger : variant === "ghost" ? colors.textSecondary : colors.text;
  const iconSize = size === "sm" ? 15 : 17;
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.base,
        s[size],
        phone && s[`${size}Phone`],
        s[variant],
        (hovered || pressed) && !inactive && s[`${variant}Hover`],
        pressed && !inactive && s.pressed,
        disabled && !loading && s.disabled,
        fullWidth && s.fullWidth,
        style,
      ]}
    >
      <View style={[s.row, loading && s.hidden]}>
        {icon && <Icon name={icon} size={iconSize} color={fg} />}
        <Text style={[s.text, size === "sm" && s.textSm, size === "lg" && s.textLg, phone && s.textPhone, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        {iconRight && <Icon name={iconRight} size={iconSize} color={fg} />}
      </View>
      {loading && <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={fg} />}
    </Pressable>
  );
}

// A square icon-only button (toolbar actions, zoom controls, close).
export function IconButton({
  icon,
  onPress,
  label,
  size = 36,
  tone = "default",
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  tone?: "default" | "plain";
  disabled?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const phone = !useDesktop();
  const box = phone ? Math.max(size, 44) : size;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.iconButton,
        tone === "plain" && s.iconButtonPlain,
        { width: box, height: box },
        (hovered || pressed) && s.iconButtonHover,
        disabled && s.disabled,
      ]}
    >
      <Icon name={icon} size={Math.round(Math.min(box, 48) * 0.47)} color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "transparent",
      alignSelf: "flex-start",
    },
    sm: { height: 32, paddingHorizontal: space.sm },
    md: { height: 40, paddingHorizontal: space.md },
    lg: { height: 48, paddingHorizontal: space.lg },
    smPhone: { height: 40, paddingHorizontal: space.md, borderRadius: radius.md },
    mdPhone: { height: 46, paddingHorizontal: space.md, borderRadius: radius.lg },
    lgPhone: { height: 54, borderRadius: radius.lg },
    fullWidth: { alignSelf: "stretch" },
    primary: { backgroundColor: colors.accent },
    primaryHover: { backgroundColor: colors.accentHover },
    secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
    secondaryHover: { backgroundColor: colors.surfaceHover },
    ghost: { backgroundColor: "transparent" },
    ghostHover: { backgroundColor: colors.sunken },
    danger: { backgroundColor: colors.dangerSoft },
    dangerHover: { borderColor: colors.danger },
    pressed: { transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.45 },
    hidden: { opacity: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: space.xs },
    text: { fontSize: 14, fontWeight: "600", letterSpacing: 0.1 },
    textSm: { fontSize: 13 },
    textLg: { fontSize: 15 },
    textPhone: { fontSize: 16 },
    iconButton: {
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconButtonPlain: { backgroundColor: "transparent", borderColor: "transparent" },
    iconButtonHover: { backgroundColor: colors.surfaceHover },
  }),
);
