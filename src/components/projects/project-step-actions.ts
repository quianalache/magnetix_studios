"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import type { ProjectStep } from "@/types/projects";

/**
 * Staff-side project step mutations — the same `/api/sub-accounts/[id]/
 * projects/[projectId]/steps*` routes the Edit Project sheet has always
 * used (server recomputes the parent's step counts; the Client Portal sees
 * changes live). Extracted so the Project Workspace's List / Board views
 * share one implementation.
 */
export function useProjectStepActions(projectId: string) {
  const { subAccountId } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/projects/${projectId}/steps`;

  const addStep = useCallback(
    async (title: string): Promise<boolean> => {
      const clean = title.trim();
      if (!clean) return false;
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: clean }),
        });
        if (!res.ok) throw new Error();
        return true;
      } catch {
        toast.error("Couldn't add that task.");
        return false;
      }
    },
    [base]
  );

  const setDone = useCallback(
    async (step: ProjectStep, done: boolean) => {
      try {
        const res = await fetch(`${base}/${step.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("Couldn't update that task.");
      }
    },
    [base]
  );

  const deleteStep = useCallback(
    async (step: ProjectStep) => {
      if (!confirm(`Delete task "${step.title}"?`)) return;
      try {
        const res = await fetch(`${base}/${step.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("Couldn't delete that task.");
      }
    },
    [base]
  );

  return { addStep, setDone, deleteStep };
}
