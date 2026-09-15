import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentPerson } from "@/lib/server/person-session";
import { getCurrentStaffUser } from "@/lib/auth/current-staff";
import {
  resolvePersonDisplayName,
  listPersonMemberships,
} from "@/lib/server/mymagnetix-service";
import { resolveStaffPersonId } from "@/lib/server/person-identity-service";
import { GatewayMyMagnetixButton } from "@/components/auth/gateway-mymagnetix-button";
import { MyMagnetixIdentityMismatch } from "@/components/auth/mymagnetix-identity-mismatch";

export const dynamic = "force-dynamic";

/**
 * Dual-role gateway — the ONE place role-aware routing decisions get made,
 * reached only AFTER a successful authentication (never shown to an
 * anonymous visitor — see /api/my/login, /api/my/login/verify,
 * /api/my/password/reset, all of which redirect here, and the neutral
 * LoginForm's own post-auth routing).
 *
 * 2026-09-01 correction: previously determined "has Business Center
 * access" via `personHasStaffAccess(personId)`, which only ever resolved
 * if a MyMagnetix Person/mm_session session already existed — a staff
 * identity with zero MyMagnetix relationships never gets an mm_session
 * minted at all (see /api/my/bridge-from-staff's own deliberate "nothing
 * to show them, no session minted" behavior), so it could never reach
 * this page and got silently bounced straight to /login instead, even
 * though the approved product model says ANY Business Center access
 * should land here and see the chooser. Now checks Business Center
 * access independently via `getCurrentStaffUser()` (the real __session,
 * the Business Center's OWN auth layer) rather than requiring it to be
 * inferred through the Person layer — the two systems stay genuinely
 * independent, combined only for this one routing decision, never
 * merged into a single credential.
 *
 * Routing, per the approved product model:
 *   Business Center access exists (regardless of MyMagnetix status)
 *     -> show the chooser below. Never skip it.
 *   No Business Center access, has MyMagnetix access
 *     -> /my directly (the one accepted shortcut)
 *   Neither
 *     -> the existing no-account state
 *
 * If a staff identity reaches here with no MyMagnetix session yet (the
 * common case — most staff never separately signed into MyMagnetix), the
 * MyMagnetix button below establishes one on click via the existing
 * staff->Person bridge instead of linking straight to a page that would
 * just bounce them to a login screen.
 *
 * Cross-identity session fix (2026-09-15 incident): when BOTH sessions
 * exist, the existing `mm_session` cookie is only sometimes the same
 * human as the current staff login (e.g. an old MyMagnetix session from
 * testing a different email, still sitting in the browser). Previously
 * this page always linked straight into /my, silently using whichever
 * Person happened to already be in the cookie — now it resolves which
 * Person the CURRENT staff login actually corresponds to
 * (resolveStaffPersonId) and compares; a mismatch shows an explicit
 * choice (MyMagnetixIdentityMismatch) instead of crossing over silently.
 * Neither session is ever destroyed just by detecting this — only the
 * person's own explicit choice does that.
 */
export default async function GatewayPage() {
  const [staffUser, person] = await Promise.all([
    getCurrentStaffUser(),
    getCurrentPerson(),
  ]);

  if (!staffUser && !person) {
    // This page is a post-auth destination, not an entry point — nobody
    // authenticated at all lands on the real neutral login instead.
    redirect("/login");
  }

  const memberships = person ? await listPersonMemberships(person.id) : [];
  const hasMember = memberships.length > 0;
  const hasStaff = !!staffUser;

  if (!hasStaff) {
    // No Business Center access at all.
    if (hasMember) redirect("/my");
    redirect("/my/login?error=no_access");
  }

  const displayName = person
    ? await resolvePersonDisplayName(
        person.id,
        person.primaryEmail,
        memberships
      )
    : staffUser!.email.split("@")[0] || "there";

  // Cross-identity session fix (2026-09-15 incident): an existing
  // `mm_session` cookie belongs to a real, specific Person — but that
  // Person is only sometimes the same human as the CRM staff identity
  // currently authenticated. Resolve which Person THIS staff login
  // actually corresponds to and compare, rather than trusting whichever
  // mm_session happens to already be in the browser. Only meaningful when
  // both sessions exist; a lone staff session has nothing to mismatch
  // against yet (handled by GatewayMyMagnetixButton's own bridge/prefill
  // path below).
  const staffPersonId = person
    ? await resolveStaffPersonId(staffUser!.uid, staffUser!.email)
    : null;
  const mismatched = !!person && !!staffPersonId && staffPersonId !== person.id;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-2xl font-semibold text-[#202124]">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Where would you like to go?
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login?redirect=/dashboard"
            className="rounded-[9px] border border-[#E4E4E4] bg-white px-4 py-3 text-sm font-semibold text-[#202124] transition-colors hover:border-[#5E2574]"
          >
            Business Center
          </Link>
          {mismatched ? (
            <MyMagnetixIdentityMismatch
              crmEmail={staffUser!.email}
              mymagnetixEmail={person!.primaryEmail}
            />
          ) : person ? (
            <Link
              href="/my"
              className="rounded-[9px] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#5E2574" }}
            >
              MyMagnetix
            </Link>
          ) : (
            <GatewayMyMagnetixButton staffEmail={staffUser!.email} />
          )}
        </div>
      </div>
    </div>
  );
}
