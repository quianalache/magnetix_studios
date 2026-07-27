"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { CourseWizard } from "@/components/standalone-courses/course-wizard";

/**
 * Course-creation entry point — thin wrapper around the shared
 * `CourseWizard` (also used by `courses/[courseId]/edit`). See that
 * component for the actual 3-step layout.
 */
export default function NewCoursePage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = use(params);
  const router = useRouter();

  return (
    <CourseWizard
      subAccountId={subAccountId}
      mode="create"
      cancelHref={`/sa/${subAccountId}/courses`}
      onDone={(courseId) => router.push(`/sa/${subAccountId}/courses/${courseId}`)}
    />
  );
}
