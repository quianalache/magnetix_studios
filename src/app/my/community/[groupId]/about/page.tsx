import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId, resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { CommunityShell } from "@/components/community/community-shell";
import { AgencyAboutView } from "@/components/community/agency-about-view";

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
      <AgencyAboutView
        link={{ saId: "", pretty: false, agencyGroupId: groupId, agencyMemberView: true }}
        group={group}
        brandName={brandName}
        isModerator={false}
      />
    </CommunityShell>
  );
}
