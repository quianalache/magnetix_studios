import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import {
  passCookieMaxAge,
  passGrants,
  readingPassCookieName,
  resultPagePassCookieName,
  verifyReadingResultPass,
  type ReadingResultPass,
} from "@/lib/server/reading-result-pass";
import { maskEmail, personOwnsReading, readingOwnerEmail } from "@/lib/server/reading-access";
import { getCurrentPerson } from "@/lib/server/person-session";
import { sendPersonMagicLinkEmail } from "@/lib/server/person-magic-link";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { platformOrigin } from "@/lib/domains/public-url";

export const dynamic = "force-dynamic";

/**
 * The Reading result pass endpoint (2026-10-21).
 *
 * GET ?pass=…&to=page|report|pdf — exchanges a signed 24-hour pass for a
 * host-only, httpOnly cookie on THIS domain (so it works on a business's own
 * custom domain too), then redirects to the clean URL. The destination is
 * derived from the pass itself — never from a caller-supplied URL — so this
 * is not an open redirect. An invalid or expired pass goes to MyMagnetix,
 * the permanent home.
 *
 * POST { readingId, pass? } — the "Open your Reading in MyMagnetix" button.
 * Requires a valid pass for that Reading (body or cookie). The visitor is
 * NOT signed in by this: if they're already signed into MyMagnetix as the
 * Reading's owner they're sent straight to it; otherwise a one-time sign-in
 * link goes to the Reading's own email address (never to an address the
 * caller supplies) and the page shows "check your email".
 */

type Ctx = { params: Promise<{ saId: string }> };

function setPassCookie(store: Awaited<ReturnType<typeof cookies>>, name: string, token: string, pass: ReadingResultPass) {
  store.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: passCookieMaxAge(pass),
  });
}

export async function GET(request: Request, { params }: Ctx) {
  const { saId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("pass");
  const to = url.searchParams.get("to");
  const pass = verifyReadingResultPass(token);
  if (!token || !pass || !passGrants(pass, { subAccountId: saId })) {
    return NextResponse.redirect(new URL("/my/readings", platformOrigin() || url.origin), 303);
  }
  const store = await cookies();
  setPassCookie(store, readingPassCookieName(pass.readingId), token, pass);

  let destination: string;
  if (to === "page" && pass.pageId) {
    setPassCookie(store, resultPagePassCookieName(pass.pageId), token, pass);
    // A staff Test run may target a page that isn't published yet.
    destination = `/p/${pass.pageId}${pass.test ? "?draft=1" : ""}`;
  } else if (to === "pdf") {
    destination = `/api/decoder/${saId}/report/${pass.readingId}/pdf`;
  } else {
    destination = `/decoder/${saId}/report/${pass.readingId}`;
  }
  return NextResponse.redirect(new URL(destination, url), 303);
}

export async function POST(request: Request, { params }: Ctx) {
  const { saId } = await params;
  let body: { readingId?: unknown; pass?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const readingId = typeof body.readingId === "string" ? body.readingId : "";
  const store = await cookies();
  const fromBody = typeof body.pass === "string" ? verifyReadingResultPass(body.pass) : null;
  const fromCookie = readingId ? verifyReadingResultPass(store.get(readingPassCookieName(readingId))?.value) : null;
  const pass = [fromBody, fromCookie].find((p) => passGrants(p, { readingId, subAccountId: saId })) ?? null;
  if (!readingId || !pass) {
    return NextResponse.json({ error: "This Reading link has expired. Open MyMagnetix and sign in with your email to see it." }, { status: 403 });
  }

  const reading = await getReadingById(saId, readingId);
  if (!reading) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reading.embed && reading.embed.myMagnetix === false) {
    return NextResponse.json({ error: "This Reading isn’t saved to MyMagnetix." }, { status: 404 });
  }

  const openPath = `/my/readings/${readingId}`;
  const openUrl = `${platformOrigin() || new URL(request.url).origin}${openPath}`;

  // Already signed in here as the Reading's owner — go straight there.
  const person = await getCurrentPerson();
  if (await personOwnsReading(person, reading)) return NextResponse.json({ ok: true, action: "open", url: openUrl });

  const email = await readingOwnerEmail(reading);
  if (!email) return NextResponse.json({ error: "We couldn’t find an email for this Reading." }, { status: 422 });

  const allowed = checkMemberAuthRateLimit({ key: `reading-mymagnetix:${readingId}`, limit: 3, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ ok: true, action: "checkEmail", maskedEmail: maskEmail(email), url: openUrl, throttled: true });
  }
  let sent = false;
  try {
    sent = await sendPersonMagicLinkEmail({ email, next: openPath, origin: platformOrigin() || new URL(request.url).origin, reason: "reading" });
  } catch (err) {
    console.error("[reading-result] MyMagnetix sign-in email failed", err instanceof Error ? err.message : err);
  }
  if (!sent) {
    return NextResponse.json({ error: "We couldn’t send the email just now. Try again in a minute." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, action: "checkEmail", maskedEmail: maskEmail(email), url: openUrl });
}
