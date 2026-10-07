import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";

// Content arriving from deep space: each block rises and fades in a beat
// after the one before it. On the web this is a plain CSS animation
// (Reanimated's web entering animations can leave a block pinned in place
// when its content grows); on phones it's Reanimated. Both skip it for
// reduced motion.
const webReduced =
  Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const delay = 80 + Math.min(index, 8) * 70;
  if (Platform.OS === "web") {
    const motion = webReduced
      ? null
      : ({
          animationKeyframes: [{ from: { opacity: 0, transform: "translateY(18px)" }, to: { opacity: 1, transform: "translateY(0px)" } }],
          animationDuration: "560ms",
          animationDelay: `${delay}ms`,
          animationTimingFunction: "cubic-bezier(0.2, 0.7, 0.2, 1)",
          animationFillMode: "backwards",
        } as object);
    return <View style={[style, motion as ViewStyle]}>{children}</View>;
  }
  return (
    <Animated.View style={style} entering={FadeInDown.duration(520).delay(delay).easing(Easing.out(Easing.cubic))}>
      {children}
    </Animated.View>
  );
}
