import { Alert, Platform } from "react-native";

// Ask before destructive actions. Alert.alert has no web implementation,
// so the browser's confirm dialog is used there.
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
