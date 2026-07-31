import type { Timestamp, FieldValue } from "firebase/firestore";

export type QrCodeKind = "link" | "contact";
export type QrDotStyle = "square" | "rounded" | "dots" | "classy";

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
  scanCount: number;
  vcard: QrCodeVcard | null;
  style: QrCodeStyle;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function defaultQrStyle(): QrCodeStyle {
  return {
    fgColor: "#5E2574",
    bgColor: "#FFFFFF",
    dotStyle: "rounded",
    logoUrl: null,
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
