"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

/** Course index — redirect to the first published lesson, or back to the
 *  catalog when the course is empty/locked. Mirrors the tenant course
 *  index page. */
export default function AgencyCourseIndexPage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string }>;
}) {
  const { groupId, courseId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();
  const catalog = `/agency/community/${groupId}/classroom`;

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}/courses/${courseId}/player`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lessons?: { id: string }[] } | null) => {
        const first = d?.lessons?.[0];
        router.replace(first ? `${catalog}/${courseId}/${first.id}` : catalog);
      })
      .catch(() => router.replace(catalog));
  }, [isOwner, groupId, courseId, catalog, router]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  return null;
}
