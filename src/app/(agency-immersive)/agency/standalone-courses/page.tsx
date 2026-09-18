"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ExternalLink, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { StandaloneCourse } from "@/types/standalone-courses";

/** Agency Standalone Courses — owner list + create. Mirrors
 *  /sa/[subAccountId]/courses/page.tsx's "Products" tab; Course Offers
 *  (bundling) now lives at its own /agency/course-offers page. */
export default function AgencyStandaloneCoursesPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [courses, setCourses] = useState<StandaloneCourse[] | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/standalone-courses`)
      .then((r) => r.json())
      .then((d: { courses?: StandaloneCourse[] }) => setCourses((d.courses ?? []).sort((a, b) => a.title.localeCompare(b.title))))
      .catch(() => setCourses([]));
  }, [isOwner]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Standalone Courses is managed by the agency owner.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Standalone Courses</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Manage or create new courses for Magnetix Studios.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/agency/course-offers">
            <Button size="sm" variant="outline">Course Offers</Button>
          </Link>
          <Link href="/agency/standalone-courses/new">
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" /> New course
            </Button>
          </Link>
        </div>
      </div>

      {!courses ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-[13px] text-muted-foreground">No courses yet. Create your first course to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course: c }: { course: StandaloneCourse }) {
  const price = c.access === "purchase" ? (c.priceCents != null ? formatCurrency(c.priceCents / 100, c.currency ?? "USD") : "Paid") : "Free";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Link href={`/agency/standalone-courses/${c.id}`} className="block" aria-label={`Open ${c.title}`}>
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.coverUrl} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">
            {c.title.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/agency/standalone-courses/${c.id}`} className="text-[13px] font-medium hover:underline">
            {c.title}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              c.published ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
            )}
          >
            {c.published ? "published" : "draft"}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2.5 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {c.enrollmentCount}
          </span>
          <span>{price}</span>
          <a href={`/course/agency/${c.id}`} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 hover:text-foreground">
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
