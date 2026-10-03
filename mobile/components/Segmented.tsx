import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.track} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab"
            accessibilityState={{ selected: on }} style={[s.segment, on && s.on]}>
            {o.icon && <Icon name={o.icon} size={15} color={on ? colors.text : colors.textTertiary} />}
            <Txt variant="small" weight="500" style={{ color: on ? colors.text : colors.textSecondary }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    track: {
      flexDirection: "row",
      alignSelf: "flex-start",
      padding: 3,
      borderRadius: radius.md,
      backgroundColor: colors.sunken,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segment: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 30,
      paddingHorizontal: space.sm,
      borderRadius: radius.sm,
    },
    on: { backgroundColor: colors.surface, ...shadow.card },
  }),
);
