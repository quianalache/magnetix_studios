import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Agency Communications unsubscribe tokens — the agency-scope sibling of
 * unsubscribe-token.ts's tenant Contact tokens. Same self-contained HMAC
 * mechanism and secret (`AUTOMATIONS_TOKEN_SECRET`), but signs the
 * recipient's own EMAIL rather than a Firestore contactId: tenant's
 * `signUnsubscribeToken` deliberately rejects anything but a bare
 * alphanumeric Firestore auto-id ("Firestore auto-IDs are alphanumeric...
 * we'd fail verification because we split on it"), which an email address
 * — containing `@` and `.` — can never satisfy. Base64url-encoding the
 * email keeps the token itself alphanumeric-safe for the URL while still
 * being fully self-contained (no DB lookup needed to resolve it back).
 */

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.");
  }
  return s;
}

function encodeEmail(email: string): string {
  return Buffer.from(email.trim().toLowerCase(), "utf8").toString("base64url");
}

function decodeEmail(encoded: string): string | null {
  try {
    const email = Buffer.from(encoded, "base64url").toString("utf8");
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export function signAgencyUnsubscribeToken(email: string): string {
  const encoded = encodeEmail(email);
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

/** Returns the recipient email if the token is valid, or null otherwise. */
export function verifyAgencyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const email = decodeEmail(encoded);
  if (!email) return null;
  let expected: string;
  try {
    expected = signAgencyUnsubscribeToken(email);
  } catch {
    return null;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? email : null;
}

/** Empty string when NEXT_PUBLIC_APP_URL isn't configured — the email
 *  still renders, just with a broken link, same fallback tenant's own
 *  buildUnsubscribeUrl uses. */
export function buildAgencyUnsubscribeUrl(email: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/u/agency/${signAgencyUnsubscribeToken(email)}`;
}
