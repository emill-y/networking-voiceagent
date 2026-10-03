import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { create } from "qrcode/lib/core/qrcode";

// A QR code drawn as one SVG path (crisp at any size, no image files).
export function QrCode({ value, size = 140, color = "#111111", background = "#FFFFFF" }: {
  value: string;
  size?: number;
  color?: string;
  background?: string;
}) {
  const { path, count } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.data[y * modules.size + x]) d += `M${x + 2} ${y + 2}h1v1h-1z`;
      }
    }
    return { path: d, count: modules.size + 4 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel={`QR code for ${value}`}>
      <Rect x={0} y={0} width={count} height={count} fill={background} rx={1.5} />
      <Path d={path} fill={color} />
    </Svg>
  );
}
