import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import {
  getAgencyCourseTree,
  getAgencyEnrollment,
} from "@/lib/server/agency-community-classroom-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { LessonPlayer, type PlayerLesson, type PlayerSection } from "@/components/community/classroom/lesson-player";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — lesson player. Mirrors
 *  /c/[saId]/[groupSlug]/classroom/[courseId]/[lessonId]/page.tsx. */
export default async function MyAgencyLessonPlayerPage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string; lessonId: string }>;
}) {
  const { groupId, courseId, lessonId } = await params;
  const catalog = `/my/community/${groupId}/classroom`;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`${catalog}/${courseId}/${lessonId}`)}`);

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

  const tree = await getAgencyCourseTree({ agencyId, groupId, courseId, includeUnpublished: false });
  if (!tree || !tree.course.published) redirect(catalog);

  const course = tree.course;
  const viewerLevel = membership.level ?? 1;
  if (course.access === "level" && viewerLevel < (course.requiredLevel ?? 2)) redirect(catalog);
  if (course.access === "purchase") redirect(catalog);

  if (!tree.lessons.some((l) => l.id === lessonId)) {
    const first = tree.lessons[0];
    if (!first) redirect(catalog);
    redirect(`${catalog}/${courseId}/${first.id}`);
  }

  const enrollment = await getAgencyEnrollment(agencyId, groupId, courseId, person.id);
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer = { memberId: membership.id, displayName: agencyMemberDisplayName(membership), avatarUrl: null, level: viewerLevel };

  const sections: PlayerSection[] = tree.sections.map((s) => ({ id: s.id, title: s.title }));
  const lessons: PlayerLesson[] = tree.lessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));

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
      <Link href={catalog} className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]">
        <ArrowLeft className="h-4 w-4" /> {course.title}
      </Link>
      <LessonPlayer
        completeEndpoint={`/api/agency/community/${groupId}/courses/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={`${catalog}/${courseId}`}
        brand={brand}
        primaryAction={resolvedTheme.primaryAction}
        accent={resolvedTheme.accent}
        sections={sections}
        lessons={lessons}
        currentLessonId={lessonId}
        completedIds={enrollment?.completedLessonIds ?? []}
      />
    </CommunityShell>
  );
}
