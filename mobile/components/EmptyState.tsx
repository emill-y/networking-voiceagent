import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// One line of title, at most one line of help, and the next action.
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.wrap, compact && s.compact]}>
      <View style={s.badge}>
        <View style={s.orbit} />
        <Icon name={icon} size={20} color={colors.accentText} />
      </View>
      <View style={s.text}>
        <Txt variant="heading" align="center">{title}</Txt>
        {body ? <Txt variant="small" tone="secondary" align="center">{body}</Txt> : null}
      </View>
      {action ? <View style={s.action}>{action}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { alignItems: "center", justifyContent: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
    compact: { paddingVertical: space.lg },
    badge: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
    },
    orbit: {
      position: "absolute",
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 1,
      borderColor: colors.orbit,
    },
    text: { gap: space.xxs, maxWidth: 360, alignItems: "center" },
    action: { alignSelf: "center" },
  }),
);
