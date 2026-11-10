import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PageThumbnailVariant } from "@/types/pages-funnels";

/**
 * Capture pass for the thumbnail service (2026-11). The headless browser
 * opens `/p/{pageId}?mx_thumb=<token>` on this deployment. The token:
 *  - names ONE page and ONE variant (published / draft),
 *  - expires after 3 minutes,
 *  - is HMAC-signed with AUTOMATIONS_TOKEN_SECRET under its own domain
 *    prefix, so no other Magnetix token can verify as this one.
 * It only ever travels server → headless browser → this server; it is never
 * returned to a browser or stored. With a valid token `/p` skips the
 * tenant's tracking scripts and automatic popups and, for `draft`, renders
 * the saved draft instead of 404ing.
 */
const DOMAIN = "mx-page-thumb-v1";
const TTL_MS = 3 * 60_000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function secret(): string | null {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  return s && s.length >= 16 ? s : null;
}

const sign = (key: string, payload: string) => createHmac("sha256", key).update(`${DOMAIN}:${payload}`).digest("base64url");

export function issueThumbnailToken(pageId: string, variant: PageThumbnailVariant, now = Date.now()): string | null {
  const key = secret();
  if (!key || !ID.test(pageId)) return null;
  const payload = `${pageId}.${variant}.${now + TTL_MS}`;
  return `${payload}.${sign(key, payload)}`;
}

/** The variant the token grants for THIS page, or null when invalid/expired/other page. */
export function verifyThumbnailToken(token: unknown, pageId: string, now = Date.now()): PageThumbnailVariant | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, variant, exp, sig] = parts;
  if (id !== pageId || (variant !== "published" && variant !== "draft")) return null;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < now || expMs > now + TTL_MS + 60_000) return null;
  const expected = Buffer.from(sign(key, `${id}.${variant}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return variant;
}
