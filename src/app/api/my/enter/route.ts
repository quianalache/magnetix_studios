import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentPerson } from "@/lib/server/person-session";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import type { Member } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * The MyMagnetix -> tenant-experience SSO bridge. Every "Enter" click on a
 * Space/Course/Community card in MyMagnetix Home routes through here first
 * rather than linking straight into `/portal`, `/c/...`, `/course/...`,
 * because those surfaces gate on a tenant-scoped `ls_member_session`
 * cookie (see getCurrentMember), which a global `mm_session` is NOT — by
 * design, per the "global session identifies who, tenant checks decide
 * what" boundary.
 *
 * Security: this route does NOT trust the caller's claim that a
 * relationship exists. It re-derives it server-side from the current
 * `mm_session`'s personId, independently looking up the real
 * `subAccounts/{subAccountId}/members` doc whose `personId` field matches.
 * Only if that real doc exists does it mint a session token — and it mints
 * EXACTLY the credential that sub-account's own login flow would mint for
 * that Member (same signMemberSessionToken call, same cookie), nothing
 * broader. A Business A operator cannot use this route to read Business
 * B's data: there is no path here that skips the personId match, and a
 * mismatched/absent relationship 404s before any cookie is set.
 *
 * `next` is a same-origin relative path to land on after the cookie is
 * set (e.g. a specific course or community URL) — validated to be a plain
 * path, not because it's a security boundary itself (every destination
 * page re-checks its own tenant scope via getCurrentMember regardless),
 * but to rule out open-redirect abuse of this endpoint.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const subAccountId = url.searchParams.get("subAccountId");
  const nextParam = url.searchParams.get("next");

  if (!subAccountId) {
    return NextResponse.json({ error: "Missing subAccountId" }, { status: 400 });
  }
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : `/portal/${subAccountId}`;

  const person = await getCurrentPerson();
  if (!person) {
    // First-time-access loop fix: preserve THIS ENTIRE bridge URL (not just
    // `next`) as the destination to resume once signed in — re-entering
    // here after auth re-runs the exact same real relationship/entitlement
    // check below, nothing is granted early. Without this, an unauthenticated
    // click on a deep link (e.g. a transactional notification email's "View
    // in MyMagnetix") silently lost its destination and dumped the person
    // on the generic login screen with no way back to what they clicked.
    const loginUrl = new URL("/my/login", url);
    loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const memberSnap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/members`)
    .where("personId", "==", person.id)
    .limit(1)
    .get();
  if (memberSnap.empty) {
    return NextResponse.json({ error: "No relationship with this business" }, { status: 404 });
  }
  const doc = memberSnap.docs[0];
  const member = { id: doc.id, ...(doc.data() as Omit<Member, "id">) };
  if (member.status !== "active") {
    return NextResponse.json({ error: "This relationship is no longer active" }, { status: 403 });
  }

  const sessionToken = signMemberSessionToken(subAccountId, member.id, member.email);
  await setMemberSessionCookie(sessionToken);

  return NextResponse.redirect(new URL(next, url));
}
