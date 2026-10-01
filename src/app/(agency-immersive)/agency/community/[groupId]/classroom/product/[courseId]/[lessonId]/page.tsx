"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell } from "@/components/community/community-shell";
import { StandaloneLessonPlayer, type PlayerLesson, type PlayerSection } from "@/components/standalone-courses/standalone-lesson-player";
import type { CourseTheme, LessonTheme } from "@/types/course-theme";
import type { StandaloneCourseInstructor } from "@/types/standalone-courses";
import type { CommunityGroup } from "@/types/community";

interface PlayerResponse {
  course: {
    id: string;
    title: string;
    coverUrl: string | null;
    instructor: StandaloneCourseInstructor;
    theme: CourseTheme;
    lessonTheme: LessonTheme;
  };
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  completedIds: string[];
}

/**
 * Agency Community Classroom — a linked Agency Standalone Course's lesson,
 * rendered inside this Community's shell. Owner view. Mirrors the native
 * lesson player page exactly; only the API base (`courses/product/...`)
 * and the "back" link's title differ — content/entitlement/progress all
 * stay on the Standalone Course itself (see the player route's own doc
 * comment).
 */
export default function AgencyEmbeddedProductLessonPage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string; lessonId: string }>;
}) {
  const { groupId, courseId, lessonId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [player, setPlayer] = useState<PlayerResponse | null>(null);
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
    void fetch(`/api/agency/community/${groupId}/courses/product/${courseId}/player`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: PlayerResponse) => setPlayer(d))
      .catch(() => setNotFound(true));
  }, [isOwner, groupId, courseId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (notFound) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Course not found.</div>;
  }
  if (!group || !player) return <div className="mx-auto max-w-7xl p-8" />;

  const catalog = `/agency/community/${groupId}/classroom`;
  const productHref = `${catalog}/product/${courseId}`;

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
      <Link href={catalog} className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]">
        <ArrowLeft className="h-4 w-4" /> {player.course.title}
      </Link>
      <StandaloneLessonPlayer
        completeEndpoint={`/api/agency/community/${groupId}/courses/product/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={productHref}
        homeHref={productHref}
        saId="agency"
        lessonTheme={player.course.lessonTheme}
        courseTitle={player.course.title}
        courseCoverUrl={player.course.coverUrl}
        instructor={player.course.instructor}
        crossSellTargets={new Map()}
        sections={player.sections}
        lessons={player.lessons}
        currentLessonId={lessonId}
        completedIds={player.completedIds}
      />
    </CommunityShell>
  );
}
