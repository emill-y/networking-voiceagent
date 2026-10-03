// The pure QR encoder inside the "qrcode" package (no Node or canvas deps).
declare module "qrcode/lib/core/qrcode" {
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; data: Uint8Array | boolean[] } };
}
