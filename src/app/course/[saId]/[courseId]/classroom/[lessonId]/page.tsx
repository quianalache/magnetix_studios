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
import { getInAppUpsellsForMember } from "@/lib/server/course-offer-upsell-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";

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

  // In-App Upsells (Course Offers feature) — published upsells targeting any
  // offer this member has purchased, shown as a locked "Buy Now" card.
  // Display-only; no new purchase mechanic beyond the offer checkout.
  const inAppUpsells = await getInAppUpsellsForMember(saId, member.id);
  const upsellTargets = (
    await Promise.all(
      inAppUpsells.map((u) => getCourseOffer(saId, u.targetOfferId)),
    )
  ).filter((o): o is NonNullable<typeof o> => !!o);

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
          lessonHrefBase={`${salesPage}/classroom`}
          brand={DEFAULT_BRAND}
          sections={sections}
          lessons={lessons}
          currentLessonId={lessonId}
          completedIds={enrollment?.completedLessonIds ?? []}
        />

        {upsellTargets.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#909090]">
              More for you
            </p>
            {upsellTargets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#E4E4E4] bg-white p-3"
              >
                <span className="text-sm font-medium text-[#202124]">
                  {target.title}
                </span>
                <a
                  href={`/offer/${saId}/${target.id}`}
                  className="shrink-0 rounded-md bg-[#202124] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Buy Now
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
