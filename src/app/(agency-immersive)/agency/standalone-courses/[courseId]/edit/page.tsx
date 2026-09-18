"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CourseWizard } from "@/components/standalone-courses/course-wizard";
import type { StandaloneCourse } from "@/types/standalone-courses";

/** Agency Standalone Course editing — same shared CourseWizard as
 *  .../new, seeded with the existing course's data. */
export default function EditAgencyCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();
  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/standalone-courses/${courseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { course?: StandaloneCourse } | null) => {
        setCourse(d?.course ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [isOwner, courseId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Standalone Courses is managed by the agency owner.
      </div>
    );
  }
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
      subAccountId=""
      agencyScope
      mode="edit"
      course={course}
      cancelHref={`/agency/standalone-courses/${courseId}`}
      onDone={() => router.push(`/agency/standalone-courses/${courseId}`)}
    />
  );
}
