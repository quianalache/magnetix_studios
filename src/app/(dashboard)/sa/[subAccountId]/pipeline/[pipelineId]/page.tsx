"use client";

import { Suspense, use } from "react";
import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";

/** One pipeline's Board / List (full-bleed — the Kanban needs the width). */
export default function PipelinePage({
  params,
}: {
  params: Promise<{ subAccountId: string; pipelineId: string }>;
}) {
  const { pipelineId } = use(params);
  return (
    <Suspense fallback={null}>
      <PipelineWorkspace key={pipelineId} pipelineId={pipelineId} />
    </Suspense>
  );
}
