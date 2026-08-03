/**
 * Client-side logo resize — mirrors lib/pwa/render-icons-client.ts's
 * approach (browser does the resizing, server never needs a native image
 * library) but simpler: one output, not four variants, and no forced
 * background fill, since the logo is a mark meant to sit on whatever
 * background the sidebar/landing page already has (transparency preserved).
 */

const MAX_DIMENSION = 512;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image — try a PNG, JPG, or SVG."));
    };
    img.src = url;
  });
}

/** Returns base64 PNG (no `data:` prefix), downscaled to fit within MAX_DIMENSION if needed. */
export async function renderLogo(file: File): Promise<string> {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) {
    throw new Error("Couldn't read that image — try a PNG, JPG, or SVG.");
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
