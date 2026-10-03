import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

type Props = {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
};

// A row in a list: leading avatar/icon, title and one line of detail, an
// optional trailing element. 56px tall so lists line up everywhere.
export function ListRow({ title, subtitle, leading, trailing, onPress, chevron, accessibilityLabel }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      {leading}
      <View style={s.text}>
        <Txt variant="label" numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="small" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {trailing}
      {chevron && <Icon name="chevron" size={16} color={colors.textTertiary} />}
    </>
  );
  if (!onPress) return <View style={s.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.row, (hovered || pressed) && s.hover]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      minHeight: 56,
      paddingVertical: space.xs,
      paddingHorizontal: space.sm,
      borderRadius: radius.md,
    },
    hover: { backgroundColor: colors.surfaceHover },
    text: { flex: 1, minWidth: 0, gap: 1 },
  }),
);
