import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { listClassroomCatalogForMember } from "@/lib/server/classroom-catalog-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { PurchaseButton } from "@/components/community/purchase-button";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — Classroom catalog (the real member-facing "watch
 * courses" experience, not the course/lesson authoring tool — that moved to
 * `/classroom-builder`, linked from the Manage page). Close mirror of
 * /c/[saId]/[groupSlug]/classroom/page.tsx — see the Staff Community
 * Integration report. Both routes call the same
 * `listClassroomCatalogForMember` for the native+linked-Standalone-Product
 * union, so staff and member Classroom can never drift on which courses
 * appear or how they're gated — see classroom-catalog-service.ts.
 */
export default async function StaffClassroomCatalogPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/classroom`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  // Theme parity (2026-08-29 closeout) — same shared resolver as Community
  // Home; see that page's identical comment for the full rationale.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const courses = await listClassroomCatalogForMember({
    linkBase: { saId, pretty: false, staffGroupId: groupId },
    groupId: group.id,
    groupSlug: group.slug,
    memberId: member.id,
    membership,
  });

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
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
                <CourseThumb
                  thumbnailUrl={c.thumbnailUrl}
                  title={c.title}
                  brand={brand}
                  accent={resolvedTheme.accent}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-[#202124]">{c.title}</h3>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.source === "standalone" && (
                        <span className="rounded-full bg-[#F0F0F0] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#6B6875] uppercase">
                          Linked Product
                        </span>
                      )}
                      {c.locked && <Lock className="h-3 w-3 text-[#909090]" />}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#909090]">
                    {c.description || `${c.lessonCount} lessons`}
                  </p>
                  {c.locked ? (
                    c.source === "native" && c.locked.purchasable ? (
                      <div className="mt-3">
                        <PurchaseButton
                          endpoint={`/api/community/${saId}/${group.id}/purchase`}
                          body={{ scope: "course", targetId: c.id }}
                          label={c.locked.reason}
                          brand={resolvedTheme.primaryAction}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-medium text-[#909090]">
                        {c.locked.reason}
                      </p>
                    )
                  ) : (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.progressPct}%`,
                            backgroundColor: brand,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-[#909090]">
                        {c.progressPct}% complete
                      </p>
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
