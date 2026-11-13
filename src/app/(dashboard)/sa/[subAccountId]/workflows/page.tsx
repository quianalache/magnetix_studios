import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WorkflowsList } from "@/components/workflows/workflows-list";
import { PageHeader } from "@/components/system/page-header";
import { RunsView } from "@/components/workflows/runs/runs-view";

export default async function WorkflowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { subAccountId } = await params;
  const { view } = await searchParams;
  // CRM Foundations Batch B: Workflows → Runs — every workflow's runs in
  // this workspace (starts on Failed). Lives under Workflows (no new
  // sidebar module, no new page route).
  if (view === "runs") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <Link href={`/sa/${subAccountId}/workflows`} className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to workflows
        </Link>
        <PageHeader title="Workflow runs" description="Runs across every workflow in this workspace — see what failed, for whom and why." />
        <RunsView saId={subAccountId} workflowId={null} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <WorkflowsList saId={subAccountId} />
    </div>
  );
}
