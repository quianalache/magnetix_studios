import "server-only";

/**
 * Server side of the custom logo upload — mirrors lib/pwa/icons-server.ts's
 * validateIconPng, but for one image with no exact-dimension requirement
 * (a logo doesn't need to be square).
 */

export const LOGO_MAX_BYTES = 500_000;
export const LOGO_MAX_DIMENSION = 512;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Validate an uploaded logo: real PNG, within the size cap, within the byte budget. Returns the decoded buffer or a human-readable problem string. */
export function validateLogoPng(base64: unknown): Buffer | string {
  if (typeof base64 !== "string" || base64.length === 0) {
    return "Missing image data";
  }
  // +33% base64 overhead over the decoded cap, with slack for padding.
  if (base64.length > LOGO_MAX_BYTES * 1.4) {
    return "Image is too large — use a simpler file.";
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return "Image data isn't valid base64";
  }
  if (buf.length > LOGO_MAX_BYTES) {
    return "Image is too large — use a simpler file.";
  }
  if (buf.length < 24 || !PNG_SIGNATURE.every((b, i) => buf[i] === b)) {
    return "Image must be a PNG";
  }
  // IHDR is always the first chunk: width at 16-19, height at 20-23.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) {
    return `Image must be at most ${LOGO_MAX_DIMENSION}×${LOGO_MAX_DIMENSION}`;
  }
  return buf;
}
