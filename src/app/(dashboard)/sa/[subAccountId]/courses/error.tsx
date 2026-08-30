"use client";

import { useEffect } from "react";
import { ListPageErrorFallback } from "@/components/dashboard/list-page-error-fallback";

/**
 * Next.js route-segment error boundary for the Courses list page
 * (2026-08-30 launch-hardening) — see `ListPageErrorFallback`'s own doc
 * comment for why this exists and what it's actually catching. Scoped to
 * this one route; not a generic app-wide catch-all.
 */
export default function CoursesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Courses list page error:", error);
  }, [error]);

  return <ListPageErrorFallback label="Courses" reset={reset} />;
}
