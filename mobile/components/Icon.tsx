import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { colors } from "@/lib/theme";

export type IconName =
  | "home" | "people" | "map" | "user" | "mic" | "search" | "pen" | "check"
  | "chevron" | "plus" | "calendar" | "spark" | "close" | "phone" | "mail" | "message";

// A small hand-drawn line icon set (24px grid, 1.8 stroke) so the app needs
// no icon font. Strokes inherit `color`.
export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === "home" && <Path {...p} d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />}
      {name === "people" && (
        <>
          <Circle {...p} cx={9} cy={8.5} r={3.2} />
          <Path {...p} d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
          <Circle {...p} cx={16.5} cy={9.5} r={2.5} />
          <Path {...p} d="M16.5 14.2c2 .2 3.5 1.8 4 4.3" />
        </>
      )}
      {name === "map" && (
        <>
          <Circle {...p} cx={12} cy={12} r={2.4} />
          <Circle {...p} cx={5} cy={6} r={1.8} />
          <Circle {...p} cx={19} cy={7} r={1.8} />
          <Circle {...p} cx={17} cy={18.5} r={1.8} />
          <Circle {...p} cx={5.5} cy={17.5} r={1.8} />
          <Line {...p} x1={6.4} y1={7.2} x2={10.2} y2={10.5} />
          <Line {...p} x1={17.5} y1={8} x2={13.9} y2={10.8} />
          <Line {...p} x1={16.1} y1={17} x2={13.5} y2={13.7} />
          <Line {...p} x1={6.9} y1={16.4} x2={10.3} y2={13.5} />
        </>
      )}
      {name === "user" && (
        <>
          <Circle {...p} cx={12} cy={8.5} r={3.8} />
          <Path {...p} d="M4.5 20c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6" />
        </>
      )}
      {name === "mic" && (
        <>
          <Rect {...p} x={9} y={3.5} width={6} height={11} rx={3} />
          <Path {...p} d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
        </>
      )}
      {name === "search" && (
        <>
          <Circle {...p} cx={10.5} cy={10.5} r={6} />
          <Line {...p} x1={15} y1={15} x2={20} y2={20} />
        </>
      )}
      {name === "pen" && <Path {...p} d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.5 19zM13.5 7l3.5 3.5" />}
      {name === "check" && <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === "chevron" && <Path {...p} d="M9.5 5.5 16 12l-6.5 6.5" />}
      {name === "plus" && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === "close" && <Path {...p} d="M6 6l12 12M18 6 6 18" />}
      {name === "calendar" && (
        <>
          <Rect {...p} x={4} y={5.5} width={16} height={14.5} rx={2.5} />
          <Path {...p} d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
        </>
      )}
      {name === "spark" && <Path {...p} d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />}
      {name === "phone" && <Path {...p} d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z" />}
      {name === "mail" && (
        <>
          <Rect {...p} x={3.5} y={5.5} width={17} height={13} rx={2.5} />
          <Path {...p} d="M4 7l8 6 8-6" />
        </>
      )}
      {name === "message" && <Path {...p} d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5z" />}
    </Svg>
  );
}
