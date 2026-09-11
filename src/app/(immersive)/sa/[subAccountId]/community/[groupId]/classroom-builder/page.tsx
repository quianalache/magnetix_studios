"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Plus } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToCourses } from "@/lib/firestore/community-classroom";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import { CourseSettingsModal } from "@/components/community/classroom/course-settings-modal";
import type { Course } from "@/types/community";
import type { StandaloneCourse } from "@/types/standalone-courses";

const PLACEHOLDER_BRAND = "#f59e0b";

/**
 * Course/lesson authoring tool (create courses, drag-and-drop outline,
 * lesson editor). Moved here from `/classroom` (2026-08-24, Staff
 * Community-in-CRM integration) so the canonical `/classroom` route could
 * become the real member-facing classroom tab (watch courses as a member
 * would), same pattern as the pre-existing settings form moved to
 * `/manage`. Linked from the Manage page's "Manage classroom" action.
 */
export default function ClassroomBuilderPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { groupId } = use(params);
  const { subAccountId, isAdmin } = useSubAccount();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkedProducts, setLinkedProducts] = useState<StandaloneCourse[]>([]);

  useEffect(() => {
    return subscribeToCourses(
      subAccountId,
      groupId,
      (list) => {
        setCourses(list);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
  }, [subAccountId, groupId]);

  // Read-only awareness of linked Standalone Products (2026-09-11) — these
  // now appear in the real Classroom (see classroom-catalog-service.ts) but
  // are never authored here; reusing the existing Standalone Courses list
  // endpoint rather than adding a new one, filtered client-side to this
  // group's links.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/standalone-courses`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { courses?: StandaloneCourse[] } | null) => {
        if (cancelled || !data?.courses) return;
        setLinkedProducts(
          data.courses.filter((c) =>
            c.linkedCommunityGroupIds.includes(groupId)
          )
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [subAccountId, groupId]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/sa/${subAccountId}/community/${groupId}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Group settings
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="h-6 w-6" /> Classroom
        </h1>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/sa/${subAccountId}/community/${groupId}/classroom-builder/${c.id}`}
              className="bg-card overflow-hidden rounded-xl border transition-shadow hover:shadow-sm"
            >
              <div className="relative">
                <CourseThumb
                  thumbnailUrl={c.thumbnailUrl}
                  title={c.title}
                  brand={PLACEHOLDER_BRAND}
                />
                <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/90 uppercase">
                  {c.published ? "Published" : "Draft"}
                </span>
              </div>
              <div className="p-4">
                <span className="font-medium">{c.title}</span>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {c.description || "No description yet."}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {c.access === "open"
                    ? "Open"
                    : c.access === "level"
                      ? `Unlocks at Level ${c.requiredLevel ?? 2}`
                      : "One-time purchase"}
                </p>
              </div>
            </Link>
          ))}

          {isAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="text-muted-foreground hover:border-primary/40 hover:text-foreground flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
            >
              <Plus className="h-5 w-5" /> New course
            </button>
          )}
        </div>
      )}

      {linkedProducts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            Linked Products
          </h2>
          <p className="text-muted-foreground text-xs">
            Also visible in this Classroom, but authored in Courses → Products,
            not here — content, entitlement, and progress all stay on the
            product itself.
          </p>
          <div className="space-y-1.5">
            {linkedProducts.map((p) => (
              <Link
                key={p.id}
                href={`/sa/${subAccountId}/courses/${p.id}`}
                className="text-muted-foreground hover:text-foreground bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
              >
                <span>{p.title}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <CourseSettingsModal
        mode="create"
        saId={subAccountId}
        groupId={groupId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(id) =>
          router.push(
            `/sa/${subAccountId}/community/${groupId}/classroom-builder/${id}`
          )
        }
      />
    </div>
  );
}
