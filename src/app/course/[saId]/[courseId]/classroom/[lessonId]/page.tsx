import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCourseClassroomAccess } from "@/lib/standalone-courses/course-access";
import {
  getStandaloneCourseTree,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import {
  LessonPlayer,
  type PlayerLesson,
  type PlayerSection,
} from "@/components/community/classroom/lesson-player";

export const dynamic = "force-dynamic";

const DEFAULT_BRAND = "#202124";

export default async function StandaloneLessonPlayerPage({
  params,
}: {
  params: Promise<{ saId: string; courseId: string; lessonId: string }>;
}) {
  const { saId, courseId, lessonId } = await params;
  const access = await requireCourseClassroomAccess(saId, courseId);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { course, member } = access;
  const salesPage = `/course/${saId}/${courseId}`;

  const tree = await getStandaloneCourseTree({
    subAccountId: saId,
    courseId,
    includeUnpublished: false,
  });
  if (!tree || !tree.course.published) redirect(salesPage);

  if (!tree.lessons.some((l) => l.id === lessonId)) {
    const first = tree.lessons[0];
    if (!first) redirect(salesPage);
    redirect(`${salesPage}/classroom/${first.id}`);
  }

  const enrollment = await getStandaloneEnrollment(saId, courseId, member.id);

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
    <div className="min-h-screen bg-[#F8F7F5] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href={salesPage}
          className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
        >
          <ArrowLeft className="h-4 w-4" /> {course.title}
        </Link>
        <LessonPlayer
          completeEndpoint={`/api/course/${saId}/${courseId}/lessons/${lessonId}/complete`}
          lessonHref={(id) => `${salesPage}/classroom/${id}`}
          brand={DEFAULT_BRAND}
          sections={sections}
          lessons={lessons}
          currentLessonId={lessonId}
          completedIds={enrollment?.completedLessonIds ?? []}
        />
      </div>
    </div>
  );
}
