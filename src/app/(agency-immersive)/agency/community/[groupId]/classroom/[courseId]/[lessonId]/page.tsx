"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { LessonPlayer, type PlayerLesson, type PlayerSection } from "@/components/community/classroom/lesson-player";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { CommunityGroup, Course } from "@/types/community";

interface PlayerResponse {
  course: Course;
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  completedIds: string[];
}

/** Agency Community Classroom — lesson player. Owner view. Reuses the
 *  exact tenant LessonPlayer unchanged (already fully prop-driven). */
export default function AgencyLessonPlayerPage({
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
    void fetch(`/api/agency/community/${groupId}/courses/${courseId}/player`)
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

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const catalog = `/agency/community/${groupId}/classroom`;

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
      <LessonPlayer
        completeEndpoint={`/api/agency/community/${groupId}/courses/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={`${catalog}/${courseId}`}
        brand={brand}
        primaryAction={resolvedTheme.primaryAction}
        accent={resolvedTheme.accent}
        sections={player.sections}
        lessons={player.lessons}
        currentLessonId={lessonId}
        completedIds={player.completedIds}
      />
    </CommunityShell>
  );
}
