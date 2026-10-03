import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";

import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

type Tone = "default" | "success" | "danger";
type ToastValue = { show: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastValue>({ show: () => undefined });

// Short confirmations ("Exported 12 contacts") that disappear on their own.
export function ToastProvider({ children }: { children: ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, tone: Tone = "default") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="none" style={s.layer}>
        {toast && (
          <Animated.View key={toast.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)}
            style={s.toast} accessibilityLiveRegion="polite" role="status">
            <Icon
              name={toast.tone === "danger" ? "alert" : "checkCircle"}
              size={16}
              color={toast.tone === "danger" ? colors.danger : toast.tone === "success" ? colors.success : colors.textSecondary}
            />
            <Txt variant="label" style={s.text}>{toast.message}</Txt>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    layer: { position: "absolute", left: 0, right: 0, bottom: 104, alignItems: "center", paddingHorizontal: space.md },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      maxWidth: 420,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.raised,
    },
    text: { flexShrink: 1 },
  }),
);
