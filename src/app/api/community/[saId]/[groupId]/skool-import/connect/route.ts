import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { validateAndNormalizeSkoolUrl } from "@/lib/server/skool-import/skool-url";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/server/skool-import/rate-limit";
import { connectToSkool } from "@/lib/server/skool-import/headless-browser";
import { createImportSession } from "@/lib/server/skool-import/session-store";

export const dynamic = "force-dynamic";
// Real Chromium launch + Skool login + a second real navigation to confirm
// community access can genuinely take 15-25s on a cold start — well past
// Vercel's 10s default. Requires at least a Pro-tier project (60s default,
// this raises it further) to run reliably; see the Connect report.
export const maxDuration = 90;

/**
 * Skool Import → Connect. The ONLY step this pass builds. Establishes a
 * real, programmatic, authenticated Skool session — see
 * headless-browser.ts's module comment for the full architecture — and
 * stores it (encrypted, password never included) behind an opaque
 * `importSessionId`. Zero writes to Community content: no Member, Contact,
 * Person, GroupMembership, Channel, Post, Comment, point, or reward is
 * created or touched here.
 *
 * Authorization: the SAME `requireGroupApiAccess` + `role === "moderator"`
 * check every other Community Settings write route in this codebase uses
 * (see settings/route.ts) — works identically whether the caller reached
 * this from the staff-embedded shell or the standalone member shell, since
 * staff already carry a real `ls_member_session` cookie via the existing
 * ensure-session bridge. The destination Community is `groupId` from the
 * URL alone — never trusted from the request body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }
  const memberId = access.member.id;

  let body: { skoolUrl?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const skoolUrl = typeof body.skoolUrl === "string" ? body.skoolUrl : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  // Password is read once, right here, used below, then falls out of scope
  // — never assigned to any other variable, never logged, never part of
  // any object that gets persisted.
  const password = typeof body.password === "string" ? body.password : "";

  const urlResult = validateAndNormalizeSkoolUrl(skoolUrl);
  if (!urlResult.ok || !urlResult.slug) {
    return NextResponse.json(
      { error: "invalid-url", message: "We couldn't recognize that Skool community URL." },
      { status: 400 },
    );
  }
  if (!email || !password) {
    return NextResponse.json(
      { error: "missing-credentials", message: "Enter your Skool email and password." },
      { status: 400 },
    );
  }

  const rate = await checkRateLimit(saId, groupId, memberId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "rate-limited",
        message: "Too many failed attempts. Please wait a few minutes and try again.",
      },
      { status: 429 },
    );
  }

  // ONE Chromium lifecycle for the whole Connect request — login and
  // community-access validation happen in the same authenticated
  // browser/context before it ever closes. Previously these were two
  // separate headless-browser launches; real production evidence showed
  // the second launch was the actual failure point. See
  // docs/debug/skool-connect-diagnostic.md and headless-browser.ts's
  // connectToSkool doc comment.
  const result = await connectToSkool(email, password, urlResult.slug);
  if (!result.ok || !result.cookies || !result.communityName) {
    await recordFailedAttempt(saId, groupId, memberId);
    const message =
      result.errorKind === "invalid-credentials"
        ? "We couldn't sign in to Skool with those credentials."
        : result.errorKind === "not-found-or-inaccessible"
          ? "This Skool account doesn't appear to have access to that community."
          : "We couldn't connect to Skool right now. Please try again.";
    const status = result.errorKind === "not-found-or-inaccessible" ? 403 : 401;
    return NextResponse.json({ error: result.errorKind ?? "browser-failure", message }, { status });
  }

  await clearRateLimit(saId, groupId, memberId);

  const session = await createImportSession({
    subAccountId: saId,
    groupId,
    createdByMemberId: memberId,
    skoolGroupSlug: urlResult.slug,
    skoolCommunityName: result.communityName,
    cookies: result.cookies,
  });

  return NextResponse.json({
    ok: true,
    importSessionId: session.id,
    skoolCommunityName: session.skoolCommunityName,
  });
}
