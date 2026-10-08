"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Pencil, Copy, Plus, Trash2, WandSparkles } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import type { ReportDesign } from "@/types/report-blocks";

type SetSummary = { id: string; name: string; isDefault: boolean };

export function EnergeticDecoderReportBuilderTab() {
  const { subAccountId } = useSubAccount();
  const [designs, setDesigns] = useState<ReportDesign[] | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contentSetId, setContentSetId] = useState("default");
  const [pageSize, setPageSize] = useState<"letter" | "a4" | "custom">("letter");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ReportDesign | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`).then((r) => r.json()).then((d) => setDesigns(d.designs ?? [])).catch(() => toast.error("Couldn’t load report designs."));
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets`).then((r) => r.json()).then((d) => setSets((d.sets ?? []).map((s: SetSummary) => ({ id: s.id, name: s.name, isDefault: s.isDefault })))).catch(() => setSets([{ id: "default", name: "Default", isDefault: true }]));
  }
  useEffect(load, [subAccountId]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || "Untitled Report", contentSetId, pageSize }) });
      if (!res.ok) throw new Error();
      const data = await res.json(); window.location.href = `/sa/${subAccountId}/energetic-decoder/reports/${data.design.id}`;
    } catch { toast.error("Couldn’t create report."); setCreating(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this report design?")) return;
    const old = designs; setDesigns((prev) => prev?.filter((d) => d.id !== id) ?? null);
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}`, { method: "DELETE" });
    if (!res.ok) { setDesigns(old); toast.error("Couldn’t delete report design."); }
  }
  async function duplicate(id: string) {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return toast.error("Couldn’t duplicate report design.");
    const data = await res.json(); setDesigns((prev) => (prev ? [data.design, ...prev] : [data.design])); toast.success("Duplicated.");
  }
  async function saveRename() {
    if (!renaming) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${renaming.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: renameValue.trim() || renaming.title }) });
    if (!res.ok) return toast.error("Couldn’t rename report design.");
    const data = await res.json(); setDesigns((prev) => prev?.map((d) => d.id === renaming.id ? data.design : d) ?? null); setRenaming(null); toast.success("Renamed.");
  }

  return <div className="space-y-6">
    <div className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm dark:border-violet-900/40 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><WandSparkles className="h-5 w-5" /><span className="text-sm font-semibold">Energetic Decoder</span></div><h2 className="mt-2 text-2xl font-semibold tracking-tight">Report Designs</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Compose multi-page reports on a freeform canvas. Each design uses one Content Set and keeps its own visual language.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-[#5420a8] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"><Plus className="h-4 w-4" /> Create report design</DialogTrigger><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>New Report Design</DialogTitle></DialogHeader><div className="space-y-4 py-2"><label className="block text-sm font-medium">Report Design name<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Energetic Blueprint" className="mt-1.5" /></label><label className="block text-sm font-medium">Content Set<select value={contentSetId} onChange={(e) => setContentSetId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm">{sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isDefault ? " (built-in)" : ""}</option>)}</select></label><label className="block text-sm font-medium">Page size<select value={pageSize} onChange={(e) => setPageSize(e.target.value as typeof pageSize)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="letter">US Letter</option><option value="a4">A4</option><option value="custom">Custom</option></select></label><button onClick={create} disabled={creating} className="w-full rounded-xl bg-[#5420a8] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{creating ? "Creating…" : "Create & open canvas"}</button></div></DialogContent></Dialog>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-violet-100 dark:border-violet-900/40"><div className="min-w-[760px]"><div className="grid grid-cols-[minmax(220px,1.5fr)_110px_150px_90px_120px_120px] gap-3 bg-violet-50/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-950/30 dark:text-violet-200"><span>Name</span><span>Status</span><span>Content Set</span><span>Pages</span><span>Updated</span><span>Actions</span></div>{designs === null ? <div className="p-8 text-sm text-muted-foreground">Loading report designs…</div> : designs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-2 h-7 w-7 opacity-40" />No report designs yet.</div> : designs.map((d) => <div key={d.id} className="grid grid-cols-[minmax(220px,1.5fr)_110px_150px_90px_120px_120px] items-center gap-3 border-t px-4 py-3 text-sm"><Link className="min-w-0 truncate font-medium hover:text-violet-700" href={`/sa/${subAccountId}/energetic-decoder/reports/${d.id}`}>{d.title}</Link><span className="w-fit rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-800">{d.status ?? "Draft"}</span><span className="truncate text-muted-foreground">{sets.find((s) => s.id === (d.contentSetId || "default"))?.name ?? "Default"}</span><span>{d.pages.length}</span><span className="text-xs text-muted-foreground">{formatRelativeTime(d.updatedAt ? new Date(d.updatedAt) : null)}</span><div className="flex items-center gap-2"><button title="Rename" onClick={() => { setRenaming(d); setRenameValue(d.title); }}><Pencil className="h-4 w-4 text-muted-foreground" /></button><button title="Duplicate" onClick={() => duplicate(d.id)}><Copy className="h-4 w-4 text-muted-foreground" /></button><button title="Delete" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" /></button></div></div>)}</div></div>
    </div>
    <Dialog open={renaming !== null} onOpenChange={(v) => !v && setRenaming(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Rename Report Design</DialogTitle></DialogHeader><Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} /><button onClick={saveRename} className="rounded-xl bg-[#5420a8] py-2 text-sm font-semibold text-white">Save</button></DialogContent></Dialog>
  </div>;
}
