"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RitualDoc, RitualFrequency, RitualTimeBlock } from "@/types/reflection";

/**
 * Rituals — real "Create New Ritual" modal (Name/Description/Frequency/
 * Time Block) ported verbatim from the compiled app bundle 2026-08-08.
 * The ritual CARD layout below it wasn't in the bundle excerpt captured —
 * only the modal was — so the card follows this app's existing house
 * style (rounded-2xl border-none shadow-sm bg-card) rather than a
 * confirmed-real recipe.
 */
const FREQUENCIES: { value: RitualFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];
const TIME_BLOCKS: { value: RitualTimeBlock; label: string }[] = [
  { value: "AM", label: "AM" },
  { value: "Midday", label: "Midday" },
  { value: "PM", label: "PM" },
  { value: "Evening", label: "Evening" },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RitualsTab({ subAccountId }: { subAccountId: string }) {
  const [rituals, setRituals] = useState<RitualDoc[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", frequency: "daily" as RitualFrequency, timeBlock: "AM" as RitualTimeBlock });
  const [saving, setSaving] = useState(false);
  const today = todayStr();

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals`)
      .then((r) => r.json())
      .then((d) => setRituals(d.rituals ?? []))
      .catch(() => toast.error("Couldn't load rituals."));
  }
  useEffect(load, [subAccountId]);

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setForm({ name: "", description: "", frequency: "daily", timeBlock: "AM" });
      setOpen(false);
      load();
      toast.success("Ritual created.");
    } catch {
      toast.error("Couldn't create ritual.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(ritualId: string) {
    setRituals((prev) =>
      prev?.map((r) =>
        r.id === ritualId
          ? { ...r, completedDates: r.completedDates.includes(today) ? r.completedDates.filter((d) => d !== today) : [...r.completedDates, today] }
          : r,
      ) ?? null,
    );
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals/${ritualId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleDate: today }),
      });
    } catch {
      toast.error("Couldn't update ritual.");
      load();
    }
  }

  async function remove(ritualId: string) {
    setRituals((prev) => prev?.filter((r) => r.id !== ritualId) ?? null);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals/${ritualId}`, { method: "DELETE" });
    } catch {
      toast.error("Couldn't delete ritual.");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Rituals</h2>
          <p className="text-sm text-muted-foreground">Intentional practices for energetic maintenance and embodiment.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> New Ritual
          </DialogTrigger>
          <DialogContent className="rounded-3xl max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Ritual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning Grounding"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What is the intent of this ritual?"
                  className="rounded-xl resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as RitualFrequency }))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-primary/20"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Time Block</label>
                  <select
                    value={form.timeBlock}
                    onChange={(e) => setForm((f) => ({ ...f, timeBlock: e.target.value as RitualTimeBlock }))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-primary/20"
                  >
                    {TIME_BLOCKS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button onClick={create} disabled={saving || !form.name.trim()} className="w-full rounded-xl">
                {saving ? "Creating…" : "Create Ritual"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rituals === null ? (
        <div className="h-40 animate-pulse rounded-3xl border bg-muted/20" />
      ) : rituals.length === 0 ? (
        <div className="p-10 text-center bg-muted/20 rounded-3xl border border-dashed border-border/40">
          <Heart className="mx-auto mb-4 h-8 w-8 text-primary/40" />
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
            Create intentional practices to ground yourself and maintain your energy.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rituals.map((r) => {
            const doneToday = r.completedDates.includes(today);
            return (
              <div key={r.id} className="rounded-2xl border-none shadow-sm bg-card p-4 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    doneToday ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
                  )}
                  aria-label={doneToday ? "Mark incomplete" : "Mark complete"}
                >
                  {doneToday && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{r.name}</p>
                    <button type="button" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                  <div className="mt-2 flex gap-1.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{r.frequency}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{r.timeBlock}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
