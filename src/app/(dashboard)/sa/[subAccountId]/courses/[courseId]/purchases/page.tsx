"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToMembers } from "@/lib/firestore/community-roster";
import { subscribeToStandalonePurchases } from "@/lib/firestore/standalone-courses";
import { Button } from "@/components/ui/button";
import type { Member } from "@/types/community";
import type { StandaloneCoursePurchase } from "@/types/standalone-courses";

/**
 * Standalone-course purchases — pending PayPal purchases, "mark as paid" to
 * grant classroom access. Forked from the purchases half of Community's
 * roster page, minus the memberships/roster half (a standalone course has no
 * membership concept, only enrollments + purchases).
 */
export default function StandaloneCoursePurchasesPage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { courseId } = use(params);
  const { subAccountId, isAdmin } = useSubAccount();
  const apiBase = `/api/sub-accounts/${subAccountId}/standalone-courses/${courseId}`;

  const [members, setMembers] = useState<Member[]>([]);
  const [purchases, setPurchases] = useState<StandaloneCoursePurchase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeToMembers(subAccountId, setMembers);
    const u2 = subscribeToStandalonePurchases(subAccountId, courseId, setPurchases);
    return () => {
      u1();
      u2();
    };
  }, [subAccountId, courseId]);

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m]));
    return (memberId: string) => {
      const m = map.get(memberId);
      if (!m) return "Member";
      return m.displayName?.trim() || m.email.split("@")[0] || m.email;
    };
  }, [members]);

  const pending = purchases
    .filter((p) => p.status === "pending")
    .sort((a, b) => a.id.localeCompare(b.id));
  const paid = purchases.filter((p) => p.status === "paid");

  async function markPaid(purchaseId: string) {
    setBusy(purchaseId);
    try {
      const res = await fetch(`${apiBase}/purchases/${purchaseId}/mark-paid`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Marked paid — access granted");
    } catch {
      toast.error("Couldn't mark paid");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <Link
          href={`/sa/${subAccountId}/courses/${courseId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Course editor
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Purchases</h1>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Pending payments ({pending.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Confirm the payment landed in your PayPal account, then mark it paid
          to grant classroom access.
        </p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending purchases.</p>
        ) : (
          pending.map((p) => {
            const method = p.method ?? "paypal";
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{nameOf(p.memberId)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {(p.amountCents / 100).toFixed(2)} {p.currency}
                  </span>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {method === "stripe" ? "Stripe" : "PayPal"}
                  </span>
                </div>
                {method === "stripe" ? (
                  <span className="text-xs text-muted-foreground">
                    Waiting on Stripe
                  </span>
                ) : (
                  isAdmin && (
                    <Button
                      size="sm"
                      onClick={() => markPaid(p.id)}
                      disabled={busy === p.id}
                    >
                      {busy === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Mark paid"
                      )}
                    </Button>
                  )
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Paid ({paid.length})</h2>
        {paid.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid purchases yet.</p>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {paid.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium">
                  {nameOf(p.memberId)}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {(p.method ?? "paypal") === "stripe" ? "Stripe" : "PayPal"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {(p.amountCents / 100).toFixed(2)} {p.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
