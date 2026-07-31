"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";

/** A real trend, not just the flat `scanCount` total — last 14 days,
 *  bucketed client-side from a capped read of the `scans` subcollection
 *  the redirect route writes to (fire-and-forget, one doc per hit). */
export function QrScanChart({ qrId }: { qrId: string }) {
  const [scans, setScans] = useState<Date[]>([]);

  useEffect(() => {
    const q = query(
      collection(getFirebaseDb(), "qrCodes", qrId, "scans"),
      orderBy("scannedAt", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(q, (snap) => {
      setScans(
        snap.docs
          .map((d) => toDate(d.data().scannedAt))
          .filter((d): d is Date => !!d),
      );
    });
    return () => unsub();
  }, [qrId]);

  const days = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const labels: { key: string; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
      labels.push({ key, label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) });
    }
    for (const s of scans) {
      const key = s.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return labels.map((l) => ({ ...l, count: buckets.get(l.key) ?? 0 }));
  }, [scans]);

  if (scans.length === 0) return null;

  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Scans — last 14 days</h3>
        <span className="text-xs text-muted-foreground">
          {total} scan{total === 1 ? "" : "s"} in this window
        </span>
      </div>
      <div className="flex h-20 items-end gap-1">
        {days.map((d) => (
          <div
            key={d.key}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            title={`${d.label}: ${d.count} scan${d.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
    </div>
  );
}
