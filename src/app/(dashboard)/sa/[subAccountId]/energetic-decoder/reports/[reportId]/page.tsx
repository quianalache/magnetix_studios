"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { ReportEditor } from "@/components/energetic-decoder/report-editor";
import type { ReportDesign } from "@/types/report-blocks";

export default function ReportDesignEditorPage() {
  const { subAccountId } = useSubAccount();
  const router = useRouter();
  const params = useParams<{ reportId: string }>();
  const [design, setDesign] = useState<ReportDesign | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${params.reportId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setDesign(d.design))
      .catch(() => {
        setNotFound(true);
        toast.error("Couldn't load that report.");
      });
  }, [subAccountId, params.reportId]);

  if (notFound) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-muted-foreground">That report design doesn&apos;t exist.</p>
        <button
          onClick={() => router.push(`/sa/${subAccountId}/energetic-decoder`)}
          className="mt-3 text-sm font-medium text-primary underline"
        >
          Back to Energetic Decoder
        </button>
      </div>
    );
  }

  if (!design) {
    return <div className="mx-auto h-96 w-full max-w-[1400px] animate-pulse rounded-2xl bg-muted/20" />;
  }

  return <ReportEditor subAccountId={subAccountId} initial={design} />;
}
