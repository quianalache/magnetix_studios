"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { AgencyCourseComplimentarySection } from "@/components/agency/agency-course-complimentary-section";
import type { StandaloneCourse, StandaloneCoursePurchase } from "@/types/standalone-courses";

interface Row extends StandaloneCoursePurchase {
  buyer: { email: string; displayName: string | null };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  canceled: "Canceled",
};
const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  canceled: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

/**
 * Agency Standalone Course purchases — owner view into real Stripe-backed
 * purchase data, no Firestore/Stripe Dashboard needed. No PayPal ("mark
 * paid") — agency checkout is Stripe-only and access is webhook-granted
 * (see agency-standalone-course-purchase-service.ts), so this is
 * read-only, unlike the tenant PayPal-era purchases page it mirrors.
 */
export default function AgencyStandaloneCoursePurchasesPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [course, setCourse] = useState<StandaloneCourse | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/agency/standalone-courses/${courseId}/purchases`)
      .then((r) => r.json())
      .then((d: { purchases?: Row[] }) => setRows(d.purchases ?? []))
      .catch(() => setRows([]));
    fetch(`/api/agency/standalone-courses/${courseId}`)
      .then((r) => r.json())
      .then((d: { course?: StandaloneCourse }) => setCourse(d.course ?? null))
      .catch(() => setCourse(null));
  }, [isOwner, courseId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Purchases is managed by the agency owner.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href={`/agency/standalone-courses/${courseId}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Course editor
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Purchases &amp; access</h1>
      </div>

      {!rows ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases yet.</p>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {rows.map((p) => {
            const paidAt = toDate(p.paidAt) ?? toDate(p.requestedAt);
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">{p.buyer.displayName?.trim() || p.buyer.email || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{p.buyer.email}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{(p.amountCents / 100).toFixed(2)} {p.currency}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">Stripe</span>
                  {p.stripeSubscriptionId && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">Recurring</span>
                  )}
                  <span className={cn("rounded-full px-2 py-0.5 font-medium uppercase tracking-wide", STATUS_STYLE[p.status] ?? "bg-muted")}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  {paidAt && <span>{paidAt.toLocaleDateString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {course && (
        <AgencyCourseComplimentarySection courseId={courseId} paid={course.access === "purchase"} />
      )}
    </div>
  );
}
