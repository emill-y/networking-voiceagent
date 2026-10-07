import { useCallback, useEffect, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { IconButton } from "@/components/Button";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { sheetOpened } from "@/lib/sheetStack";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// A dialog: a centered card on desktop, a bottom sheet on phones. The sheet
// keeps you in context: it slides up over the page (which steps back a
// little), and you can drag it down by its handle to dismiss it. Content
// scrolls inside, so it never runs off the screen.
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  width = 480,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const s = useStyles();
  const desktop = useDesktop();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    y.value = desktop ? 12 : height;
    fade.value = 0;
    y.value = desktop ? withTiming(0, { duration: 180 }) : withSpring(0, { damping: 24, stiffness: 240, mass: 0.9 });
    fade.value = withTiming(1, { duration: 200 });
    return desktop ? undefined : sheetOpened();
  }, [visible, desktop, height, y, fade]);

  // Slide away, then tell the owner it's closed.
  const dismiss = useCallback(() => {
    if (desktop) return onClose();
    fade.value = withTiming(0, { duration: 180 });
    y.value = withTiming(height, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(onClose);
    });
  }, [desktop, onClose, height, y, fade]);

  const drag = Gesture.Pan()
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        fade.value = withTiming(0, { duration: 160 });
        y.value = withTiming(height, { duration: 180 }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
      } else {
        y.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const header = (
    <View>
      {!desktop && <View style={s.grabberZone}><View style={s.grabber} /></View>}
      <View style={[s.header, !desktop && s.headerPhone]}>
        <Txt variant="title" style={[s.title, desktop && s.titleDesktop]}>{title}</Txt>
        <IconButton icon="close" label="Close" onPress={dismiss} tone="plain" size={32} />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={[s.root, desktop ? s.rootCenter : s.rootBottom]}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={dismiss}
            accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[s.panel, desktop ? [s.panelDesktop, { width }] : [s.panelPhone, { paddingBottom: Math.max(insets.bottom, space.md) }], panelStyle]}
          accessibilityViewIsModal
        >
          {desktop ? header : <GestureDetector gesture={drag}>{header}</GestureDetector>}
          <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    root: { flex: 1 },
    rootCenter: { alignItems: "center", justifyContent: "center", padding: space.lg },
    rootBottom: { justifyContent: "flex-end" },
    panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, maxHeight: "88%", ...shadow.raised },
    panelDesktop: { maxWidth: "100%", borderRadius: radius.xl },
    panelPhone: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomWidth: 0 },
    grabberZone: { alignItems: "center", paddingTop: space.xs, paddingBottom: space.xxs, cursor: "grab" } as object,
    grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.sm,
      paddingLeft: space.lg,
      paddingRight: space.sm,
      paddingTop: space.md,
      paddingBottom: space.xs,
    },
    headerPhone: { paddingTop: space.xs },
    title: { flex: 1 },
    titleDesktop: { fontSize: 19, lineHeight: 24 },
    body: { flexGrow: 0 },
    bodyContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs, gap: space.md },
    footer: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: space.xs,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  }),
);
