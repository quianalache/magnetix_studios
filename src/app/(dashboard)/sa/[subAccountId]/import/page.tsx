"use client";

import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { GhlImportWizard } from "@/components/import/ghl-import-wizard";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";

/**
 * GoHighLevel migration importer. Reached from Settings → Admin. The wizard
 * walks connect → review mapping → run, streaming live progress.
 */
export default function ImportPage() {
  const { saPath } = useSubAccount();
  return (
    <PageShell width="form">
      <PageHeader
        breadcrumbs={
          <Link href={saPath("/dashboard/settings?section=import")} className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to settings
          </Link>
        }
        title="Migrate from GoHighLevel"
        icon={DatabaseZap}
        description="Bring your contacts (with custom fields + tags), opportunities, and notes across. Re-running is safe — records update instead of duplicating. Workflows, funnels, and page designs can’t be exported from GoHighLevel and are rebuilt here."
      />
      <GhlImportWizard />
    </PageShell>
  );
}
