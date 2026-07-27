"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { subscribeToStandaloneCourse } from "@/lib/firestore/standalone-courses";
import { CourseWizard } from "@/components/standalone-courses/course-wizard";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * Course-editing entry point — same shared `CourseWizard` as
 * `courses/new`, seeded with the existing course's data. Replaces the old
 * `StandaloneCourseSettingsModal` "edit" mode.
 */
export default function EditCoursePage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { subAccountId, courseId } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(
    () =>
      subscribeToStandaloneCourse(subAccountId, courseId, (c) => {
        setCourse(c);
        setLoaded(true);
      }),
    [subAccountId, courseId],
  );

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  return (
    <CourseWizard
      subAccountId={subAccountId}
      mode="edit"
      course={course}
      cancelHref={`/sa/${subAccountId}/courses/${courseId}`}
      onDone={() => router.push(`/sa/${subAccountId}/courses/${courseId}`)}
    />
  );
}
