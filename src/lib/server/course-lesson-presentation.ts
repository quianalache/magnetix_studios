import "server-only";

import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";
import { applyLessonVideoAutoplay } from "@/lib/standalone-courses/lesson-video";
import type { VideoOwnerScope } from "@/types/media-asset";
import type {
  StandaloneCourseLearningExperience,
  StandaloneLesson,
} from "@/types/standalone-courses";

/** Canonical server-side projection for every Standalone lesson surface. */
export async function presentStandaloneLesson(
  lesson: StandaloneLesson,
  scope: VideoOwnerScope,
  learningExperience?: Pick<StandaloneCourseLearningExperience, "autoplayLessonVideos"> | null,
) {
  const rawUrl = lesson.hostedVideoId
    ? await getBunnyPlaybackUrl(scope, lesson.hostedVideoId)
    : embedUrlFor(lesson.videoProvider, lesson.videoId);
  return {
    id: lesson.id,
    title: lesson.title,
    order: lesson.order,
    sectionId: lesson.sectionId,
    embedUrl: rawUrl
      ? applyLessonVideoAutoplay(rawUrl, learningExperience?.autoplayLessonVideos === true)
      : null,
    body: renderLessonBodyHtml(lesson.bodyHtml),
    resourceLinks: lesson.resourceLinks ?? [],
  };
}
