"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ContactPicker } from "@/components/quotes/contact-picker";
import type { Contact } from "@/types/contacts";
import type { LibraryTemplate } from "@/lib/projects/template-library";

/**
 * Restored Momentum OS "Generate Project" dialog (`kSe`) for system
 * templates: name (defaults to the template), start date (defaults to
 * today), launch / end date (defaults to start + duration), and the three
 * original switches — auto-schedule, recurring routines, milestones (the
 * last two only when the template has them). Optionally assign a client
 * (Magnetix addition — makes it a client project in their portal).
 */

function toInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GenerateProjectDialog({
  template,
  contacts,
  open,
  onOpenChange,
}: {
  template: LibraryTemplate | null;
  contacts: Contact[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { subAccountId, saPath } = useSubAccount();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [routines, setRoutines] = useState(true);
  const [milestones, setMilestones] = useState(true);
  const [contactId, setContactId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !template) return;
    const today = new Date();
    setName(template.name);
    setStart(toInput(today));
    if (template.durationDays) {
      const e = new Date(today);
      e.setDate(e.getDate() + template.durationDays);
      setEnd(toInput(e));
    } else setEnd("");
    setAutoSchedule(true);
    setRoutines(true);
    setMilestones(true);
    setContactId(null);
  }, [open, template]);

  if (!template) return null;
  const startLabel = start
    ? new Date(`${start}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  async function generate() {
    if (!name.trim() || !start) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/projects/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: template!.key,
          title: name.trim(),
          startAt: new Date(`${start}T00:00:00`).toISOString(),
          endAt: end ? new Date(`${end}T00:00:00`).toISOString() : null,
          autoSchedule,
          includeRoutines: routines,
          includeMilestones: milestones,
          assignedContactId: contactId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string;
        tasks?: number;
        routines?: number;
      };
      if (!res.ok || !data.projectId) throw new Error(data.error ?? "Couldn't generate the project.");
      toast.success(`Project generated — created with ${data.tasks} tasks and ${data.routines} routines.`);
      onOpenChange(false);
      router.push(saPath(`/projects/${data.projectId}`));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Project</DialogTitle>
          <DialogDescription>
            Deploy &ldquo;{template.name}&rdquo; as a live project with all tasks and timelines.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-violet-500/5 p-3 text-sm">
          <p className="font-medium">What will be generated:</p>
          <ul className="text-muted-foreground mt-1 space-y-0.5">
            <li>{template.tasks.length} tasks with scheduled dates</li>
            {template.routines.length > 0 && <li>{template.routines.length} recurring routines</li>}
            {template.milestones.length > 0 && <li>{template.milestones.length} milestones</li>}
          </ul>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gen-name">Project Name *</Label>
            <Input id="gen-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-start">Start Date *</Label>
              <Input id="gen-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-end">Launch / End Date</Label>
              <Input id="gen-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-client">Client (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ContactPicker id="gen-client" contacts={contacts} value={contactId ?? ""} onChange={(id) => setContactId(id)} placeholder="Keep internal, or assign a client" title="Assign to a client" />
              </div>
              {contactId && <Button type="button" variant="ghost" size="sm" onClick={() => setContactId(null)}>Clear</Button>}
            </div>
            <p className="text-muted-foreground text-[11px]">Assigning a client shows the project, its tasks and milestones in their Client Portal.</p>
          </div>
          <div className="space-y-2 rounded-xl border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              Auto-schedule tasks from start date
              <Switch checked={autoSchedule} onCheckedChange={(v) => setAutoSchedule(v === true)} />
            </label>
            {template.routines.length > 0 && (
              <label className="flex items-center justify-between gap-3 text-sm">
                Create recurring routines
                <Switch checked={routines} onCheckedChange={(v) => setRoutines(v === true)} />
              </label>
            )}
            {template.milestones.length > 0 && (
              <label className="flex items-center justify-between gap-3 text-sm">
                Include milestones
                <Switch checked={milestones} onCheckedChange={(v) => setMilestones(v === true)} />
              </label>
            )}
          </div>
          {autoSchedule && template.durationDays && startLabel && (
            <p className="text-muted-foreground text-xs">
              Tasks will be scheduled across {template.durationDays} days starting {startLabel}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy || !name.trim() || !start}>
            <Zap className="mr-1.5 h-4 w-4" />
            {busy ? "Generating…" : "Generate Project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
