import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  communityLearningCourseHref,
  communityLearningHref,
} from "@/lib/community/routes";
import {
  getCourseTree,
  getEnrollment,
} from "@/lib/server/community-classroom-service";
import { hasPaidCourse } from "@/lib/server/community-purchase-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  LessonPlayer,
  type PlayerLesson,
  type PlayerSection,
} from "@/components/community/classroom/lesson-player";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { AuthorView } from "@/types/community";
import { listCoursePageEmbeddedPosts } from "@/lib/server/community-course-pins-service";
import { communityPostHref } from "@/lib/community/routes";
import { CoursePagePinnedPost } from "@/components/community/feed/course-page-pinned-post";

export const dynamic = "force-dynamic";

/** Staff Community-in-CRM — lesson player. Close mirror of
 *  /c/[saId]/[groupSlug]/classroom/[courseId]/[lessonId]/page.tsx — see the
 *  Staff Community Integration report. */
export default async function StaffLessonPlayerPage({
  params,
}: {
  params: Promise<{
    subAccountId: string;
    groupId: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { subAccountId: saId, groupId, courseId, lessonId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/classroom/${courseId}/${lessonId}`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const linkBase = { saId, pretty: false, staffGroupId: groupId };
  const { group, member, membership } = access;
  const catalog = communityLearningHref(linkBase, group.slug);

  const tree = await getCourseTree({
    subAccountId: saId,
    groupId: group.id,
    courseId,
    includeUnpublished: false,
  });
  if (!tree || !tree.course.published) redirect(catalog);

  // Enforce access locks server-side (level + purchase). Open courses pass.
  const course = tree.course;
  if (course.access === "level") {
    if (membership.level < (course.requiredLevel ?? 2)) redirect(catalog);
  } else if (course.access === "purchase") {
    const paid = await hasPaidCourse(saId, group.id, courseId, member.id);
    if (!paid) redirect(catalog);
  }

  if (!tree.lessons.some((l) => l.id === lessonId)) {
    const first = tree.lessons[0];
    if (!first) redirect(catalog);
    redirect(`${catalog}/${courseId}/${first.id}`);
  }

  const enrollment = await getEnrollment(saId, group.id, courseId, member.id);
  // "Pin to Course Page" staff-side parity (2026-09-03) — same pin
  // relationship and canonical Community Post the member lesson page
  // renders; see community-course-pins-service.ts.
  const pinnedPosts = await listCoursePageEmbeddedPosts({
    subAccountId: saId,
    groupId: group.id,
    courseId,
    lessonId,
    viewerMemberId: member.id,
  });

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

  const sections: PlayerSection[] = tree.sections.map((s) => ({
    id: s.id,
    title: s.title,
  }));
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
      saId={saId}
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
      embedded={false}
    >
      <Link
        href={catalog}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> {course.title}
      </Link>
      <LessonPlayer
        completeEndpoint={`/api/community/${saId}/${group.id}/courses/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={communityLearningCourseHref(
          linkBase,
          group.slug,
          courseId
        )}
        brand={brand}
        primaryAction={resolvedTheme.primaryAction}
        accent={resolvedTheme.accent}
        sections={sections}
        lessons={lessons}
        currentLessonId={lessonId}
        completedIds={enrollment?.completedLessonIds ?? []}
      />
      {/* Pinned Community Post(s) staff parity (2026-09-03) — same
          placement as the member lesson page: below the player, never
          inside it, so it can't obscure the lesson content itself.
          canManage mirrors the member page's own moderator-only gate. */}
      {pinnedPosts.length > 0 && (
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3">
          {pinnedPosts.map((p) => (
            <CoursePagePinnedPost
              key={p.pinId}
              saId={saId}
              groupId={group.id}
              postId={p.postId}
              pinId={p.pinId}
              post={p}
              detailHref={communityPostHref(linkBase, group.slug, p.postId)}
              brand={brand}
              canManage={membership.role === "moderator"}
              staffGroupId={groupId}
              groupSlug={group.slug}
            />
          ))}
        </div>
      )}
    </CommunityShell>
  );
}
