import { View } from "react-native";

import { Txt } from "@/components/Txt";
import { orb, space } from "@/lib/theme";

// The Nomi mark: one small orange planet.
export function LogoMark({ size = 26 }: { size?: number; still?: boolean }) {
  const d = Math.round(size * 0.62);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: orb.mid, borderWidth: d * 0.12, borderColor: orb.light }} />
    </View>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <LogoMark size={size} />
      <Txt variant="title" style={{ fontSize: size * 0.85, lineHeight: size * 1.1 }}>Nomi</Txt>
    </View>
  );
}
