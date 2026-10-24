"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart, Plus, Trash2, Check } from "lucide-react";
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
import { Tag } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { cn } from "@/lib/utils";
import { localDateKey } from "@/lib/reflection/local-date";
import type { RitualDoc, RitualFrequency, RitualTimeBlock } from "@/types/reflection";

/**
 * Rituals — Visual Direction 2 (2026-10-23). Create (Name / Description /
 * Frequency / Time block, the MomentumOS modal), tick off for today, delete.
 * "Today" is the person's local day.
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
const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label])) as Record<RitualFrequency, string>;
const TIME_BLOCK_LABEL = Object.fromEntries(TIME_BLOCKS.map((t) => [t.value, t.label])) as Record<RitualTimeBlock, string>;

export function RitualsTab({ subAccountId }: { subAccountId: string }) {
  const { confirm, dialog } = useConfirm();
  const [rituals, setRituals] = useState<RitualDoc[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", frequency: "daily" as RitualFrequency, timeBlock: "AM" as RitualTimeBlock });
  const [saving, setSaving] = useState(false);
  const today = localDateKey();

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setRituals(d.rituals ?? []))
      .catch(() => {
        setRituals((prev) => prev ?? []);
        toast.error("Couldn't load rituals.");
      });
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
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals/${ritualId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleDate: today }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't update ritual.");
      load();
    }
  }

  async function remove(r: RitualDoc) {
    if (!(await confirm({ title: `Delete “${r.name}”?`, description: "Its check-off history goes with it. This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    setRituals((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/rituals/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete ritual.");
      load();
    }
  }

  const doneCount = rituals?.filter((r) => r.completedDates.includes(today)).length ?? 0;

  return (
    <div className="space-y-4">
      {dialog}
      <SectionHeader
        title="Rituals"
        description="Intentional practices for energetic maintenance and embodiment."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            New ritual
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create new ritual</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ritual-name">Name</Label>
              <Input id="ritual-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Morning grounding" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ritual-description">Description</Label>
              <Textarea id="ritual-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is the intent of this ritual?" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => v && setForm((f) => ({ ...f, frequency: v as RitualFrequency }))} items={FREQUENCY_LABEL}>
                  <SelectTrigger aria-label="Frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Time block</Label>
                <Select value={form.timeBlock} onValueChange={(v) => v && setForm((f) => ({ ...f, timeBlock: v as RitualTimeBlock }))} items={TIME_BLOCK_LABEL}>
                  <SelectTrigger aria-label="Time block" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_BLOCKS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={saving || !form.name.trim()} className="w-full">
              {saving ? "Creating…" : "Create ritual"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {rituals === null ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
        </div>
      ) : rituals.length === 0 ? (
        <EmptyState icon={Heart} title="No rituals yet" description="Create intentional practices to ground yourself and maintain your energy." action={<Button onClick={() => setOpen(true)}><Plus />New ritual</Button>} />
      ) : (
        <>
          <p className="text-body-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{doneCount}</span> of {rituals.length} done today
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rituals.map((r) => {
              const doneToday = r.completedDates.includes(today);
              return (
                <Card key={r.id} size="sm" className={cn("flex-row items-start gap-3 p-4", doneToday && "border-primary/30")}>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      doneToday ? "border-primary bg-primary text-primary-foreground" : "border-border-strong hover:border-primary",
                    )}
                    aria-pressed={doneToday}
                    aria-label={doneToday ? `Mark ${r.name} not done today` : `Mark ${r.name} done today`}
                  >
                    {doneToday && <Check className="size-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("truncate text-body-sm font-semibold", doneToday && "text-muted-foreground line-through decoration-1")}>{r.name}</p>
                      <Button variant="ghost" size="icon-xs" onClick={() => remove(r)} aria-label={`Delete ${r.name}`} title="Delete" className="-mt-0.5 shrink-0">
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                    {r.description && <p className="mt-0.5 text-caption text-muted-foreground">{r.description}</p>}
                    <div className="mt-2 flex gap-1.5">
                      <Tag color="violet">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</Tag>
                      <Tag color="gold">{TIME_BLOCK_LABEL[r.timeBlock] ?? r.timeBlock}</Tag>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
