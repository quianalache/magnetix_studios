import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Single-use email sign-in links (2026-10-19).
 *
 * Member and MyMagnetix magic-link tokens are stateless HMAC tokens with a
 * 15-minute expiry. Redemption is recorded here so each link signs someone
 * in exactly once:
 *
 *  - `magicLinkRedemptions/{sha256(token)}` is written with `create()`,
 *    which fails if the doc exists — two simultaneous redemptions can't
 *    both succeed. Only the hash is stored; server-only collection
 *    (default-deny rules). Swept daily by the api-cleanup cron.
 *  - The link's GET never redeems. It returns a tiny page that submits a
 *    POST to the same URL, and only the POST redeems. Email security
 *    scanners and link previews (e.g. Outlook Safe Links) open links with
 *    GET before the person does; consuming on GET would spend the link
 *    before its owner ever clicked it.
 */

export const MAGIC_LINK_REDEMPTIONS = "magicLinkRedemptions";

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Atomically mark `token` as used. Returns true for the first redemption
 * only; every later (or concurrent) call returns false.
 */
export async function redeemMagicLinkOnce(
  token: string,
  expiresAt: number
): Promise<boolean> {
  try {
    await getAdminDb()
      .collection(MAGIC_LINK_REDEMPTIONS)
      .doc(tokenKey(token))
      .create({
        usedAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(expiresAt),
      });
    return true;
  } catch (err) {
    // gRPC ALREADY_EXISTS — this link was already used.
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
}

/** Delete expired redemption records (daily api-cleanup cron). */
export async function sweepExpiredMagicLinkRedemptions(
  now: Date,
  limit = 400
): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection(MAGIC_LINK_REDEMPTIONS)
    .where("expiresAt", "<", now)
    .limit(limit)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

/**
 * The GET response for a sign-in link: a minimal page that immediately
 * POSTs back to the same URL (query string included), with a visible
 * button when scripts are off. It reveals nothing about the token.
 */
export function magicLinkContinuePage(): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Signing you in…</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fafafa;color:#202124}
  @media (prefers-color-scheme:dark){body{background:#151418;color:#f2f1f5}}
  main{text-align:center;padding:24px;max-width:360px}
  p{margin:0 0 20px;font-size:15px;line-height:1.5}
  button{font:inherit;font-size:15px;font-weight:500;padding:12px 22px;border-radius:8px;border:0;background:#202124;color:#fff;cursor:pointer}
  @media (prefers-color-scheme:dark){button{background:#f2f1f5;color:#151418}}
</style>
</head><body><main>
<form method="post" id="continue">
  <p>Signing you in…</p>
  <button type="submit">Continue</button>
</form>
<script>document.getElementById("continue").submit();</script>
</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

/**
 * Redirects produced while handling the POST must be 303 so the browser
 * follows them with GET (a 307 would re-POST to the destination page).
 * Cookies set through `cookies()` are still attached by Next.js.
 */
export function asSeeOther(res: Response): Response {
  if (res.status !== 307 && res.status !== 308) return res;
  const location = res.headers.get("location");
  if (!location) return res;
  const out = NextResponse.redirect(location, 303);
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.headers.append(key, value);
  });
  return out;
}
