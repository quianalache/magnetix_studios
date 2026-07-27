"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Plus, ExternalLink, Users } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { OffersList } from "@/components/course-offers/offers-list";
import type { StandaloneCourse } from "@/types/standalone-courses";

type CoursesTab = "products" | "offers";

/**
 * Standalone Courses — staff list + create. Gated by
 * `standaloneCoursesEnabledByAgency`; renders a locked state when the agency
 * hasn't enabled it. Each course links to its editor + its public
 * `/course/[saId]/[courseId]` sales page. Mirrors the Community group list
 * page's structure — a flat list of courses, no group concept.
 */
export default function StandaloneCoursesPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<CoursesTab>("products");

  const gateOn = subAccount?.standaloneCoursesEnabledByAgency === true;

  useEffect(() => {
    if (!gateOn) {
      setLoaded(true);
      return;
    }
    return subscribeToStandaloneCourses(
      subAccountId,
      (list) => {
        setCourses([...list].sort((a, b) => a.title.localeCompare(b.title)));
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId, gateOn]);

  if (!gateOn) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Courses is locked</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your agency administrator hasn&apos;t enabled Standalone Courses
            for this sub-account yet. Ask them to switch it on from Manage in
            the agency sub-accounts list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          {tab === "products" ? "Products" : "Offers"}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {tab === "products"
            ? "Manage or create new courses"
            : "Create and manage offers for your courses"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "products", label: "Products" },
            { value: "offers", label: "Offers" },
          ]}
        />
        {tab === "products" && isAdmin && (
          <Link href={`/sa/${subAccountId}/courses/new`}>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" /> New course
            </Button>
          </Link>
        )}
      </div>

      {tab === "offers" ? (
        <OffersList subAccountId={subAccountId} />
      ) : !loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-[13px] text-muted-foreground">
            No courses yet.{" "}
            {isAdmin
              ? "Create your first course to get started."
              : "Ask an admin to create one."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} subAccountId={subAccountId} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course: c,
  subAccountId,
}: {
  course: StandaloneCourse;
  subAccountId: string;
}) {
  const price =
    c.access === "purchase"
      ? c.priceCents != null
        ? formatCurrency(c.priceCents / 100, c.currency ?? "USD")
        : "Paid"
      : "Free";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Link
        href={`/sa/${subAccountId}/courses/${c.id}`}
        className="block"
        aria-label={`Open ${c.title}`}
      >
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.coverUrl}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">
            {c.title.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/sa/${subAccountId}/courses/${c.id}`}
            className="text-[13px] font-medium hover:underline"
          >
            {c.title}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              c.published
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
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
          <a
            href={`/course/${subAccountId}/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 hover:text-foreground"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
