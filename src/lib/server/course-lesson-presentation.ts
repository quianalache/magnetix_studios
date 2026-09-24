import "server-only";

import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";
import type { VideoOwnerScope } from "@/types/media-asset";
import type { StandaloneLesson } from "@/types/standalone-courses";

/** Canonical server-side projection for every Standalone lesson surface. */
export async function presentStandaloneLesson(
  lesson: StandaloneLesson,
  scope: VideoOwnerScope,
) {
  const hostedUrl = lesson.hostedVideoId
    ? await getBunnyPlaybackUrl(scope, lesson.hostedVideoId)
    : null;
  return {
    id: lesson.id,
    title: lesson.title,
    order: lesson.order,
    sectionId: lesson.sectionId,
    embedUrl: lesson.hostedVideoId ? hostedUrl : embedUrlFor(lesson.videoProvider, lesson.videoId),
    body: renderLessonBodyHtml(lesson.bodyHtml),
    resourceLinks: lesson.resourceLinks ?? [],
  };
}
