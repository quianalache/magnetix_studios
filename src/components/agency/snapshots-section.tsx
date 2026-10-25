"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState } from "@/components/system/empty-state";
import { Tag } from "@/components/system/status-pill";

interface SubOption {
  id: string;
  name: string;
  accountNumber?: number;
}

interface SnapshotSummary {
  id: string;
  name: string;
  description: string;
  sourceSubAccountId: string | null;
  createdAt: number | null;
  counts: {
    forms: number;
    messageTemplates: number;
    products: number;
    workflows: number;
  };
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-body focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Agency-owner panel: capture a sub-account's reusable config (forms, message
 * templates, products, workflows) into a snapshot. Captured snapshots are
 * applied at sub-account CREATION time via the "Start from a snapshot" picker
 * on the new sub-account form — this panel is the capture + library surface.
 * Mirrors GoHighLevel's "snapshot" — build a proven setup once, deploy it to
 * every new client. Customer data + credentials are never copied.
 */
export function SnapshotsSection({ subs }: { subs: SubOption[] }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [capturing, setCapturing] = useState(false);

  const subLabel = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const s = subs.find((x) => x.id === id);
      if (!s) return "a removed sub-account";
      return s.accountNumber ? `#${s.accountNumber} ${s.name}` : s.name;
    },
    [subs],
  );

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/snapshots");
      const data = (await res.json().catch(() => ({}))) as {
        snapshots?: SnapshotSummary[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load snapshots.");
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  async function handleCapture() {
    if (capturing) return;
    if (!sourceId) {
      toast.error("Pick a sub-account to capture from.");
      return;
    }
    if (!name.trim()) {
      toast.error("Give the snapshot a name.");
      return;
    }
    setCapturing(true);
    try {
      const res = await fetch("/api/agency/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSubAccountId: sourceId, name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        counts?: SnapshotSummary["counts"];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Capture failed.");
      const c = data.counts;
      toast.success(
        c
          ? `Captured ${c.forms} forms, ${c.workflows} workflows, ${c.messageTemplates} templates, ${c.products} products.`
          : "Snapshot captured.",
      );
      setName("");
      await loadSnapshots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Capture failed.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          Snapshots
          <Tag color="pink">Beta</Tag>
        </span>
      }
      description="Capture a sub-account's forms, workflows, message templates, and products into a reusable template, then apply it when you create another sub-account. Customer data and credentials are never copied."
      footer={
        <p className="mr-auto text-caption text-muted-foreground">
          Apply a snapshot from the &ldquo;Start from a snapshot&rdquo; picker on the{" "}
          <span className="font-medium text-foreground">new sub-account</span> form. Imported workflows arrive as
          drafts to review and activate; a workflow triggered by a form in the same snapshot is auto-linked, and any
          other form or WhatsApp-template reference is cleared for you to reconnect.
        </p>
      }
    >
      {/* Capture */}
      <div className="rounded-lg border border-border bg-surface-sunken p-4">
        <p className="mb-3 text-body-sm font-semibold text-foreground">Capture a snapshot</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-caption font-medium text-muted-foreground">
            From sub-account
            <select className={selectClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Select…</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.accountNumber ? `#${s.accountNumber} ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-caption font-medium text-muted-foreground">
            Snapshot name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Practitioner starter setup" />
          </label>
          <Button onClick={handleCapture} disabled={capturing}>
            {capturing ? (
              <>
                <Loader2 className="animate-spin" />
                Capturing…
              </>
            ) : (
              <>
                <Camera />
                Capture
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Library */}
      {loading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : snapshots.length === 0 ? (
        <EmptyState compact icon={Layers} title="No snapshots yet" description="Capture a proven setup above to reuse it for new clients." />
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border">
          {snapshots.map((snap) => (
            <li key={snap.id} className="flex items-start gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg">
                <Layers className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">{snap.name}</p>
                <p className="text-caption text-muted-foreground">
                  {snap.counts.forms} forms · {snap.counts.workflows} workflows · {snap.counts.messageTemplates} templates ·{" "}
                  {snap.counts.products} products · from {subLabel(snap.sourceSubAccountId)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
