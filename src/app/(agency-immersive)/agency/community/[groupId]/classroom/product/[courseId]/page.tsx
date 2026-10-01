"use client";

import { use, useEffect, useState } from "react";
import { CommunityShell } from "@/components/community/community-shell";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";
import { useAuth } from "@/hooks/use-auth";
import type { CommunityGroup } from "@/types/community";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { PlayerLesson, PlayerSection } from "@/components/standalone-courses/standalone-lesson-player";

interface ResponseShape {
  course: StandaloneCourse;
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  completedIds: string[];
}

export default function AgencyEmbeddedProductCoursePage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string }>;
}) {
  const { groupId, courseId } = use(params);
  const { agencyRole, loading } = useAuth();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [data, setData] = useState<ResponseShape | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (agencyRole !== "owner") return;
    void Promise.all([
      fetch(`/api/agency/community/${groupId}`).then((r) => r.json() as Promise<{ group: CommunityGroup }>),
      fetch(`/api/agency/community/${groupId}/courses/product/${courseId}/player`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<ResponseShape>;
      }),
    ]).then(([groupResponse, player]) => {
      setGroup(groupResponse.group);
      setData(player);
    }).catch(() => setFailed(true));
  }, [agencyRole, groupId, courseId]);

  if (loading) return null;
  if (agencyRole !== "owner") return <div className="p-8 text-center text-sm">Community is managed by the agency owner.</div>;
  if (failed) return <div className="p-8 text-center text-sm">Course not found.</div>;
  if (!group || !data) return <div className="p-8" />;
  const homeHref = `/agency/community/${groupId}/classroom/product/${courseId}`;
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
      <CourseHomeView
        saId="agency"
        courseId={courseId}
        course={data.course}
        theme={data.course.theme}
        sections={data.sections}
        lessons={data.lessons}
        member={{ email: "owner", displayName: "Owner" }}
        completedLessonIds={data.completedIds}
        crossSellTargets={new Map()}
        homeHref={homeHref}
      />
    </CommunityShell>
  );
}
