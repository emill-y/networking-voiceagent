import { Alert, Platform } from "react-native";

// Ask before destructive actions: confirm("Delete Maya?", "…", "Delete").
// The app's own pop-up (components/ConfirmDialog.tsx, mounted in the root
// layout) answers it. Before that's mounted, the platform's dialog is used.
export type ConfirmRequest = { title: string; message: string; action: string; resolve: (yes: boolean) => void };

let show: ((request: ConfirmRequest) => void) | null = null;

export function setConfirmHandler(handler: ((request: ConfirmRequest) => void) | null): () => void {
  show = handler;
  return () => {
    if (show === handler) show = null;
  };
}

export function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (show) {
    const open = show;
    return new Promise((resolve) => open({ title, message, action, resolve }));
  }
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
