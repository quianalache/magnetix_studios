"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, Calendar, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { MemoryDoc } from "@/types/reflection";

/**
 * Memories — real "Capture Memory" modal (Title/Date/Reflection/optional
 * Project link) ported verbatim from the compiled app bundle 2026-08-08,
 * card layout confirmed against her real screenshot the same day (icon
 * badge, date row, bold title, divider, italic reflection quote). The
 * heart icon at the card's bottom in that screenshot isn't wired to a
 * real field we have evidence for, so it's decorative here, not a toggle.
 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
}

export function MemoriesTab({ subAccountId }: { subAccountId: string }) {
  const [memories, setMemories] = useState<MemoryDoc[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: todayStr(), reflection: "", linkedProjectId: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/memories`)
      .then((r) => r.json())
      .then((d) => {
        setMemories(d.memories ?? []);
        setProjects(d.projects ?? []);
      })
      .catch(() => toast.error("Couldn't load memories."));
  }
  useEffect(load, [subAccountId]);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, linkedProjectId: form.linkedProjectId || null }),
      });
      if (!res.ok) throw new Error();
      setForm({ title: "", date: todayStr(), reflection: "", linkedProjectId: "" });
      setOpen(false);
      load();
      toast.success("Memory saved.");
    } catch {
      toast.error("Couldn't save memory.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(memoryId: string) {
    setMemories((prev) => prev?.filter((m) => m.id !== memoryId) ?? null);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/reflection/memories/${memoryId}`, { method: "DELETE" });
    } catch {
      toast.error("Couldn't delete memory.");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Memories</h2>
          <p className="text-sm text-muted-foreground">Meaningful moments, breakthroughs, and emotional milestones.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Capture Memory
          </DialogTrigger>
          <DialogContent className="rounded-3xl max-w-md">
            <DialogHeader>
              <DialogTitle>Capture a Meaningful Moment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What happened?" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reflection</label>
                <Textarea value={form.reflection} onChange={(e) => setForm((f) => ({ ...f, reflection: e.target.value }))} placeholder="Why was this moment meaningful?" className="rounded-xl resize-none h-32" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Link to Project (Optional)</label>
                <select
                  value={form.linkedProjectId}
                  onChange={(e) => setForm((f) => ({ ...f, linkedProjectId: e.target.value }))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-primary/20"
                >
                  <option value="">No Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <Button onClick={save} disabled={saving || !form.title.trim()} className="w-full rounded-xl py-6 mt-4">
                {saving ? "Saving…" : "Save Memory"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {memories === null ? (
        <div className="h-40 animate-pulse rounded-3xl border bg-muted/20" />
      ) : memories.length === 0 ? (
        <div className="p-10 text-center bg-muted/20 rounded-3xl border border-dashed border-border/40">
          <Award className="mx-auto mb-4 h-8 w-8 text-primary/40" />
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">No memories captured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {memories.map((m) => (
            <div key={m.id} className="group flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm transition-all hover:shadow-md">
              <div className="relative border-b border-border/40 bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm">
                    <Award className="h-5 w-5 text-primary" />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {fmtDate(m.date)}
                </div>
                <p className="mt-1 text-lg font-bold text-foreground">{m.title}</p>
              </div>
              <div className="flex-1 p-6">
                <p className="text-sm italic text-muted-foreground">&ldquo;{m.reflection || "No reflection added."}&rdquo;</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
