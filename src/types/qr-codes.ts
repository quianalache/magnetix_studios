import type { Timestamp, FieldValue } from "firebase/firestore";

export type QrCodeKind = "link" | "contact";
export type QrDotStyle = "square" | "rounded" | "dots" | "classy";
export type QrShape = "square" | "rounded" | "circle";
export type QrDestinationType = "custom" | "booking" | "offer";

export interface QrCodeVcard {
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}

export interface QrCodeStyle {
  fgColor: string;
  bgColor: string;
  dotStyle: QrDotStyle;
  logoUrl: string | null;
  /** Outer frame shape — GHL's "QR Shape", distinct from `dotStyle`. */
  shape: QrShape;
  /** Corner "eye" marker color. Defaults to `fgColor` when unset. */
  markerColor: string;
  /** GHL's "rim content" — CTA text baked above/below the code. */
  topText: string;
  bottomText: string;
  /** Full-bleed background image, drawn behind the code (not the center
   *  logo). Null = solid `bgColor` (or transparent, see below). */
  backgroundImageUrl: string | null;
  /** When true, the PNG export's background is transparent regardless of
   *  `bgColor` — the common "overlay on a flyer" case, without a full
   *  alpha-slider control. */
  bgTransparent: boolean;
}

export interface QrDestinationRef {
  type: "booking" | "offer";
  id: string;
}

/**
 * A saved QR code. `kind: "link"` is dynamic — the printed code points at
 * our own `/qr/{id}` redirect, so `destinationUrl` can change later without
 * reprinting, and `scanCount` tracks usage. `kind: "contact"` is static —
 * the vcard fields are encoded directly into the code's data at render
 * time, so it works with zero server involvement (and can't be tracked or
 * edited after printing, by nature of being static).
 */
export interface QrCodeDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  kind: QrCodeKind;
  destinationUrl: string | null;
  /** Which picker produced `destinationUrl` — UI-only (pre-selects the
   *  right tab/item on re-edit), never consulted by the redirect route. */
  destinationType: QrDestinationType;
  destinationRef: QrDestinationRef | null;
  scanCount: number;
  vcard: QrCodeVcard | null;
  style: QrCodeStyle;
  folderId: string | null;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface QrFolder {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  createdAt: Timestamp | FieldValue | null;
}

export function defaultQrStyle(): QrCodeStyle {
  return {
    fgColor: "#5E2574",
    bgColor: "#FFFFFF",
    dotStyle: "rounded",
    logoUrl: null,
    shape: "square",
    markerColor: "#5E2574",
    topText: "",
    bottomText: "",
    backgroundImageUrl: null,
    bgTransparent: false,
  };
}

/** Fills in any style fields missing on docs written before this field
 *  existed, so every consumer (builder, compose pipeline, list downloads)
 *  can assume a fully-populated `QrCodeStyle` without its own fallback
 *  logic scattered around. Call at every Firestore read boundary. */
export function normalizeQrStyle(style: Partial<QrCodeStyle> | null | undefined): QrCodeStyle {
  return { ...defaultQrStyle(), ...(style ?? {}) };
}

/** Same idea as `normalizeQrStyle`, for the doc-level fields added after
 *  the original ship (destination picker metadata, folders). */
export function normalizeQrCode(doc: QrCodeDoc): QrCodeDoc {
  return {
    ...doc,
    style: normalizeQrStyle(doc.style),
    destinationType: doc.destinationType ?? "custom",
    destinationRef: doc.destinationRef ?? null,
    folderId: doc.folderId ?? null,
  };
}

export function emptyVcard(): QrCodeVcard {
  return {
    name: "",
    title: "",
    company: "",
    phone: "",
    email: "",
    website: "",
    address: "",
  };
}

/** Builds an RFC-6350-ish vCard 3.0 text blob — universally scannable by
 *  iOS/Android native camera apps, no app install required on either side. */
export function buildVcardText(v: QrCodeVcard): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").trim();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(v.name)}`,
    `FN:${esc(v.name)}`,
  ];
  if (v.title) lines.push(`TITLE:${esc(v.title)}`);
  if (v.company) lines.push(`ORG:${esc(v.company)}`);
  if (v.phone) lines.push(`TEL;TYPE=CELL:${esc(v.phone)}`);
  if (v.email) lines.push(`EMAIL:${esc(v.email)}`);
  if (v.website) lines.push(`URL:${esc(v.website)}`);
  if (v.address) lines.push(`ADR;TYPE=WORK:;;${esc(v.address)};;;;`);
  lines.push("END:VCARD");
  return lines.join("\n");
}
