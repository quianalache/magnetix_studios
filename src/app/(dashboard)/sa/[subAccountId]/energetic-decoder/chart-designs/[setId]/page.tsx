"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import { ChartDesignEditor } from "@/components/energetic-decoder/chart-design-editor";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";

/** Full-screen unified Chart Design editor — opened from Energetic Decoder → Chart Designs (same page pattern as the Report Builder editor, but 1500px wide so the chart preview gets the extra room; loading/missing states match so the width never jumps). */
export default function ChartDesignEditorPage() {
  const { subAccountId, saPath } = useSubAccount();
  const params = useParams<{ setId: string }>();
  const [set, setSet] = useState<ChartDesignSetWithMembers | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    setSet(null);
    setMissing(false);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-design-sets/${params.setId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { set?: ChartDesignSetWithMembers }) => {
        if (!d.set) throw new Error();
        setSet(d.set);
      })
      .catch(() => setMissing(true));
  }, [subAccountId, params.setId]);

  if (missing) {
    return (
      <div className="momentum-scope mx-auto w-full max-w-[1500px] rounded-2xl p-10 text-center">
        <p className="text-sm text-muted-foreground">That chart design doesn&apos;t exist in this workspace.</p>
        <Link href={saPath("/energetic-decoder?tab=chartDesigns")} className="mt-3 inline-block text-sm font-medium text-primary underline">
          Back to Chart Designs
        </Link>
      </div>
    );
  }
  if (!set) return <div className="mx-auto h-[640px] w-full max-w-[1500px] animate-pulse rounded-2xl bg-muted/20" />;

  // Keyed by id so moving to a duplicate starts a fresh editor.
  return <ChartDesignEditor key={set.id} initial={set} />;
}
