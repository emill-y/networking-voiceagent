import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { Txt } from "@/components/Txt";
import { space, useTheme } from "@/lib/theme";

// The Nomi mark: a planet with one orbit and a small moon.
export function LogoMark({ size = 26 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <RadialGradient id="nomi-planet" cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#FFD9B8" />
          <Stop offset="0.5" stopColor={colors.accent} />
          <Stop offset="1" stopColor="#9A3B12" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={16} cy={16} rx={14.5} ry={6.5} stroke={colors.textTertiary} strokeWidth={1.2} fill="none" transform="rotate(-24 16 16)" />
      <Circle cx={16} cy={16} r={8} fill="url(#nomi-planet)" />
      <Circle cx={28.2} cy={10.6} r={2.2} fill={colors.text} />
    </Svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <LogoMark size={size} />
      <Txt variant="title" style={{ fontSize: size * 0.8, lineHeight: size }}>Nomi</Txt>
    </View>
  );
}
