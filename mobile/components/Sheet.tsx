import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/Button";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { makeStyles, radius, space } from "@/lib/theme";

// A dialog: centered card on desktop, bottom sheet on phones. Content
// scrolls inside it, so it never runs off the screen.
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.root, desktop ? s.rootCenter : s.rootBottom]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
          <View style={s.scrim} />
        </Pressable>
        <View
          style={[s.panel, desktop ? [s.panelDesktop, { width }] : [s.panelPhone, { paddingBottom: Math.max(insets.bottom, space.md) }]]}
          accessibilityViewIsModal
        >
          <View style={s.header}>
            <Txt variant="title" style={s.title}>{title}</Txt>
            <IconButton icon="close" label="Close" onPress={onClose} tone="plain" size={32} />
          </View>
          <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    root: { flex: 1 },
    rootCenter: { alignItems: "center", justifyContent: "center", padding: space.lg },
    rootBottom: { justifyContent: "flex-end" },
    scrim: { flex: 1, backgroundColor: colors.overlay },
    panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, maxHeight: "88%", ...shadow.raised },
    panelDesktop: { maxWidth: "100%", borderRadius: radius.xl },
    panelPhone: { width: "100%", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
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
    title: { flex: 1, fontSize: 19, lineHeight: 24 },
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
