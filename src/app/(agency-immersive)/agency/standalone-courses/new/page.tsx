"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CourseWizard } from "@/components/standalone-courses/course-wizard";

/** Agency Standalone Course creation — thin wrapper around the shared
 *  CourseWizard, mirroring /sa/[subAccountId]/courses/new/page.tsx. */
export default function NewAgencyCoursePage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Standalone Courses is managed by the agency owner.
      </div>
    );
  }

  return (
    <CourseWizard
      subAccountId=""
      agencyScope
      mode="create"
      cancelHref="/agency/standalone-courses"
      onDone={(courseId) => router.push(`/agency/standalone-courses/${courseId}`)}
    />
  );
}
