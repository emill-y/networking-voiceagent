import { Platform, useWindowDimensions } from "react-native";

// Wide browser windows get the desktop layout (sidebar, wider content).
// Phones, tablets in portrait and narrow windows keep the mobile layout.
export const DESKTOP_MIN_WIDTH = 900;

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}
