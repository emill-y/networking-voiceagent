import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { colors } from "@/lib/theme";

// Soft light behind every screen: a warm glow from the top, a cool one from
// the bottom. Quiet enough to read on, enough to give the dark depth.
export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  const { width, height } = useWindowDimensions();
  return (
    // Clipped to the screen: next to the desktop sidebar the screen is narrower
    // than the window, and the glow mustn't make the page scroll sideways.
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="warm" cx="50%" cy="0%" r="75%">
          <Stop offset="0" stopColor={colors.glowWarm} stopOpacity={0.3 * intensity} />
          <Stop offset="1" stopColor={colors.glowWarm} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="cool" cx="90%" cy="100%" r="70%">
          <Stop offset="0" stopColor={colors.glowCool} stopOpacity={0.18 * intensity} />
          <Stop offset="1" stopColor={colors.glowCool} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={0} rx={width * 1.1} ry={height * 0.55} fill="url(#warm)" />
      <Ellipse cx={width} cy={height} rx={width} ry={height * 0.5} fill="url(#cool)" />
    </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
