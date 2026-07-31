import type { QrCodeStyle } from "@/types/qr-codes";

/**
 * Wraps `qr-code-styling`'s raw output with everything the library itself
 * doesn't draw: outer frame shape (GHL's "QR Shape"), rim text above/below,
 * and a full-bleed background image. One shared pipeline for PNG and SVG so
 * the live preview and the downloaded file are guaranteed to match — both
 * call this same function (via `renderQrToBlob` in `render.ts`).
 */

const TEXT_BAND_HEIGHT = 44;

export async function composeQrImage(params: {
  rawBlob: Blob;
  extension: "png" | "svg";
  style: QrCodeStyle;
  size: number;
}): Promise<Blob> {
  return params.extension === "svg" ? composeSvg(params) : composePng(params);
}

async function composePng({
  rawBlob,
  style,
  size,
}: {
  rawBlob: Blob;
  style: QrCodeStyle;
  size: number;
}): Promise<Blob> {
  const qrImg = await blobToImage(rawBlob);
  const topH = style.topText.trim() ? TEXT_BAND_HEIGHT : 0;
  const bottomH = style.bottomText.trim() ? TEXT_BAND_HEIGHT : 0;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + topH + bottomH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.save();
  clipShape(ctx, style.shape, 0, topH, size, size);
  if (style.backgroundImageUrl) {
    const bgImg = await loadImage(style.backgroundImageUrl);
    ctx.drawImage(bgImg, 0, topH, size, size);
  } else if (!style.bgTransparent) {
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(0, topH, size, size);
  }
  ctx.drawImage(qrImg, 0, topH, size, size);
  ctx.restore();

  ctx.fillStyle = style.fgColor;
  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (topH) ctx.fillText(style.topText.trim(), size / 2, topH / 2);
  if (bottomH) ctx.fillText(style.bottomText.trim(), size / 2, topH + size + bottomH / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      "image/png",
    );
  });
}

async function composeSvg({
  rawBlob,
  style,
  size,
}: {
  rawBlob: Blob;
  style: QrCodeStyle;
  size: number;
}): Promise<Blob> {
  const svgText = await rawBlob.text();
  const inner = extractSvgInner(svgText);
  const topH = style.topText.trim() ? TEXT_BAND_HEIGHT : 0;
  const bottomH = style.bottomText.trim() ? TEXT_BAND_HEIGHT : 0;
  const totalH = size + topH + bottomH;

  const clipId = "qr-shape-clip";
  const clipDef =
    style.shape === "circle"
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" />`
      : style.shape === "rounded"
        ? `<rect width="${size}" height="${size}" rx="${size * 0.08}" ry="${size * 0.08}" />`
        : `<rect width="${size}" height="${size}" />`;

  let bgMarkup = "";
  if (style.backgroundImageUrl) {
    const dataUrl = await urlToDataUrl(style.backgroundImageUrl);
    bgMarkup = `<image href="${dataUrl}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" />`;
  } else if (!style.bgTransparent) {
    bgMarkup = `<rect width="${size}" height="${size}" fill="${style.bgColor}" />`;
  }

  const topMarkup = topH
    ? textEl(size / 2, topH / 2, style.topText.trim(), style.fgColor)
    : "";
  const bottomMarkup = bottomH
    ? textEl(size / 2, topH + size + bottomH / 2, style.bottomText.trim(), style.fgColor)
    : "";

  const final = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalH}" viewBox="0 0 ${size} ${totalH}">
<defs><clipPath id="${clipId}">${clipDef}</clipPath></defs>
<g transform="translate(0, ${topH})" clip-path="url(#${clipId})">
${bgMarkup}
${inner}
</g>
${topMarkup}
${bottomMarkup}
</svg>`;

  return new Blob([final], { type: "image/svg+xml" });
}

function textEl(x: number, y: number, text: string, color: string): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="18" fill="${color}">${escapeXml(text)}</text>`;
}

function extractSvgInner(svgText: string): string {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  return parsed.documentElement.innerHTML;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clipShape(
  ctx: CanvasRenderingContext2D,
  shape: QrCodeStyle["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (shape === "rounded") {
    const r = Math.min(w, h) * 0.08;
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      roundedRectPath(ctx, x, y, w, h, r);
    }
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
  ctx.clip();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return loadImage(URL.createObjectURL(blob), true);
}

function loadImage(src: string, revoke = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(src);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}
