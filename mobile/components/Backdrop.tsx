import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { useTheme } from "@/lib/theme";

// Restrained cosmic depth behind every page: one soft glow and two faint
// orbits off the top-right corner. Clipped to the page so it never scrolls.
export function Backdrop() {
  const { colors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="bd-glow" cx="88%" cy="-4%" r="55%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.11} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="88%" cy="-4%" r="70%" fill="url(#bd-glow)" />
        <Ellipse cx="96%" cy="-2%" rx="34%" ry="22%" stroke={colors.orbit} strokeWidth={1} fill="none" />
        <Ellipse cx="96%" cy="-2%" rx="52%" ry="34%" stroke={colors.orbit} strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });
