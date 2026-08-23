import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encrypt/decrypt for exactly one thing: the Skool session
 * cookie blob held in `skoolImportSessions/*` for the lifetime of an
 * active import session (see session-store.ts). NOT used for, and never
 * touches, the Skool PASSWORD — that's discarded immediately after login
 * (see headless-browser.ts) and never reaches this module or Firestore.
 *
 * Key comes from `SKOOL_IMPORT_SESSION_KEY` (32 raw bytes, base64) — fails
 * loudly at call time if unset rather than silently falling back to a
 * built-in key, which would defeat the point of encrypting at rest at all.
 */

function getKey(): Buffer {
  const raw = process.env.SKOOL_IMPORT_SESSION_KEY;
  if (!raw) {
    throw new Error(
      "SKOOL_IMPORT_SESSION_KEY is not configured — Skool Import cannot store a session securely without it.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SKOOL_IMPORT_SESSION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/** `iv:authTag:ciphertext`, each base64 — a plain string so it drops
 *  straight into a Firestore string field. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard IV size
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted session value.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
