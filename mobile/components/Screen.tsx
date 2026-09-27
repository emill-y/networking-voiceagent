import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useDesktop } from "@/hooks/useDesktop";
import { colors, spacing } from "@/lib/theme";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  // Wide pages (the network map) use more of a desktop screen.
  wide?: boolean;
};

// Page shell: safe-area aware, dark background, centered column on wide screens.
export function Screen({ children, scroll = true, wide = false }: Props) {
  const desktop = useDesktop();
  const width = desktop ? { maxWidth: wide ? 1120 : 720, paddingTop: spacing.xl, paddingHorizontal: spacing.xl } : null;
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, width]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, width]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  fill: {
    flex: 1,
  },
});
