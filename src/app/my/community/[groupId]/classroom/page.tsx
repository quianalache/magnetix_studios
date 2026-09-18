import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { listAgencyClassroomCatalogForMember } from "@/lib/server/agency-community-classroom-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — Classroom catalog. Mirrors
 *  /c/[saId]/[groupSlug]/classroom/page.tsx. */
export default async function MyAgencyClassroomCatalogPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/classroom`)}`);

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
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

  const linkBase = { saId: "", pretty: false, agencyGroupId: groupId, agencyMemberView: true };
  const courses = await listAgencyClassroomCatalogForMember({
    linkBase,
    groupId,
    groupSlug: group.slug,
    personId: person.id,
    viewerLevel: membership.level ?? 1,
  });

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer = { memberId: membership.id, displayName: agencyMemberDisplayName(membership), avatarUrl: null, level: membership.level ?? 1 };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          No courses yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const card = (
              <div className="overflow-hidden rounded-xl border border-[#E4E4E4] bg-white transition-shadow hover:shadow-sm">
                <CourseThumb thumbnailUrl={c.thumbnailUrl} title={c.title} brand={brand} accent={resolvedTheme.accent} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-[#202124]">{c.title}</h3>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.source === "standalone" && (
                        <span className="rounded-full bg-[#F0F0F0] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#6B6875]">
                          Linked Product
                        </span>
                      )}
                      {c.locked && <Lock className="h-3 w-3 text-[#909090]" />}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#909090]">{c.description || `${c.lessonCount} lessons`}</p>
                  {c.locked ? (
                    <p className="mt-3 text-xs font-medium text-[#909090]">{c.locked.reason}</p>
                  ) : (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                        <div className="h-full rounded-full" style={{ width: `${c.progressPct}%`, backgroundColor: brand }} />
                      </div>
                      <p className="mt-1 text-xs text-[#909090]">{c.progressPct}% complete</p>
                    </div>
                  )}
                </div>
              </div>
            );
            return c.href ? (
              <Link key={c.id} href={c.href}>
                {card}
              </Link>
            ) : (
              <div key={c.id} className="cursor-default opacity-80">
                {card}
              </div>
            );
          })}
        </div>
      )}
    </CommunityShell>
  );
}
