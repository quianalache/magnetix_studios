"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, Calendar, FolderKanban, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/system/section-header";
import { EmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";
import { localDateKey } from "@/lib/reflection/local-date";
import type { MemoryDoc } from "@/types/reflection";

/**
 * Memories — Visual Direction 2 (2026-10-23). The MomentumOS "Capture
 * memory" modal (Title / Date / Reflection / optional Project link) and the
 * memory cards: date, title, the reflection as a quote, and the linked
 * project when there is one. Delete is always visible (it used to appear only
 * on hover, so phones and tablets couldn't reach it).
 */
const NO_PROJECT = "__none";

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function MemoriesTab({ subAccountId }: { subAccountId: string }) {
  const { confirm, dialog } = useConfirm();
  const [memories, setMemories] = useState<MemoryDoc[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: localDateKey(), reflection: "", linkedProjectId: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/memories`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setMemories(d.memories ?? []);
        setProjects(d.projects ?? []);
      })
      .catch(() => {
        setMemories((prev) => prev ?? []);
        toast.error("Couldn't load memories.");
      });
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
      setForm({ title: "", date: localDateKey(), reflection: "", linkedProjectId: "" });
      setOpen(false);
      load();
      toast.success("Memory saved.");
    } catch {
      toast.error("Couldn't save memory.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: MemoryDoc) {
    if (!(await confirm({ title: `Delete “${m.title}”?`, description: "This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    setMemories((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/memories/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete memory.");
      load();
    }
  }

  const projectItems = { [NO_PROJECT]: "No project", ...Object.fromEntries(projects.map((p) => [p.id, p.title])) };
  const projectTitle = (id: string | null | undefined) => (id ? projects.find((p) => p.id === id)?.title : undefined);

  return (
    <div className="space-y-4">
      {dialog}
      <SectionHeader
        title="Memories"
        description="Meaningful moments, breakthroughs, and emotional milestones."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Capture memory
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Capture a meaningful moment</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="memory-title">Title</Label>
              <Input id="memory-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What happened?" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memory-date">Date</Label>
              <Input id="memory-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memory-reflection">Reflection</Label>
              <Textarea id="memory-reflection" value={form.reflection} onChange={(e) => setForm((f) => ({ ...f, reflection: e.target.value }))} placeholder="Why was this moment meaningful?" rows={5} />
            </div>
            <div className="space-y-1.5">
              <Label>Link to project (optional)</Label>
              <Select
                value={form.linkedProjectId || NO_PROJECT}
                onValueChange={(v) => setForm((f) => ({ ...f, linkedProjectId: !v || v === NO_PROJECT ? "" : v }))}
                items={projectItems}
              >
                <SelectTrigger aria-label="Project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={saving || !form.title.trim()} className="w-full">
              {saving ? "Saving…" : "Save memory"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {memories === null ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      ) : memories.length === 0 ? (
        <EmptyState icon={Award} title="No memories captured yet" description="Save the moments you want to remember — launches, breakthroughs, milestones." action={<Button onClick={() => setOpen(true)}><Plus />Capture memory</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {memories.map((m) => {
            const project = projectTitle(m.linkedProjectId);
            return (
              <Card key={m.id} className="gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tag-gold-bg text-tag-gold-fg">
                    <Award className="size-4" aria-hidden="true" />
                  </span>
                  <Button variant="ghost" size="icon-xs" onClick={() => remove(m)} aria-label={`Delete ${m.title}`} title="Delete">
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
                    <Calendar className="size-3.5" aria-hidden="true" />
                    {fmtDate(m.date)}
                  </p>
                  <p className="mt-1 text-section font-semibold text-foreground">{m.title}</p>
                </div>
                <blockquote className="border-l-2 border-tag-gold-bg pl-3 text-body-sm italic text-muted-foreground">
                  {m.reflection || "No reflection added."}
                </blockquote>
                {project && (
                  <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                    <FolderKanban className="size-3.5" aria-hidden="true" />
                    {project}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
