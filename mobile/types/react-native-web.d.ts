// React Native Web adds hover and focus to Pressable's style callback.
import "react-native";

declare module "react-native" {
  interface PressableStateCallbackType {
    readonly hovered?: boolean;
    readonly focused?: boolean;
  }
}
