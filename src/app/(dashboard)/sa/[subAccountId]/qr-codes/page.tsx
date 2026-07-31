"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QrCode, Link2, Contact, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToQrCodes, deleteQrCode } from "@/lib/firestore/qr-codes";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import type { QrCodeDoc } from "@/types/qr-codes";

export default function QrCodesListPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const [codes, setCodes] = useState<QrCodeDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToQrCodes(
      { agencyId, subAccountId },
      (list) => {
        setCodes(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleDelete(c: QrCodeDoc) {
    if (!confirm(`Delete QR code "${c.name}"? Anyone who scans a printed copy will hit a dead link.`)) return;
    try {
      await deleteQrCode(c.id);
      toast.success("QR code deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="QR Codes"
        description="Generate a QR for any link, or a digital business card people can scan to save your contact info."
        actions={
          isAdmin && (
            <Button render={<Link href={saPath("/qr-codes/new")} />}>
              <Plus className="mr-1 h-4 w-4" />
              New QR Code
            </Button>
          )
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : codes.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {codes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={
                    c.kind === "link"
                      ? "flex h-8 w-8 items-center justify-center rounded-lg bg-[#5E2574]/10 text-[#5E2574] dark:bg-[#C892DE]/15 dark:text-[#C892DE]"
                      : "flex h-8 w-8 items-center justify-center rounded-lg bg-[#9EDBDD]/25 text-teal-700 dark:bg-[#9EDBDD]/15 dark:text-[#9EDBDD]"
                  }
                >
                  {c.kind === "link" ? (
                    <Link2 className="h-4 w-4" />
                  ) : (
                    <Contact className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <Link
                    href={saPath(`/qr-codes/${c.id}`)}
                    className="block truncate font-medium hover:text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.kind === "link"
                      ? `${c.destinationUrl || "No destination set"} · ${c.scanCount} scan${c.scanCount === 1 ? "" : "s"}`
                      : "Contact card"}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(c)}
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete QR code"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <QrCode className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No QR codes yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Create one for any link — a booking page, offer, or website — or a
        digital business card people can scan to save your contact info.
      </p>
    </div>
  );
}
