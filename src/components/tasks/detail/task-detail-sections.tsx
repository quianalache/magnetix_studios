"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronDown,
  Link2,
  ListChecks,
  ListTree,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityFlag } from "@/components/tasks/task-meta";
import {
  addTimeEntry,
  createTaskApi,
  dateInputToIso,
  deleteTaskApi,
  isoToDateInput,
  patchTask,
  reviseTimeEntry,
  setTaskCompleted,
  timerAction,
  type TaskDetailBundle,
  type TaskJson,
} from "@/lib/client/task-detail-api";
import { formatDuration, type TimeEntryView } from "@/types/time-tracking";
import { TASK_PRIORITIES, type Task, type TaskPriority } from "@/types/tasks";

/** Collapsible section shell — every optional section starts collapsed (owner decision). */
export function DetailSection({
  icon: Icon,
  title,
  summary,
  progress,
  children,
}: {
  icon: typeof ListTree;
  title: string;
  summary?: React.ReactNode;
  progress?: number | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-card rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left"
      >
        <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {summary && (
          <span className="text-muted-foreground text-xs whitespace-nowrap">{summary}</span>
        )}
        {progress !== undefined && progress !== null && (
          <span className="bg-muted hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
            <span
              className="block h-full rounded-full bg-violet-500"
              style={{ width: `${progress}%` }}
            />
          </span>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </section>
  );
}

// ── time tracking (compact) ────────────────────────────────────────────────

function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Compact tracker (owner decision): a small "tracked time + start" control;
 * the timer / manual log / entry history only open on demand in a popover.
 */
export function TimeTracker({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const { task, time } = bundle;
  const running = time.activeTimer?.taskId === task.id ? time.activeTimer : null;
  useTick(!!running);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"timer" | "manual">("timer");
  const [date, setDate] = useState(isoToDateInput(new Date().toISOString()));
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editMinutes, setEditMinutes] = useState("");

  const runningSeconds = running
    ? (Date.now() - new Date(running.startedAt).getTime()) / 1000
    : 0;
  const total = (task.timeSpentSeconds ?? 0) + runningSeconds;

  async function toggle() {
    setBusy(true);
    try {
      if (running) {
        const r = await timerAction("stop");
        if (r.stopped) toast.success(`Tracked ${formatDuration(r.stopped.seconds)}`);
      } else {
        const r = await timerAction("start", task.id);
        if (r.stopped && r.stopped.taskId !== task.id) {
          toast.message(
            `Stopped your other timer (${formatDuration(r.stopped.seconds)} logged).`
          );
        }
      }
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logManual() {
    const secs = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
    if (secs < 60) {
      toast.error("Enter at least 1 minute.");
      return;
    }
    setBusy(true);
    try {
      await addTimeEntry(task.id, {
        startedAt: new Date(`${date}T09:00:00`).toISOString(),
        durationSeconds: secs,
        note,
      });
      setHours("");
      setMinutes("");
      setNote("");
      toast.success("Time logged");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revise(e: TimeEntryView, action: "save" | "delete") {
    try {
      if (action === "delete") {
        if (!confirm("Remove this time entry? It stays in the audit history.")) return;
        await reviseTimeEntry(e.id, "delete");
      } else {
        await reviseTimeEntry(e.id, { durationSeconds: Math.round(Number(editMinutes) * 60) });
        setEditId(null);
      }
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">Tracked time</p>
        <p className="text-sm font-semibold tabular-nums">
          {running ? clock(total) : formatDuration(total)}
        </p>
      </div>
      <Button
        size="sm"
        variant={running ? "default" : "outline"}
        className="h-9"
        disabled={busy || (task.completed && !running)}
        onClick={toggle}
        aria-label={running ? "Stop timer" : "Start timer"}
      >
        {running ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
        {running ? "Stop" : "Start"}
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Time tracking options" />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
          <div className="flex gap-1 border-b pb-2">
            {(["timer", "manual"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium",
                  tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "timer" ? "Timer" : "Log time manually"}
              </button>
            ))}
          </div>
          {tab === "timer" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{clock(runningSeconds)}</p>
                <p className="text-muted-foreground text-xs">
                  {running ? "Running on this task" : "One timer at a time — starting here stops any other."}
                </p>
              </div>
              <Button onClick={toggle} disabled={busy || (task.completed && !running)}>
                {running ? "Stop" : "Start"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" aria-label="Date" />
                <Input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="0" className="h-9 w-14" aria-label="Hours" />
                <span className="text-muted-foreground text-xs">h</span>
                <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="0" className="h-9 w-14" aria-label="Minutes" />
                <span className="text-muted-foreground text-xs">m</span>
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" className="h-9" aria-label="Note" />
              <div className="flex justify-end">
                <Button size="sm" onClick={logManual} disabled={busy}>Save</Button>
              </div>
            </div>
          )}
          <div className="border-t pt-2">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Time entries</p>
            {time.entries.length === 0 ? (
              <p className="text-muted-foreground text-xs">No time recorded yet.</p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {time.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{e.actorName}</span>
                      {e.actorKind === "client" && (
                        <span className="ml-1 rounded-full bg-teal-500/10 px-1.5 text-[10px] text-teal-700 dark:text-teal-300">Client</span>
                      )}
                      <span className="text-muted-foreground">
                        {" · "}
                        {e.startedAt ? new Date(e.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                        {e.note ? ` · ${e.note}` : ""}
                        {e.edited ? " · corrected" : ""}
                      </span>
                    </span>
                    {editId === e.id ? (
                      <>
                        <Input value={editMinutes} onChange={(ev) => setEditMinutes(ev.target.value)} className="h-7 w-16" inputMode="numeric" aria-label="Minutes" />
                        <button type="button" className="text-primary font-medium" onClick={() => revise(e, "save")}>Save</button>
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums">{formatDuration(e.durationSeconds)}</span>
                    )}
                    {e.canEdit && editId !== e.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button type="button" aria-label="Entry actions" className="hover:bg-muted rounded p-0.5" />}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => { setEditId(e.id); setEditMinutes(String(Math.round(e.durationSeconds / 60))); }}>Correct</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => revise(e, "delete")}>Remove</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground mt-2 text-[11px]">
              You can correct your own entries; client-reported time is shown read-only.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── tags ────────────────────────────────────────────────────────────────────

export function TagsInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...tags, t]);
    setDraft("");
  }
  return (
    <div className="border-input flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "" : "Add tag…"}
        aria-label="Add tag"
        className="min-w-16 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

// ── subtasks ───────────────────────────────────────────────────────────────

export function SubtasksSection({
  bundle,
  onChanged,
  onOpenTask,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { subAccountId } = useSubAccount();
  const [title, setTitle] = useState("");
  const subs = bundle.subtasks;
  const done = subs.filter((s) => s.completed).length;
  const assigneeName = (s: TaskJson) =>
    s.assigneeContactId
      ? bundle.project?.assignedContactName ?? "Client"
      : bundle.assignees.find((a) => a.uid === s.assigneeUid)?.name ?? null;

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (bundle.task.parentTaskId) return null; // one level only
  return (
    <DetailSection
      icon={ListTree}
      title="Subtasks"
      summary={subs.length ? `${done} of ${subs.length} completed` : "None yet"}
      progress={subs.length ? Math.round((done / subs.length) * 100) : null}
    >
      <ul className="divide-y">
        {subs.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
            <Checkbox
              checked={s.completed}
              onCheckedChange={(v) => run(() => setTaskCompleted(s.id, v === true))}
              aria-label={s.completed ? `Reopen ${s.title}` : `Complete ${s.title}`}
            />
            <button
              type="button"
              onClick={() => onOpenTask(s.id)}
              className={cn("min-w-0 flex-1 truncate text-left text-sm hover:underline", s.completed && "text-muted-foreground line-through")}
            >
              {s.title}
            </button>
            {assigneeName(s) && (
              <span className="bg-muted text-muted-foreground max-w-28 truncate rounded-full px-2 py-0.5 text-[11px]">{assigneeName(s)}</span>
            )}
            <input
              type="date"
              value={isoToDateInput(s.dueAt)}
              onChange={(e) => run(() => patchTask(s.id, { dueAt: dateInputToIso(e.target.value) }))}
              aria-label={`Due date for ${s.title}`}
              className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
            />
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className="hover:bg-muted flex h-8 items-center rounded-md px-1.5" aria-label={`Priority for ${s.title}`} />}>
                <PriorityFlag priority={(s.priority as TaskPriority) ?? null} showLabel={false} />
                {!s.priority && <span className="text-muted-foreground text-xs">Priority</span>}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {TASK_PRIORITIES.map((p) => (
                  <DropdownMenuItem key={p.value} onClick={() => run(() => patchTask(s.id, { priority: p.value }))}>
                    <PriorityFlag priority={p.value} />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => run(() => patchTask(s.id, { priority: null }))}>None</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" className="hover:bg-muted rounded-md p-1.5" aria-label={`More for ${s.title}`} />}>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onOpenTask(s.id)}>Open subtask</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm(`Delete subtask “${s.title}”?`)) void run(() => deleteTaskApi(s.id));
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t) return;
          setTitle("");
          void run(() => createTaskApi(subAccountId, { title: t, parentTaskId: bundle.task.id }));
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask…" className="h-9" aria-label="New subtask" />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!title.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </DetailSection>
  );
}

// ── checklist ──────────────────────────────────────────────────────────────

export function ChecklistSection({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const items = bundle.task.checklist ?? [];
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;
  async function save(next: typeof items) {
    try {
      await patchTask(bundle.task.id, { checklist: next });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <DetailSection
      icon={ListChecks}
      title="Checklist"
      summary={items.length ? `${done} of ${items.length} completed` : "None yet"}
      progress={items.length ? Math.round((done / items.length) * 100) : null}
    >
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2">
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) => save(items.map((i) => (i.id === item.id ? { ...i, done: v === true } : i)))}
              aria-label={item.done ? `Uncheck ${item.title}` : `Check ${item.title}`}
            />
            <input
              defaultValue={item.title}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t && t !== item.title) void save(items.map((i) => (i.id === item.id ? { ...i, title: t } : i)));
              }}
              aria-label="Checklist item"
              className={cn("min-h-8 flex-1 rounded bg-transparent px-1 text-sm outline-none focus:bg-muted/50", item.done && "text-muted-foreground line-through")}
            />
            <button
              type="button"
              aria-label={`Delete ${item.title}`}
              onClick={() => save(items.filter((i) => i.id !== item.id))}
              className="text-muted-foreground hover:text-destructive rounded p-1 opacity-60 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim();
          if (!t) return;
          setDraft("");
          void save([...items, { id: "", title: t, done: false }]);
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an item…" className="h-9" aria-label="New checklist item" />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!draft.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </DetailSection>
  );
}

// ── attachments (links) ───────────────────────────────────────────────────

export function AttachmentsSection({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const items = bundle.task.attachments ?? [];
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  async function save(next: typeof items) {
    try {
      await patchTask(bundle.task.id, { attachments: next });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <DetailSection
      icon={Paperclip}
      title="Attachments"
      summary={items.length ? `${items.length} ${items.length === 1 ? "link" : "links"}` : "None yet"}
    >
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <Link2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="text-primary min-w-0 flex-1 truncate hover:underline">
              {a.name}
            </a>
            <button type="button" aria-label={`Remove ${a.name}`} onClick={() => save(items.filter((x) => x.id !== a.id))} className="text-muted-foreground hover:text-destructive rounded p-1">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^https?:\/\//i.test(url.trim())) {
            toast.error("Paste a full link starting with https://");
            return;
          }
          void save([...items, { id: "", name: name.trim(), url: url.trim() }]);
          setUrl("");
          setName("");
        }}
      >
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-9 min-w-48 flex-1" aria-label="Link URL" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="h-9 w-40" aria-label="Link name" />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!url.trim()}>Add link</Button>
      </form>
      <p className="text-muted-foreground mt-2 text-[11px]">
        Link files from Drive, Dropbox or your site. File uploads arrive with the Assets library.
      </p>
    </DetailSection>
  );
}

// ── connections ────────────────────────────────────────────────────────────

export function ConnectionsSection({
  bundle,
  onChanged,
  onOpenTask,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { task } = bundle;
  const { saPath } = useSubAccount();
  const [adding, setAdding] = useState<null | "dependsOnTaskIds" | "relatedTaskIds">(null);
  const count = bundle.related.length + bundle.dependsOn.length;

  async function setList(field: "dependsOnTaskIds" | "relatedTaskIds", ids: string[]) {
    try {
      await patchTask(task.id, { [field]: ids });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function unlink(field: "contactId" | "dealId") {
    try {
      await patchTask(task.id, { [field]: null });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const row = (t: { id: string; title: string; completed: boolean }, onRemove?: () => void) => (
    <li key={t.id} className="flex items-center gap-2 text-sm">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.completed ? "bg-emerald-500" : "bg-amber-400")} />
      <button type="button" onClick={() => onOpenTask(t.id)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", t.completed && "text-muted-foreground line-through")}>
        {t.title}
      </button>
      {onRemove && (
        <button type="button" aria-label={`Unlink ${t.title}`} onClick={onRemove} className="text-muted-foreground hover:text-destructive rounded p-1">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );

  const summaryParts = [
    bundle.related.length ? `${bundle.related.length} related` : null,
    bundle.dependsOn.length
      ? `${bundle.dependsOn.length} ${bundle.dependsOn.length === 1 ? "dependency" : "dependencies"}`
      : null,
    bundle.contact ? "contact" : null,
    bundle.deal ? "deal" : null,
  ].filter(Boolean);

  return (
    <DetailSection
      icon={Link2}
      title="Task Connections"
      summary={summaryParts.length ? summaryParts.join(" · ") : count ? `${count}` : "None yet"}
    >
      <div className="space-y-4">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Waiting on (dependencies)</p>
          {bundle.dependsOn.length === 0 ? (
            <p className="text-muted-foreground text-xs">No prerequisites. Dependencies warn before completing — they never block.</p>
          ) : (
            <ul className="space-y-1">
              {bundle.dependsOn.map((t) =>
                row(t, () => setList("dependsOnTaskIds", bundle.dependsOn.filter((x) => x.id !== t.id).map((x) => x.id)))
              )}
            </ul>
          )}
        </div>
        {bundle.dependents.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Blocking</p>
            <ul className="space-y-1">{bundle.dependents.map((t) => row(t))}</ul>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Related tasks</p>
          {bundle.related.length === 0 ? (
            <p className="text-muted-foreground text-xs">None linked.</p>
          ) : (
            <ul className="space-y-1">
              {bundle.related.map((t) =>
                row(t, () => setList("relatedTaskIds", bundle.related.filter((x) => x.id !== t.id).map((x) => x.id)))
              )}
            </ul>
          )}
        </div>
        {(bundle.contact || bundle.deal || task.eventId) && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">CRM links</p>
            <ul className="space-y-1 text-sm">
              {bundle.contact && (
                <li className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 text-xs">Contact</span>
                  <Link href={saPath(`/contacts/${bundle.contact.id}`)} className="text-primary flex-1 truncate hover:underline">{bundle.contact.name}</Link>
                  <button type="button" onClick={() => unlink("contactId")} aria-label="Unlink contact" className="text-muted-foreground hover:text-destructive rounded p-1"><X className="h-3.5 w-3.5" /></button>
                </li>
              )}
              {bundle.deal && (
                <li className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 text-xs">Deal</span>
                  <span className="flex-1 truncate">{bundle.deal.title}</span>
                  <button type="button" onClick={() => unlink("dealId")} aria-label="Unlink deal" className="text-muted-foreground hover:text-destructive rounded p-1"><X className="h-3.5 w-3.5" /></button>
                </li>
              )}
              {task.eventId && (
                <li className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 text-xs">Event</span>
                  <Link href={saPath("/calendar")} className="text-primary hover:underline">Linked calendar event</Link>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding("dependsOnTaskIds")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add dependency
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding("relatedTaskIds")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Link related task
          </Button>
        </div>
        {adding && (
          <TaskPicker
            excludeIds={[
              task.id,
              ...(adding === "dependsOnTaskIds" ? bundle.dependsOn : bundle.related).map((t) => t.id),
            ]}
            preferProjectId={task.projectId ?? null}
            onPick={(id) => {
              const current = (adding === "dependsOnTaskIds" ? bundle.dependsOn : bundle.related).map((t) => t.id);
              void setList(adding, [...current, id]);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        )}
      </div>
    </DetailSection>
  );
}

/** Search the sub-account's tasks (same territory-scoped subscription My Tasks uses). */
function TaskPicker({
  excludeIds,
  preferProjectId,
  onPick,
  onCancel,
}: {
  excludeIds: string[];
  preferProjectId: string | null;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready, filter } = useEffectiveTerritoryFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!user || !agencyId || !ready) return;
    const unsub = safeSubscribe(
      () => subscribeToTasks({ agencyId, subAccountId }, { territoryFilter: filter }, setTasks),
      () => setTasks([])
    );
    return () => unsub?.();
  }, [user, agencyId, subAccountId, ready, filter]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => !excludeIds.includes(t.id))
      .filter((t) => !needle || t.title.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.projectId === preferProjectId) - Number(a.projectId === preferProjectId))
      .slice(0, 8);
  }, [tasks, q, excludeIds, preferProjectId]);
  return (
    <div className="rounded-lg border p-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-9 pl-8" aria-label="Search tasks to link" />
      </div>
      <ul className="mt-1 max-h-52 overflow-y-auto">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onPick(t.id)} className="hover:bg-muted w-full rounded-md px-2 py-2 text-left text-sm">
              {t.title}
              {t.completed && <span className="text-muted-foreground ml-1 text-xs">(done)</span>}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="text-muted-foreground px-2 py-2 text-xs">No matching tasks.</li>}
      </ul>
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
