"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Client Portal — Projects. The one interactive/writable piece of the
 * portal MVP so far (everything else is read-only server-rendered lists).
 * A member can check off steps, add a step to a project assigned to them,
 * or start a brand-new project of their own — mirrors what the coach sees
 * in the CRM's Projects page, since both sides read/write the same
 * `projects` collection (see `project-service.ts`). No live subscription
 * here (a portal member has no Firebase Auth identity for Firestore rules
 * to check) — writes go through `/api/portal/[saId]/projects*` and the UI
 * just re-fetches (`router.refresh()`) afterward.
 */

interface StepView {
  id: string;
  title: string;
  done: boolean;
}
interface ProjectView {
  id: string;
  title: string;
  description: string;
  stepCount: number;
  stepsDoneCount: number;
  steps: StepView[];
}

export function PortalProjectsPanel({
  saId,
  projects,
}: {
  saId: string;
  projects: ProjectView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function toggleStep(projectId: string, step: StepView) {
    await fetch(`/api/portal/${saId}/projects/${projectId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !step.done }),
    });
    refresh();
  }

  async function addStep(projectId: string) {
    const title = (stepDrafts[projectId] ?? "").trim();
    if (!title) return;
    await fetch(`/api/portal/${saId}/projects/${projectId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setStepDrafts((prev) => ({ ...prev, [projectId]: "" }));
    refresh();
  }

  async function createProject() {
    const title = newTitle.trim();
    if (!title) return;
    await fetch(`/api/portal/${saId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setNewTitle("");
    setNewOpen(false);
    refresh();
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#909090]">
          Your projects
        </h2>
        <button
          onClick={() => setNewOpen((v) => !v)}
          className="text-xs font-medium text-[#202124] underline underline-offset-2"
        >
          {newOpen ? "Cancel" : "+ New project"}
        </button>
      </div>

      {newOpen && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E4E4E4] bg-white p-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            placeholder="What are you working on?"
            className="flex-1 border-none bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#909090]"
          />
          <button
            onClick={createProject}
            disabled={!newTitle.trim() || pending}
            className="rounded-lg bg-[#202124] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Start
          </button>
        </div>
      )}

      {projects.length === 0 && !newOpen ? (
        <p className="rounded-xl border border-dashed border-[#E4E4E4] bg-white px-4 py-6 text-center text-sm text-[#909090]">
          No projects yet — your coach can assign one, or you can start your own.
        </p>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const pct = p.stepCount > 0 ? Math.round((p.stepsDoneCount / p.stepCount) * 100) : 0;
            const isOpen = openId === p.id;
            return (
              <div key={p.id} className="rounded-xl border border-[#E4E4E4] bg-white">
                <button
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#202124]">{p.title}</p>
                    {p.description && (
                      <p className="truncate text-xs text-[#909090]">{p.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-[#909090]">
                      {p.stepCount > 0
                        ? `${p.stepsDoneCount} of ${p.stepCount}`
                        : "No steps yet"}
                    </span>
                    <span className="text-[#909090]">{isOpen ? "−" : "+"}</span>
                  </div>
                </button>

                {p.stepCount > 0 && (
                  <div className="px-4 pb-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0EFEC]">
                      <div
                        className="h-full bg-[#202124] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div className="space-y-1.5 border-t border-[#E4E4E4] px-4 py-3">
                    {p.steps.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2.5 py-1"
                      >
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => toggleStep(p.id, s)}
                          className="h-4 w-4 rounded border-[#C9C9C9] accent-[#202124]"
                        />
                        <span
                          className={
                            s.done
                              ? "text-sm text-[#909090] line-through"
                              : "text-sm text-[#202124]"
                          }
                        >
                          {s.title}
                        </span>
                      </label>
                    ))}
                    <div className="flex items-center gap-2 pt-1.5">
                      <input
                        value={stepDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setStepDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && addStep(p.id)}
                        placeholder="Add a step…"
                        className="flex-1 rounded-lg border border-[#E4E4E4] px-2.5 py-1.5 text-xs text-[#202124] outline-none placeholder:text-[#909090]"
                      />
                      <button
                        onClick={() => addStep(p.id)}
                        disabled={!(stepDrafts[p.id] ?? "").trim()}
                        className="rounded-lg border border-[#E4E4E4] px-2.5 py-1.5 text-xs font-medium text-[#202124] disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
