import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId, resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/**
 * Real Agency Community member access — About. Carries the required
 * "presented by {agency brand}" attribution (section 3 of the task):
 * always the resolved AGENCY brand name (`resolveBrandName`, backed by
 * `AgencyDoc.name`), never a sub-account's name and never the owner's
 * personal identity.
 */
export default async function MyAgencyCommunityAboutPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/about`)}`);
  }

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community not found.
      </div>
    );
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const brandName = await resolveBrandName();
  const resolvedTheme = resolveCommunityTheme(group);
  const viewer = {
    memberId: person.id,
    displayName: agencyMemberDisplayName(membership),
    avatarUrl: null,
    level: 1,
  };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="about"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/my/community/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          style={{ color: resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to community
        </Link>

        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-bold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Presented by {brandName}
          </p>
          {group.about ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {group.about}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No description yet.</p>
          )}
        </div>
      </div>
    </CommunityShell>
  );
}
