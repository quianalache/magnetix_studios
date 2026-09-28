"use client";

import { useEffect, useState } from "react";

/**
 * Client Portal body for a TASK-based project (Projects & Tasks Phase 2),
 * rendered inside the existing "Your projects" card in the same MyMagnetix
 * visual language as the step checklist (neutral #202124 / #909090 /
 * #E4E4E4, small type, no new chrome). Every action here is re-authorized
 * server-side by /api/portal/[saId]/… — the buttons only mirror the
 * permissions the server already computed (`canComplete`, `canEdit`).
 */

export interface PortalTaskViewClient {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  priority: string | null;
  status: string;
  completed: boolean;
  parentTaskId: string | null;
  checklist: { id: string; title: string; done: boolean }[];
  isOwn: boolean;
  assignedToMe: boolean;
  canComplete: boolean;
  canEdit: boolean;
  myTimeSeconds: number;
}

export interface PortalTaskData {
  tasks: PortalTaskViewClient[];
  milestones: { id: string; title: string; dueAt: string | null; completed: boolean }[];
  myTimeSeconds: number;
}

export interface PortalTimer {
  taskId: string;
  taskTitle: string;
  startedAt: string;
}

interface EntryView {
  id: string;
  startedAt: string | null;
  durationSeconds: number;
  note: string;
  source: "timer" | "manual";
  edited: boolean;
  canEdit: boolean;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return m > 0 ? `${m}m` : s > 0 ? "<1m" : "0m";
}
function day(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
}
function requestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    warnings?: string[];
  };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function PortalTaskProject({
  saId,
  projectId,
  data,
  timer,
  onChanged,
  onTimerChanged,
}: {
  saId: string;
  projectId: string;
  data: PortalTaskData;
  timer: PortalTimer | null;
  onChanged: () => void;
  onTimerChanged: (t: PortalTimer | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const top = data.tasks.filter((t) => !t.parentTaskId);
  const subsOf = (id: string) => data.tasks.filter((t) => t.parentTaskId === id);

  async function run(fn: () => Promise<{ warnings?: string[] } | void>) {
    setNotice(null);
    try {
      const r = await fn();
      if (r && r.warnings?.length) setNotice(r.warnings.join(" "));
      onChanged();
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  async function toggleTimer(task: PortalTaskViewClient) {
    setNotice(null);
    try {
      if (timer?.taskId === task.id) {
        await call(`/api/portal/${saId}/time/timer`, "POST", { action: "stop" });
        onTimerChanged(null);
      } else {
        const r = (await call(`/api/portal/${saId}/time/timer`, "POST", {
          action: "start",
          taskId: task.id,
        })) as { timer?: PortalTimer };
        onTimerChanged(r.timer ?? null);
      }
      onChanged();
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  const row = (t: PortalTaskViewClient, nested = false) => (
    <div key={t.id} className={nested ? "ml-6" : ""}>
      <div className="flex items-start gap-2.5 py-1">
        <input
          type="checkbox"
          checked={t.completed}
          disabled={!t.canComplete}
          title={t.canComplete ? undefined : "Your business will complete this one"}
          onChange={() =>
            run(() =>
              call(`/api/portal/${saId}/tasks/${t.id}`, "PATCH", { completed: !t.completed })
            )
          }
          className="mt-0.5 h-4 w-4 rounded border-[#C9C9C9] accent-[#202124] disabled:opacity-40"
          aria-label={t.completed ? `Reopen ${t.title}` : `Complete ${t.title}`}
        />
        <button
          type="button"
          onClick={() => setOpenTask(openTask === t.id ? null : t.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={
              t.completed
                ? "text-sm text-[#909090] line-through"
                : "text-sm text-[#202124]"
            }
          >
            {t.title}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[#909090]">
            {t.dueAt && <span>Due {day(t.dueAt)}</span>}
            {t.assignedToMe && <span>Assigned to you</span>}
            {t.isOwn && <span>Added by you</span>}
            {t.myTimeSeconds > 0 && <span>Your time {fmt(t.myTimeSeconds)}</span>}
          </span>
        </button>
        {!t.completed && (
          <button
            type="button"
            onClick={() => toggleTimer(t)}
            className="shrink-0 rounded-lg border border-[#E4E4E4] px-2 py-1 text-[11px] font-medium text-[#202124]"
            aria-label={timer?.taskId === t.id ? "Stop timer" : "Start timer"}
          >
            {timer?.taskId === t.id ? "■ Stop" : "▶ Timer"}
          </button>
        )}
      </div>
      {openTask === t.id && (
        <PortalTaskDetail saId={saId} task={t} onChanged={onChanged} onNotice={setNotice} />
      )}
      {!nested && subsOf(t.id).map((s) => row(s, true))}
    </div>
  );

  return (
    <div className="space-y-3 border-t border-[#E4E4E4] px-4 py-3">
      {notice && (
        <p className="rounded-lg bg-[#F7F6F3] px-3 py-2 text-xs text-[#606060]">{notice}</p>
      )}

      {data.milestones.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#909090] uppercase">
            Milestones
          </p>
          <ul className="space-y-1">
            {data.milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className={m.completed ? "text-[#909090] line-through" : "text-[#202124]"}>
                  {m.completed ? "✓ " : "◇ "}
                  {m.title}
                </span>
                {m.dueAt && <span className="text-[11px] text-[#909090]">{day(m.dueAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        {data.milestones.length > 0 && (
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#909090] uppercase">
            Tasks
          </p>
        )}
        {top.length === 0 ? (
          <p className="py-1 text-xs text-[#909090]">No tasks yet.</p>
        ) : (
          top.map((t) => row(t))
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              const title = draft.trim();
              setDraft("");
              run(() => call(`/api/portal/${saId}/projects/${projectId}/tasks`, "POST", { title }));
            }
          }}
          placeholder="Add a task…"
          className="flex-1 rounded-lg border border-[#E4E4E4] px-2.5 py-1.5 text-xs text-[#202124] outline-none placeholder:text-[#909090]"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            const title = draft.trim();
            setDraft("");
            run(() => call(`/api/portal/${saId}/projects/${projectId}/tasks`, "POST", { title }));
          }}
          className="rounded-lg border border-[#E4E4E4] px-2.5 py-1.5 text-xs font-medium text-[#202124] disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {data.myTimeSeconds > 0 && (
        <p className="text-[11px] text-[#909090]">Your time on this project: {fmt(data.myTimeSeconds)}</p>
      )}
    </div>
  );
}

function PortalTaskDetail({
  saId,
  task,
  onChanged,
  onNotice,
}: {
  saId: string;
  task: PortalTaskViewClient;
  onChanged: () => void;
  onNotice: (s: string | null) => void;
}) {
  const [entries, setEntries] = useState<EntryView[] | null>(null);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [due, setDue] = useState(task.dueAt ? task.dueAt.slice(0, 10) : "");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logMinutes, setLogMinutes] = useState("");
  const [logNote, setLogNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editMinutes, setEditMinutes] = useState("");

  async function loadEntries() {
    try {
      const r = await fetch(`/api/portal/${saId}/time/entries?taskId=${task.id}`);
      const d = (await r.json()) as { entries?: EntryView[] };
      setEntries(d.entries ?? []);
    } catch {
      setEntries([]);
    }
  }
  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function act(fn: () => Promise<unknown>) {
    onNotice(null);
    try {
      await fn();
      await loadEntries();
      onChanged();
    } catch (err) {
      onNotice((err as Error).message);
    }
  }

  const input =
    "rounded-lg border border-[#E4E4E4] px-2.5 py-1.5 text-xs text-[#202124] outline-none placeholder:text-[#909090]";

  return (
    <div className="mb-2 ml-6 space-y-3 rounded-lg bg-[#F7F6F3] p-3">
      {task.canEdit ? (
        <div className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} w-full bg-white`} aria-label="Task title" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Details (optional)" className={`${input} w-full bg-white`} aria-label="Task details" />
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${input} bg-white`} aria-label="Due date" />
            <button
              type="button"
              onClick={() =>
                act(() =>
                  call(`/api/portal/${saId}/tasks/${task.id}`, "PATCH", {
                    title,
                    description,
                    dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
                  })
                )
              }
              className="rounded-lg bg-[#202124] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete “${task.title}”?`))
                  void act(() => call(`/api/portal/${saId}/tasks/${task.id}`, "DELETE"));
              }}
              className="text-xs text-[#909090] underline underline-offset-2"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        task.description && <p className="text-xs whitespace-pre-line text-[#606060]">{task.description}</p>
      )}

      {task.checklist.length > 0 && (
        <ul className="space-y-1">
          {task.checklist.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs text-[#202124]">
              <input
                type="checkbox"
                checked={c.done}
                disabled={!task.canEdit}
                onChange={() =>
                  act(() =>
                    call(`/api/portal/${saId}/tasks/${task.id}`, "PATCH", {
                      checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)),
                    })
                  )
                }
                className="h-3.5 w-3.5 accent-[#202124]"
              />
              <span className={c.done ? "text-[#909090] line-through" : ""}>{c.title}</span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#909090] uppercase">Your time</p>
        {entries === null ? (
          <p className="text-xs text-[#909090]">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-[#909090]">No time logged yet.</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-[#202124]">
                <span className="w-14 text-[#909090]">{day(e.startedAt)}</span>
                {editing === e.id ? (
                  <>
                    <input value={editMinutes} onChange={(ev) => setEditMinutes(ev.target.value)} inputMode="numeric" className={`${input} w-16 bg-white`} aria-label="Minutes" />
                    <span className="text-[#909090]">min</span>
                    <button
                      type="button"
                      onClick={() =>
                        act(async () => {
                          await call(`/api/portal/${saId}/time/entries/${e.id}`, "PATCH", {
                            durationSeconds: Number(editMinutes) * 60,
                          });
                          setEditing(null);
                        })
                      }
                      className="font-semibold underline underline-offset-2"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[#909090]">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{fmt(e.durationSeconds)}</span>
                    {e.note && <span className="truncate text-[#909090]">{e.note}</span>}
                    {e.edited && <span className="text-[#909090]">(corrected)</span>}
                    {e.canEdit && (
                      <span className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(e.id);
                            setEditMinutes(String(Math.round(e.durationSeconds / 60)));
                          }}
                          className="text-[#909090] underline underline-offset-2"
                        >
                          Correct
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Remove this time entry?"))
                              void act(() => call(`/api/portal/${saId}/time/entries/${e.id}`, "DELETE"));
                          }}
                          className="text-[#909090] underline underline-offset-2"
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!task.completed && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className={`${input} bg-white`} aria-label="Date worked" />
            <input value={logMinutes} onChange={(e) => setLogMinutes(e.target.value)} inputMode="numeric" placeholder="Minutes" className={`${input} w-20 bg-white`} aria-label="Minutes worked" />
            <input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="What did you work on?" className={`${input} min-w-32 flex-1 bg-white`} aria-label="Note" />
            <button
              type="button"
              disabled={!Number(logMinutes)}
              onClick={() =>
                act(async () => {
                  await call(`/api/portal/${saId}/time/entries`, "POST", {
                    taskId: task.id,
                    startedAt: new Date(`${logDate}T09:00:00`).toISOString(),
                    durationSeconds: Number(logMinutes) * 60,
                    note: logNote,
                    requestId: requestId(),
                  });
                  setLogMinutes("");
                  setLogNote("");
                })
              }
              className="rounded-lg border border-[#E4E4E4] bg-white px-2.5 py-1.5 text-xs font-medium text-[#202124] disabled:opacity-40"
            >
              Log time
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
