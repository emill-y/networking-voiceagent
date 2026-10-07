import { useEffect } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

export type PeekAction = { icon: IconName; label: string; onPress: () => void; danger?: boolean };

// Long press, the phone's right-click: everything else blurs back, the
// person comes forward a little, and their quick actions appear under them.
export function PeekMenu({
  person,
  actions,
  onClose,
}: {
  person: { name: string; detail?: string | null } | null;
  actions: PeekAction[];
  onClose: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const pop = useSharedValue(0);

  useEffect(() => {
    if (!person) return;
    pop.value = 0;
    pop.value = withSpring(1, { damping: 16, stiffness: 220 });
  }, [person, pop]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.94 + pop.value * 0.1 }], opacity: Math.min(1, pop.value * 1.5) }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: withTiming(pop.value > 0.3 ? 1 : 0, { duration: 140 }),
    transform: [{ translateY: (1 - pop.value) * -12 }, { scale: 0.96 + pop.value * 0.04 }],
  }));

  return (
    <Modal visible={!!person} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      {person && (
        <View style={s.center} pointerEvents="box-none">
          <Animated.View style={[s.card, cardStyle]}>
            <Avatar name={person.name} size={52} />
            <View style={s.flex}>
              <Txt variant="heading" numberOfLines={1}>{person.name}</Txt>
              {person.detail ? <Txt variant="small" numberOfLines={2}>{person.detail}</Txt> : null}
            </View>
          </Animated.View>
          <Animated.View style={[s.menu, menuStyle]}>
            {actions.map((a, i) => (
              <Pressable key={a.label} onPress={() => { onClose(); a.onPress(); }} accessibilityRole="button"
                style={({ pressed }) => [s.item, i > 0 && s.itemBorder, pressed && { backgroundColor: colors.surfaceHover }]}>
                <Txt variant="body" style={a.danger ? { color: colors.danger } : undefined}>{a.label}</Txt>
                <Icon name={a.icon} size={20} color={a.danger ? colors.danger : colors.textSecondary} />
              </Pressable>
            ))}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, shadow, mode }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0, gap: 2 },
    backdrop: {
      backgroundColor: mode === "dark" ? "rgba(4, 5, 10, 0.62)" : "rgba(30, 28, 40, 0.28)",
      // Blur what's behind on the web; phones get the dimmed scrim.
      ...(Platform.OS === "web" ? ({ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } as object) : {}),
    },
    center: { flex: 1, justifyContent: "center", paddingHorizontal: space.lg, gap: space.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      padding: space.md,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.raised,
    },
    menu: {
      alignSelf: "flex-end",
      width: 250,
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.raised,
    },
    item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 50, paddingHorizontal: space.md },
    itemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  }),
);
