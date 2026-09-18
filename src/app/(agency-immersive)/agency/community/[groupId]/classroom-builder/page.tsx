"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import { CourseSettingsModal } from "@/components/community/classroom/course-settings-modal";
import type { Course } from "@/types/community";

const PLACEHOLDER_BRAND = "#f59e0b";

/**
 * Agency Community Classroom builder — owner-only. Reuses the exact
 * tenant CourseSettingsModal/CourseThumb with agencyGroupId set. Unlike
 * the tenant builder (realtime Firestore subscriptions — staff are
 * Firebase users with rules-permitted reads), this uses client-fetch
 * against the agency courses API, matching every other agency owner
 * settings surface built this pass (Branding, Points & Rewards, Members,
 * About) — see agency-community-classroom-service.ts's module comment.
 */
export default function AgencyClassroomBuilderPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function refresh() {
    void fetch(`/api/agency/community/${groupId}/courses`)
      .then((r) => r.json())
      .then((d: { courses?: Course[] }) => {
        setCourses(d.courses ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    if (isOwner) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/agency/community/${groupId}/classroom`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Classroom
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="h-6 w-6" /> Classroom builder
        </h1>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/agency/community/${groupId}/classroom-builder/${c.id}`}
              className="overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-sm"
            >
              <div className="relative">
                <CourseThumb thumbnailUrl={c.thumbnailUrl} title={c.title} brand={PLACEHOLDER_BRAND} />
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90">
                  {c.published ? "Published" : "Draft"}
                </span>
              </div>
              <div className="p-4">
                <span className="font-medium">{c.title}</span>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description || "No description yet."}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.access === "open" ? "Open" : c.access === "level" ? `Unlocks at Level ${c.requiredLevel ?? 2}` : "One-time purchase"}
                </p>
              </div>
            </Link>
          ))}

          <button
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-5 w-5" /> New course
          </button>
        </div>
      )}

      <CourseSettingsModal
        mode="create"
        saId=""
        groupId={groupId}
        agencyGroupId={groupId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(id) => router.push(`/agency/community/${groupId}/classroom-builder/${id}`)}
      />
    </div>
  );
}
