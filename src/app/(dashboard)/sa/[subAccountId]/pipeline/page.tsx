"use client";

import { PipelinesOverview } from "@/components/pipeline/pipelines-overview";

/**
 * Sidebar → Pipelines lands on the Overview (Multiple Pipelines,
 * 2026-09-25) — never straight into a single pipeline.
 */
export default function PipelinesPage() {
  return (
    <div className="momentum-scope rounded-2xl">
      <PipelinesOverview />
    </div>
  );
}
