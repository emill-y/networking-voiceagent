// Give the user a file or text: a download on the web, the share sheet on phones.
import { Platform, Share } from "react-native";

export async function saveText(filename: string, text: string, mime: string): Promise<void> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: filename, message: text });
}

// True if it was copied (web), false if the share sheet was used instead.
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === "web" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
}
