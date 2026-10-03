// Choose a profile photo on the web and shrink it to a small square JPEG
// (about 20-40 KB), cropped from the center.
import { Platform } from "react-native";

export const canPickPhoto = Platform.OS === "web";

export function pickPhoto(size = 256): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 15 * 1024 * 1024) return reject(new Error("That photo is too large."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn’t read that photo."));
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Couldn’t read that photo."));
      img.src = url;
    };
    input.click();
  });
}
