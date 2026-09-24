"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeToStandaloneSections,
  subscribeToStandaloneLessons,
} from "@/lib/firestore/standalone-courses";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";
import {
  StandaloneLessonPlayer,
  type PlayerSection,
  type PlayerLesson,
} from "@/components/standalone-courses/standalone-lesson-player";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";
import { embedUrlFor } from "@/lib/community/video-embed";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
} from "@/types/standalone-courses";
import type { CourseOffer } from "@/types/course-offers";
import type { CourseTheme, LessonTheme } from "@/types/course-theme";
import type { Member } from "@/types/community";

/** A fake "already enrolled" member for the preview pane only — `CourseHomeView`
 *  (the "Product" page) is always viewed by someone with access, so it always
 *  needs a member, unlike the old sales-page preview which showed the
 *  signed-out state. Never persisted or fetched. */
const PREVIEW_MEMBER: Member = {
  id: "preview",
  subAccountId: "preview",
  agencyId: "preview",
  email: "preview@example.com",
  displayName: "Preview",
  avatarUrl: null,
  bio: "",
  phone: null,
  address: null,
  contactId: null,
  status: "active",
  createdAt: null,
  updatedAt: null,
  lastSeenAt: null,
};

/**
 * Live preview pane for the theme editor — renders the SAME
 * `CourseHomeView` the real public page uses (the "Product" page, in
 * Quiana's terms — the enrolled member's curriculum/course-home hub, NOT
 * the pre-purchase pricing page, which is a separate, unrelated page not
 * covered by this "Product" tab at all), fed by the in-progress local
 * `theme` state instead of saved data, so edits show up instantly with no
 * save/reload round trip.
 */
export function ThemeLivePreview({
  saId,
  courseId,
  course,
  theme,
  lessonTheme,
  page,
  otherOffers,
}: {
  saId: string;
  courseId: string;
  course: StandaloneCourse;
  theme: CourseTheme;
  lessonTheme: LessonTheme;
  /** Which page the "Pages: Product / Lesson" switcher currently has
   *  selected — Product renders `CourseHomeView`, Lesson renders
   *  `StandaloneLessonPlayer` against the course's first lesson (or an
   *  empty-state message if it has none yet). */
  page: "product" | "lesson";
  otherOffers: CourseOffer[];
}) {
  const [sections, setSections] = useState<StandaloneCourseSection[]>([]);
  const [lessons, setLessons] = useState<StandaloneLesson[]>([]);
  const [hostedUrls, setHostedUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    // Agency scope has no client-readable Firestore path for these (see
    // every other agency-owner surface's Admin-SDK-route convention), so
    // it fetches the same {course, sections, lessons} payload the course
    // editor itself loads instead of subscribing live — the preview still
    // reflects in-progress theme edits (via the `theme`/`lessonTheme`
    // props), just not concurrent section/lesson edits from elsewhere.
    if (saId === "agency") {
      let cancelled = false;
      fetch(`/api/agency/standalone-courses/${courseId}`)
        .then((r) => r.json())
        .then((d: { sections?: StandaloneCourseSection[]; lessons?: StandaloneLesson[] }) => {
          if (cancelled) return;
          setSections(d.sections ?? []);
          setLessons(d.lessons ?? []);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    const u1 = subscribeToStandaloneSections(saId, courseId, setSections);
    const u2 = subscribeToStandaloneLessons(saId, courseId, setLessons);
    return () => {
      u1();
      u2();
    };
  }, [saId, courseId]);

  useEffect(() => {
    let cancelled = false;
    const hosted = lessons.filter((lesson) => lesson.hostedVideoId);
    if (hosted.length === 0) {
      setHostedUrls({});
      return () => {
        cancelled = true;
      };
    }
    const endpoint = saId === "agency"
      ? `/api/agency/standalone-courses/${courseId}/preview-video`
      : `/api/sub-accounts/${saId}/standalone-courses/${courseId}/preview-video`;
    void Promise.all(hosted.map(async (lesson) => {
      try {
        const response = await fetch(`${endpoint}?lessonId=${encodeURIComponent(lesson.id)}`);
        const data = response.ok ? (await response.json() as { embedUrl?: string | null }) : {};
        return [lesson.id, data.embedUrl ?? null] as const;
      } catch {
        return [lesson.id, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setHostedUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [saId, courseId, lessons]);

  const crossSellTargets = useMemo(() => {
    const map = new Map<string, CrossSellTargetInfo>();
    for (const o of otherOffers) {
      map.set(o.id, {
        id: o.id,
        title: o.title,
        priceCents: o.priceCents,
        currency: o.currency,
        type: o.type,
        visibility: o.visibility,
      });
    }
    return map;
  }, [otherOffers]);

  if (page === "lesson") {
    const playerSections: PlayerSection[] = [...sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.id, title: s.title }));
    const sectionIds = new Set(playerSections.map((s) => s.id));
    const playerLessons: PlayerLesson[] = [...lessons]
      .filter((l) => l.published)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        id: l.id,
        title: l.title,
        // Lessons whose sectionId doesn't resolve to a real section are
        // grouped as "other", same rule `StandaloneLessonPlayer` itself uses.
        sectionId: l.sectionId && sectionIds.has(l.sectionId) ? l.sectionId : null,
        embedUrl: l.hostedVideoId
          ? hostedUrls[l.id] ?? null
          : embedUrlFor(l.videoProvider, l.videoId),
        body: lessonBodyToEditorHtml(l.bodyHtml),
        resourceLinks: l.resourceLinks ?? [],
      }));

    if (playerLessons.length === 0) {
      return (
        <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
          Add a lesson to this course to preview the Lesson page.
        </div>
      );
    }

    return (
      <StandaloneLessonPlayer
        completeEndpoint="#"
        lessonHrefBase="#"
        homeHref="#"
        saId={saId}
        lessonTheme={lessonTheme}
        courseTitle={course.title}
        courseCoverUrl={course.coverUrl}
        instructor={course.instructor}
        crossSellTargets={crossSellTargets}
        sections={playerSections}
        lessons={playerLessons}
        currentLessonId={playerLessons[0].id}
        completedIds={[]}
        interactive={false}
      />
    );
  }

  return (
    <CourseHomeView
      saId={saId}
      courseId={courseId}
      course={course}
      theme={theme}
      sections={sections}
      lessons={lessons}
      member={PREVIEW_MEMBER}
      completedLessonIds={[]}
      crossSellTargets={crossSellTargets}
      interactive={false}
    />
  );
}
