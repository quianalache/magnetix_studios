"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Pencil, Copy } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/format";
import type { ReportDesign } from "@/types/report-blocks";

/**
 * Report Builder list — the Energetic Decoder equivalent of Bodygraph's
 * "Reading Reports" list (Phase 2, 2026-08-09), toured on her real
 * account: title/page-count/last-updated per row, a "Create new" flow.
 * Clicking a design opens the actual editor at its own dedicated route
 * (not embedded in this tab — same reasoning as Bodygraph opening its
 * editor as a separate full-screen app, not inline in the dashboard).
 *
 * Rename + Duplicate added 2026-08-12 (Build Plan Task 3) — deliberately
 * NOT Bodygraph's Total Sales/Total Downloads/Selling Price/status-dot
 * marketplace layer per the Build Plan's own recommendation: Magnetix has
 * no pricing fields anywhere yet, and that's a real future feature
 * decision, not a Report Builder polish item.
 */
export function EnergeticDecoderReportBuilderTab() {
  const { subAccountId } = useSubAccount();
  const [designs, setDesigns] = useState<ReportDesign[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ReportDesign | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`)
      .then((r) => r.json())
      .then((d) => setDesigns(d.designs ?? []))
      .catch(() => toast.error("Couldn't load report designs."));
  }
  useEffect(load, [subAccountId]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled Report" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.location.href = `/sa/${subAccountId}/energetic-decoder/reports/${data.design.id}`;
    } catch {
      toast.error("Couldn't create report.");
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setDesigns((prev) => prev?.filter((d) => d.id !== id) ?? null);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}`, { method: "DELETE" });
    } catch {
      toast.error("Couldn't delete report.");
      load();
    }
  }

  function openRename(design: ReportDesign) {
    setRenaming(design);
    setRenameValue(design.title);
  }

  /** Reuses the existing updateReportDesign(title) PATCH — no new rename logic, same endpoint the editor's own Save already uses for title. */
  async function saveRename() {
    if (!renaming) return;
    setSavingRename(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() || renaming.title }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDesigns((prev) => prev?.map((d) => (d.id === renaming.id ? data.design : d)) ?? null);
      setRenaming(null);
      toast.success("Renamed.");
    } catch {
      toast.error("Couldn't rename. Try again.");
    } finally {
      setSavingRename(false);
    }
  }

  async function duplicate(id: string) {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDesigns((prev) => (prev ? [data.design, ...prev] : [data.design]));
      toast.success("Duplicated.");
    } catch {
      toast.error("Couldn't duplicate. Try again.");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Report Designs</h2>
            <p className="text-sm text-muted-foreground">
              Build a personalized PDF report once — Shortcodes fill in each reader&apos;s own chart automatically.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-3.5 w-3.5" />
              Create new
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Report Design</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Human Design Starter Report" />
                </div>
                <Button onClick={create} disabled={creating} className="w-full">
                  {creating ? "Creating…" : "Create & Open Editor"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {designs === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        ) : designs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No report designs yet. Create your first one.</p>
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {designs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link
                  href={`/sa/${subAccountId}/energetic-decoder/reports/${d.id}`}
                  className="min-w-0 flex-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {d.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Updated {formatRelativeTime(d.updatedAt ? new Date(d.updatedAt) : null)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.pages.length} page{d.pages.length === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  onClick={() => openRename(d)}
                  title="Rename"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicate(d.id)}
                  disabled={duplicatingId === d.id}
                  title="Duplicate"
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(d.id)} title="Delete" className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={renaming !== null} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Report Design</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Report title"
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
            />
            <Button onClick={saveRename} disabled={savingRename} className="w-full">
              {savingRename ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
