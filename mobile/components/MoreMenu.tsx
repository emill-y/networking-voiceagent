import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

export type MoreAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean };

// A "⋯" button that turns into its actions (Edit, Delete) when tapped, and
// back into "⋯" with the ×. Keeps rarely used actions out of the way.
export function MoreMenu({ actions, label }: { actions: MoreAction[]; label: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.round, (hovered || pressed) && s.hover]}>
        <Icon name="more" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  }

  return (
    <View style={s.open}>
      {actions.map((action) => (
        <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label}
          onPress={() => {
            setOpen(false);
            action.onPress();
          }}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.action, (hovered || pressed) && s.hover]}>
          <Icon name={action.icon} size={14} color={action.danger ? colors.danger : colors.text} />
          <Txt variant="small" weight="600" style={{ color: action.danger ? colors.danger : colors.text }}>{action.label}</Txt>
        </Pressable>
      ))}
      <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.round, (hovered || pressed) && s.hover]}>
        <Icon name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    round: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    hover: { backgroundColor: colors.surfaceHover },
    open: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingLeft: space.xxs,
    },
    action: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: space.sm, borderRadius: radius.pill },
  }),
);
