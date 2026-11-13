"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { WorkflowStatusBadge } from "@/components/workflows/workflow-status-badge";
import { RunsView } from "@/components/workflows/runs/runs-view";
import type { WorkflowStatus } from "@/types/workflows";

/**
 * A workflow's Runs page (Builder → Runs). CRM Foundations Batch B: every
 * run from the existing records with contact, trigger, status, Test label,
 * filters, paging and a detail panel (`?run=` keeps it open on refresh).
 */
export function WorkflowRuns({ saId, workflowId }: { saId: string; workflowId: string }) {
  const [wf, setWf] = useState<{ name: string; status: WorkflowStatus } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${saId}/workflows/${workflowId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { workflow?: { name?: string; status?: WorkflowStatus } } | null) => {
        if (!cancelled && b?.workflow) setWf({ name: b.workflow.name || "Untitled workflow", status: b.workflow.status ?? "draft" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [saId, workflowId]);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/sa/${saId}/workflows/${workflowId}`} className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to builder
      </Link>
      <PageHeader
        title={wf?.name ?? "Runs"}
        description="Every time a contact ran through this workflow — real and test runs."
        actions={wf ? <WorkflowStatusBadge status={wf.status} /> : undefined}
      />
      <RunsView saId={saId} workflowId={workflowId} />
    </div>
  );
}
