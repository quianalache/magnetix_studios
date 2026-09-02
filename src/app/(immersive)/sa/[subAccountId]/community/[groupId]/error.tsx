"use client";

import { useEffect } from "react";
import { ListPageErrorFallback } from "@/components/dashboard/list-page-error-fallback";

/**
 * Next.js route-segment error boundary for CRM Community's detail routes
 * (feed, classroom, settings, etc.). Before the 2026-09-02 full-page move
 * to `(immersive)`, these were covered by `(dashboard)/sa/[subAccountId]/
 * community/error.tsx` cascading down from the list route's own segment —
 * that cascade breaks once this subtree moves to a sibling route group
 * (error boundaries follow the file tree, same as layouts), so this is a
 * direct copy of that same boundary, not a new one.
 */
export default function CommunityDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Community detail page error:", error);
  }, [error]);

  return <ListPageErrorFallback label="Community" reset={reset} />;
}
