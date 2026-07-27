"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { subscribeToStandaloneCourse } from "@/lib/firestore/standalone-courses";
import { OffersList } from "@/components/course-offers/offers-list";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * A single course's "Offers" tab — which Course Offers bundle this course,
 * reusing the exact same `OffersList` table/filters/Create-Offer flow as the
 * top-level Offers tab, just scoped via `courseId` so it only shows offers
 * that include this course (and pre-selects it when creating a new one).
 */
export default function CourseOffersPage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { subAccountId, courseId } = use(params);
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
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Link
          href={`/sa/${subAccountId}/courses/${courseId}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">{course.title}</h1>
      </div>
      <OffersList subAccountId={subAccountId} courseId={courseId} />
    </div>
  );
}
