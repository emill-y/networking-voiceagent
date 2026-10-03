import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

import { useTheme, type Theme } from "@/lib/theme";

export type TextVariant = keyof Theme["type"];
type Tone = "default" | "secondary" | "tertiary" | "accent" | "danger" | "success" | "onAccent";

type Props = Omit<TextProps, "style"> & {
  variant?: TextVariant;
  tone?: Tone;
  weight?: "400" | "500" | "600" | "700";
  align?: "left" | "center" | "right";
  style?: StyleProp<TextStyle>;
};

// Text in one of the type scale's styles. Prefer this over ad-hoc font sizes.
export function Txt({ variant = "body", tone = "default", weight, align, style, ...rest }: Props) {
  const { type, colors } = useTheme();
  const color =
    tone === "secondary" ? colors.textSecondary
    : tone === "tertiary" ? colors.textTertiary
    : tone === "accent" ? colors.accentText
    : tone === "danger" ? colors.danger
    : tone === "success" ? colors.success
    : tone === "onAccent" ? colors.onAccent
    : undefined;
  return (
    <Text
      style={[type[variant], color ? { color } : null, weight ? { fontWeight: weight } : null, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
