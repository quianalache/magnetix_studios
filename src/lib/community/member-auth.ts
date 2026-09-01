import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Community member auth — passwordless magic link → 30-day session cookie.
 *
 * This is a deliberate clone of the affiliate auth model
 * (`src/lib/affiliate/magic-link.ts`): members are NOT Firebase Auth users,
 * they carry an HMAC-signed token, and the secret is shared with unsubscribe /
 * affiliate links so it rotates as one knob. The difference: every token is
 * SCOPED TO A SUB-ACCOUNT (`sa`) so a session minted for one sub-account can't
 * be replayed against another, and the magic-link token does NOT carry a member
 * id — the member is created/looked-up at verify time (so bots POSTing the
 * login endpoint never mint junk member docs).
 */

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const HANDOFF_TTL_MS = 2 * 60 * 1000; // 2 minutes — see "ho" kind below

function getSecret(): string {
  const secret = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set — required to sign community member tokens."
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
  return base64UrlEncode(
    createHmac("sha256", getSecret()).update(payload).digest()
  );
}

interface TokenPayload {
  /** Sub-account the token is scoped to. */
  sa: string;
  /** Member doc id. Present on session and handoff tokens; absent on
   *  magic-link tokens. */
  mid?: string;
  /** Email at the time of issue. */
  e: string;
  /** Expiration epoch ms. */
  exp: number;
  /** "ml" = magic link (one-time, 15min); "ses" = session cookie (30d);
   *  "ho" = cross-domain handoff (single-hop, 2min) — see
   *  signMemberHandoffToken below. */
  k: "ml" | "ses" | "ho";
  /** Optional "join this group on verify" intent (magic-link tokens only). */
  j?: string;
  /**
   * Optional "return to this standalone course on verify" intent
   * (magic-link tokens only). Distinct from `j` — a course login has no
   * group/membership to auto-join; verify just establishes the session and
   * redirects back to the course, where the buyer completes enroll/purchase
   * as an explicit follow-up action.
   */
  c?: string;
  /** Points & Rewards — the inviting member's memberId (magic-link tokens
   *  only). See `signMemberMagicLinkToken`'s doc comment. */
  r?: string;
  /** Optional display name captured during Community registration. */
  n?: string;
  /** Destination path on the handoff's target domain (handoff tokens only).
   *  Signed into the token itself — not a separate mutable query param —
   *  so the redirect destination can't be altered after the token was
   *  issued. See signMemberHandoffToken. */
  next?: string;
}

function encodeToken(payload: TokenPayload): string {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf-8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decodeToken(token: string): TokenPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body);
  if (expected.length !== sig.length) return null;
  try {
    if (
      !timingSafeEqual(
        Buffer.from(expected, "utf-8"),
        Buffer.from(sig, "utf-8")
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const json = base64UrlDecode(body).toString("utf-8");
    const parsed = JSON.parse(json) as TokenPayload;
    if (
      typeof parsed.sa !== "string" ||
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

export function signMemberMagicLinkToken(
  subAccountId: string,
  email: string,
  joinGroupId?: string,
  courseId?: string,
  /** Points & Rewards — the inviting member's memberId (`?ref=` on the
   *  login URL), carried through the signed link the same way `joinGroupId`
   *  already is, since the login POST and the eventual `/verify` GET are
   *  two separate, unrelated requests. */
  invitedByMemberId?: string,
  displayName?: string,
  /** Signed, Community-scoped return path for an intentional deep link. */
  returnPath?: string
): string {
  return encodeToken({
    sa: subAccountId,
    e: email.trim().toLowerCase(),
    exp: Date.now() + MAGIC_LINK_TTL_MS,
    k: "ml",
    ...(joinGroupId ? { j: joinGroupId } : {}),
    ...(courseId ? { c: courseId } : {}),
    ...(invitedByMemberId ? { r: invitedByMemberId } : {}),
    ...(displayName?.trim() ? { n: displayName.trim() } : {}),
    ...(returnPath ? { next: returnPath } : {}),
  });
}

export function signMemberSessionToken(
  subAccountId: string,
  memberId: string,
  email: string
): string {
  return encodeToken({
    sa: subAccountId,
    mid: memberId,
    e: email.trim().toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
    k: "ses",
  });
}

export function verifyMemberMagicLinkToken(token: string): {
  subAccountId: string;
  email: string;
  joinGroupId?: string;
  courseId?: string;
  invitedByMemberId?: string;
  displayName?: string;
  returnPath?: string;
} | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ml") return null;
  return {
    subAccountId: payload.sa,
    email: payload.e,
    joinGroupId: payload.j,
    courseId: payload.c,
    invitedByMemberId: payload.r,
    displayName: payload.n,
    returnPath: payload.next,
  };
}

export function verifyMemberSessionToken(
  token: string
): { subAccountId: string; memberId: string; email: string } | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ses" || !payload.mid) return null;
  return { subAccountId: payload.sa, memberId: payload.mid, email: payload.e };
}

/**
 * Cross-domain Staff -> Member handoff (2026-08-19) — a Member-flavored
 * sibling of `signPersonHandoffToken`/`verifyPersonHandoffToken`
 * (person-auth.ts), same rationale: cookies cannot be set cross-origin, so
 * a route running on crm.magnetixstudios.com that has just resolved (or
 * provisioned) a Member + GroupMembership for an already-authenticated
 * staff user cannot itself set `ls_member_session` scoped correctly to a
 * business's own verified custom domain — this short-lived, single-hop
 * token carries that already-verified outcome across the one redirect to
 * the domain that actually needs to set the cookie.
 *
 * Deliberately a distinct token KIND ("ho") within the SAME payload shape
 * member-auth.ts already uses (not a new file/secret) — `verifyMemberSessionToken`
 * above explicitly requires `k === "ses"`, so a handoff token can never be
 * replayed as a session credential itself, only exchanged once by
 * /api/member-session/handoff within its 2-minute TTL. `next` is signed
 * INTO the token (not a separate mutable query param) specifically so the
 * redirect destination can't be altered after issuance — see the Staff ->
 * Member Seamless Entry report for why this is a deliberate strengthening
 * over the person-handoff token's own (path-restricted, but unsigned)
 * `next` query param.
 */
export function signMemberHandoffToken(
  subAccountId: string,
  memberId: string,
  email: string,
  next: string
): string {
  return encodeToken({
    sa: subAccountId,
    mid: memberId,
    e: email.trim().toLowerCase(),
    exp: Date.now() + HANDOFF_TTL_MS,
    k: "ho",
    next,
  });
}

export function verifyMemberHandoffToken(token: string): {
  subAccountId: string;
  memberId: string;
  email: string;
  next: string;
} | null {
  const payload = decodeToken(token);
  if (!payload || payload.k !== "ho" || !payload.mid || !payload.next)
    return null;
  return {
    subAccountId: payload.sa,
    memberId: payload.mid,
    email: payload.e,
    next: payload.next,
  };
}

export const MEMBER_SESSION_COOKIE = "ls_member_session";
export const MEMBER_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
