import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  personHasStaffAccess,
  personHasMemberRelationships,
} from "@/lib/server/person-identity-service";
import { resolvePersonDisplayName, listPersonMemberships } from "@/lib/server/mymagnetix-service";

export const dynamic = "force-dynamic";

/**
 * Dual-role gateway — the ONE place role-aware routing decisions get made,
 * right after a successful global MyMagnetix authentication (see
 * /api/my/login, /api/my/login/verify, /api/my/password/reset, all of
 * which redirect here rather than straight to /my).
 *
 * Routing, per the approved product model:
 *   Member-only  -> /my directly
 *   Staff-only   -> nothing to show in MyMagnetix; send them to the real
 *                   staff login instead (a MyMagnetix login for a
 *                   staff-only identity is an edge case, not the norm —
 *                   staff normally never visit /my/login at all)
 *   Both         -> this page renders the chooser
 *
 * This never merges the two authorization systems: staff access here is
 * detected read-only via personHasStaffAccess, never granted or assumed
 * from the mm_session itself.
 */
export default async function MyMagnetixGatewayPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const [hasStaff, hasMember, memberships] = await Promise.all([
    personHasStaffAccess(person.id),
    personHasMemberRelationships(person.id),
    listPersonMemberships(person.id),
  ]);

  if (!hasMember) {
    // Nothing for MyMagnetix to show this identity. If they also have no
    // staff access either, there's genuinely nothing here for them yet.
    redirect(hasStaff ? "/login" : "/my/login?error=no_access");
  }

  if (!hasStaff) redirect("/my");

  const displayName = await resolvePersonDisplayName(person.id, person.primaryEmail, memberships);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-2xl font-semibold text-[#202124]">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 text-sm text-[#909090]">Where would you like to go?</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login?redirect=/dashboard"
            className="rounded-[9px] border border-[#E4E4E4] bg-white px-4 py-3 text-sm font-semibold text-[#202124] transition-colors hover:border-[#5E2574]"
          >
            Business Center
          </Link>
          <Link
            href="/my"
            className="rounded-[9px] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#5E2574" }}
          >
            MyMagnetix
          </Link>
        </div>
      </div>
    </div>
  );
}
