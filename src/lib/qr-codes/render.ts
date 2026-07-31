import type { Options } from "qr-code-styling";
import type { QrCodeStyle } from "@/types/qr-codes";
import { composeQrImage } from "@/lib/qr-codes/compose";

/** Print-quality default — decoupled from whatever size the on-screen
 *  preview happens to render at. */
export const QR_EXPORT_SIZE = 600;

const DOT_TYPE_MAP: Record<
  QrCodeStyle["dotStyle"],
  NonNullable<Options["dotsOptions"]>["type"]
> = {
  square: "square",
  rounded: "rounded",
  dots: "dots",
  classy: "classy",
};

export function buildQrOptions(
  data: string,
  style: QrCodeStyle,
  size: number,
): Partial<Options> {
  const roundedCorners = style.dotStyle !== "square";
  return {
    width: size,
    height: size,
    data: data || " ",
    image: style.logoUrl ?? undefined,
    dotsOptions: { type: DOT_TYPE_MAP[style.dotStyle], color: style.fgColor },
    cornersSquareOptions: {
      type: roundedCorners ? "extra-rounded" : "square",
      color: style.markerColor || style.fgColor,
    },
    cornersDotOptions: {
      type: roundedCorners ? "dot" : "square",
      color: style.markerColor || style.fgColor,
    },
    // Compositing (compose.ts) draws its own background/shape/rim text —
    // keep the library's own canvas transparent so nothing double-paints.
    backgroundOptions: { color: "transparent" },
    imageOptions: { crossOrigin: "anonymous", margin: 4, imageSize: 0.35 },
  };
}

/** Renders a QR code to a finished, composited image blob — the single
 *  path used by both the live preview and every download entry point (the
 *  builder and the list page's one-click menu), so they can never drift. */
export async function renderQrToBlob(
  data: string,
  style: QrCodeStyle,
  extension: "png" | "svg",
  size: number = QR_EXPORT_SIZE,
): Promise<Blob> {
  const { default: QRCodeStylingCtor } = await import("qr-code-styling");
  const qr = new QRCodeStylingCtor(buildQrOptions(data, style, size));
  const raw = await qr.getRawData(extension);
  if (!raw) throw new Error("Couldn't render this QR code.");
  const rawBlob = raw instanceof Blob ? raw : new Blob([raw as BlobPart]);
  return composeQrImage({ rawBlob, extension, style, size });
}

/** Renders + triggers a browser download in one call — used by the list
 *  page's menu, which has no visible canvas to download from. */
export async function downloadQrCode(
  data: string,
  style: QrCodeStyle,
  extension: "png" | "svg",
  filename: string,
): Promise<void> {
  const blob = await renderQrToBlob(data, style, extension);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
