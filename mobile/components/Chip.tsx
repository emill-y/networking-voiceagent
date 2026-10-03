import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// A toggleable filter chip (Contacts filters, event categories).
export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
  onRemove?: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const fg = selected ? colors.accentText : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress ?? onRemove}
      accessibilityRole={onPress ? "checkbox" : "button"}
      accessibilityState={onPress ? { checked: !!selected } : undefined}
      accessibilityLabel={onRemove && !onPress ? `Remove ${label}` : label}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        s.chip,
        selected && s.selected,
        (hovered || pressed) && !selected && s.hover,
      ]}
    >
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Txt variant="small" weight="500" style={{ color: fg }} numberOfLines={1}>{label}</Txt>
      {count !== undefined && <Txt variant="caption" style={{ color: fg, opacity: 0.8 }}>{count}</Txt>}
      {onRemove && <Icon name="close" size={13} color={fg} />}
    </Pressable>
  );
}

export function ChipRow({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  const s = useStyles();
  return <View style={[s.row, wrap && s.wrap]}>{children}</View>;
}

// A small, non-interactive label (an interest, a status).
export function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const s = useStyles();
  const { colors } = useTheme();
  const palette = {
    neutral: [colors.sunken, colors.textSecondary],
    accent: [colors.accentSoft, colors.accentText],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View style={[s.tag, { backgroundColor: palette[0] }]}>
      <Txt variant="caption" weight="600" style={{ color: palette[1] }} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 32,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    hover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
    row: { flexDirection: "row", gap: space.xs },
    wrap: { flexWrap: "wrap" },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  }),
);
