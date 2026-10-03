import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, space, useTheme } from "@/lib/theme";

type Props = {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// A titled block on a page: small heading, optional count and a link on the right.
export function Section({ title, count, action, children, style }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.section, style]}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <Txt variant="heading">{title}</Txt>
          {count !== undefined && <Txt variant="small" tone="tertiary">{count}</Txt>}
        </View>
        {action && (
          <Pressable onPress={action.onPress} accessibilityRole="link" hitSlop={8}
            style={({ hovered }: { hovered?: boolean }) => [s.action, hovered && s.actionHover]}>
            <Txt variant="small" tone="secondary" weight="500">{action.label}</Txt>
            <Icon name="chevron" size={14} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    section: { gap: space.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
    titleRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
    action: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 2 },
    actionHover: { opacity: 0.75 },
  }),
);
