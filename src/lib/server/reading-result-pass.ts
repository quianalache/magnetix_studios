import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Reading result pass (2026-10-21) — the short-lived credential that lets
 * the person who just submitted a Reading Tool see THAT Reading right away
 * (the Standard Result's links, a custom Reading Result Page, the Reading
 * Report and PDF) without signing in.
 *
 *   - signed server-side (HMAC-SHA256, its own `rrp1:` domain so it can
 *     never be mistaken for a MyMagnetix, Member, quote or unsubscribe token
 *     even though they share AUTOMATIONS_TOKEN_SECRET)
 *   - bound to ONE Reading and ONE business, and to ONE Reading Result Page
 *     when the Reading Tool sends people to one — changing any id in a URL
 *     breaks the signature
 *   - expires 24 hours after the Reading was created; never extended
 *   - NOT an identity: it never signs anyone into MyMagnetix. Permanent
 *     access is MyMagnetix, which proves the email first.
 *
 * Handed over in a URL exactly once, then exchanged for a host-only,
 * httpOnly cookie on whichever domain serves the result, followed by a
 * redirect to the clean URL (see /api/decoder/[saId]/result).
 */

export const READING_RESULT_PASS_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReadingResultPass {
  readingId: string;
  subAccountId: string;
  /** The Reading Result Page this pass opens, when the Reading Tool uses one. */
  pageId: string | null;
  /** A staff Test run — the Result Page renders its draft for staff. */
  test: boolean;
  expiresAt: number;
}

interface Payload {
  r: string;
  sa: string;
  p: string | null;
  t: 0 | 1;
  exp: number;
  v: 1;
}

function secret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s) throw new Error("AUTOMATIONS_TOKEN_SECRET is not set — required to sign Reading result passes.");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str: string): Buffer {
  const pad = str.length % 4;
  return Buffer.from((pad ? str + "=".repeat(4 - pad) : str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(`rrp1:${body}`).digest());
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function mintReadingResultPass(opts: {
  readingId: string;
  subAccountId: string;
  pageId?: string | null;
  test?: boolean;
  /** When the Reading was created — the pass lasts 24h from then. Defaults to now. */
  issuedAt?: number;
}): string {
  if (!ID_RE.test(opts.readingId) || !ID_RE.test(opts.subAccountId) || (opts.pageId && !ID_RE.test(opts.pageId))) {
    throw new Error("Invalid id for a Reading result pass.");
  }
  const payload: Payload = {
    r: opts.readingId,
    sa: opts.subAccountId,
    p: opts.pageId ?? null,
    t: opts.test ? 1 : 0,
    exp: (opts.issuedAt ?? Date.now()) + READING_RESULT_PASS_TTL_MS,
    v: 1,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  return `${body}.${sign(body)}`;
}

/** Null for anything forged, malformed, expired or from another version. */
export function verifyReadingResultPass(token: string | null | undefined, now = Date.now()): ReadingResultPass | null {
  if (!token || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  let p: Payload;
  try {
    p = JSON.parse(fromB64url(body).toString("utf-8")) as Payload;
  } catch {
    return null;
  }
  if (p.v !== 1 || typeof p.exp !== "number" || !ID_RE.test(p.r ?? "") || !ID_RE.test(p.sa ?? "")) return null;
  if (p.p !== null && !ID_RE.test(p.p ?? "")) return null;
  if (now > p.exp) return null;
  return { readingId: p.r, subAccountId: p.sa, pageId: p.p, test: p.t === 1, expiresAt: p.exp };
}

/** Verify AND require the pass to be for exactly this Reading/business (and page, when given). */
export function passGrants(
  pass: ReadingResultPass | null,
  expect: { readingId?: string; subAccountId: string; pageId?: string },
): boolean {
  if (!pass) return false;
  if (pass.subAccountId !== expect.subAccountId) return false;
  if (expect.readingId !== undefined && pass.readingId !== expect.readingId) return false;
  if (expect.pageId !== undefined && pass.pageId !== expect.pageId) return false;
  return true;
}

/** Cookie holding the pass for one Reading (Reading Report, PDF, MyMagnetix button). */
export function readingPassCookieName(readingId: string): string {
  return `mx_rr_${readingId}`;
}

/** Cookie holding the pass a Reading Result Page reads (the most recent Reading sent there). */
export function resultPagePassCookieName(pageId: string): string {
  return `mx_rp_${pageId}`;
}

/** Seconds a cookie for this pass should live — never past the pass itself. */
export function passCookieMaxAge(pass: ReadingResultPass, now = Date.now()): number {
  return Math.max(0, Math.floor((pass.expiresAt - now) / 1000));
}
