"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { CommunityGroup } from "@/types/community";
import type { AgencyClassroomCourseCard } from "@/lib/server/agency-community-classroom-service";

/** Agency Community Classroom catalog — owner view (the real "watch
 *  courses" experience, not the authoring tool — that's the separate
 *  Classroom builder, linked below). Reuses the exact tenant CourseThumb
 *  and catalog card layout. */
export default function AgencyClassroomCatalogPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [courses, setCourses] = useState<AgencyClassroomCourseCard[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group: CommunityGroup }) => setGroup(d.group))
      .catch(() => setNotFound(true));
    void fetch(`/api/agency/community/${groupId}/courses/catalog`)
      .then((r) => r.json())
      .then((d: { courses?: AgencyClassroomCourseCard[] }) => setCourses(d.courses ?? []))
      .catch(() => setCourses([]));
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (notFound) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }
  if (!group || !courses) return <div className="mx-auto max-w-7xl p-8" />;

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="classroom"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <div className="mb-4 flex justify-end">
        <Link
          href={`/agency/community/${groupId}/classroom-builder`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E4E4E4] bg-white px-3 py-1.5 text-xs font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
        >
          <Settings2 className="h-3.5 w-3.5" /> Manage Classroom
        </Link>
      </div>

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
