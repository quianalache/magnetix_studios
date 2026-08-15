import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * MyMagnetix global Person auth — passwordless magic link OR password →
 * 30-day session cookie. Deliberate sibling of
 * `src/lib/community/member-auth.ts`, NOT a reuse of it: a Member session
 * token is scoped to one sub-account (`sa`) and identifies a tenant
 * relationship; this token is GLOBAL (no `sa`) and identifies a Person
 * (`people/{id}`) — the human above every tenant relationship. The two
 * token shapes and cookies are kept structurally
 * distinct so a MyMagnetix session can never be mistaken for, or replayed
 * as, a tenant Member session (and vice versa) even though they share the
 * same HMAC secret (see below).
 *
 * Shares `AUTOMATIONS_TOKEN_SECRET` with Member/affiliate tokens (same
 * "rotates as one knob" convention already documented on that env var) —
 * NOT the Firebase staff session, which is a completely separate JWT
 * system (next-firebase-auth-edge) this file never touches.
 */

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const HANDOFF_TTL_MS = 2 * 60 * 1000; // 2 minutes — see "ho" kind below

function getSecret(): string {
  const secret = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set — required to sign MyMagnetix person tokens.",
    );
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const pad = str.length % 4;
  const padded = pad ? str + "=".repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  // Distinct HMAC domain prefix from member-auth's tokens (`mm1:` vs none)
  // so even an identical JSON payload never produces the same signature —
  // belt-and-suspenders on top of the already-distinct payload shape.
  return base64UrlEncode(
    createHmac("sha256", getSecret()).update(`mm1:${payload}`).digest(),
  );
}

interface PersonTokenPayload {
  /** Email at time of issue (lookup only, not the permanent key). */
  e: string;
  /** Person id. Present on session/handoff tokens; absent on magic-link
   *  tokens (same "don't mint junk on a bot POST" rationale as
   *  member-auth). */
  pid?: string;
  exp: number;
  k: "ml" | "ses" | "ho";
}

function encodeToken(payload: PersonTokenPayload): string {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf-8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decodeToken(token: string): PersonTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected, "utf-8"), Buffer.from(sig, "utf-8"))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const json = base64UrlDecode(body).toString("utf-8");
    const parsed = JSON.parse(json) as PersonTokenPayload;
    if (
      typeof parsed.e !== "string" ||
      typeof parsed.exp !== "number" ||
      (parsed.k !== "ml" && parsed.k !== "ses" && parsed.k !== "ho")
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signPersonMagicLinkToken(email: string): string {
  return encodeToken({
    e: email.trim().toLowerCase(),
    exp: Date.now() + MAGIC_LINK_TTL_MS,
    k: "ml",
  });
}

export function signPersonSessionToken(personId: string, email: string): string {
  return encodeToken({
    e: email.trim().toLowerCase(),
    pid: personId,
    exp: Date.now() + SESSION_TTL_MS,
    k: "ses",
  });
}

export function verifyPersonMagicLinkToken(
  token: string,
): { email: string } | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ml") return null;
  return { email: payload.e };
}

export function verifyPersonSessionToken(
  token: string,
): { personId: string; email: string } | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ses" || !payload.pid) return null;
  return { personId: payload.pid, email: payload.e };
}

/**
 * Cross-domain handoff token (2026-08-17) — cookies cannot be set
 * cross-origin, full stop: a Route Handler running on a business's custom
 * domain (e.g. quianalache.com, reached via the Client Portal's "Back to
 * MyMagnetix" link) can verify an ls_member_session and resolve a
 * personId just fine, but any `mm_session` cookie it tried to set would
 * be scoped to THAT domain, not the platform origin MyMagnetix actually
 * lives on — invisible to /my, silently broken. This short-lived (2
 * minute), single-hop token carries the already-verified identity across
 * that one redirect to the platform origin, where the REAL mm_session
 * cookie gets set on the correct domain. It is never itself a valid
 * session credential (verifyPersonSessionToken rejects kind "ho"), and
 * its short TTL bounds the exposure window since — like magic-link
 * tokens — it is TTL-bound, not database-tracked single-use.
 */
export function signPersonHandoffToken(personId: string, email: string): string {
  return encodeToken({
    e: email.trim().toLowerCase(),
    pid: personId,
    exp: Date.now() + HANDOFF_TTL_MS,
    k: "ho",
  });
}

export function verifyPersonHandoffToken(
  token: string,
): { personId: string; email: string } | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ho" || !payload.pid) return null;
  return { personId: payload.pid, email: payload.e };
}

export const PERSON_SESSION_COOKIE = "mm_session";
export const PERSON_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
