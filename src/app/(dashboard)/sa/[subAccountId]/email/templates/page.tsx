"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  loadEmailTemplate,
  renameEmailTemplate,
  type EmailTemplateSummary,
} from "@/lib/email/template-library";
import { useEmailTemplateList } from "@/hooks/use-email-template-list";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteTemplateDialog, RenameTemplateDialog, TemplateLibraryCard } from "@/components/email-authoring/template-library-card";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SearchField } from "@/components/system/search-field";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";

/**
 * Email Template Library — the one place every reusable email starting
 * point lives, whether it began life as a Broadcast "Save as template",
 * a from-scratch template, or a pre-existing simple email template. Users
 * never see the two backing collections; both render as one card here.
 * Email-only — SMS Templates has its own surface under Marketing.
 */
export default function EmailTemplateLibraryPage() {
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const { user } = useAuth();
  const { templates, loading } = useEmailTemplateList(subAccountId);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<EmailTemplateSummary | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplateSummary | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)
    );
  }, [templates, query]);

  async function handleDuplicate(t: EmailTemplateSummary) {
    if (!agencyId) return;
    setDuplicatingId(t.id);
    try {
      const full = await loadEmailTemplate(t.id, t.source);
      if (!full) {
        toast.error("Couldn't load that template.");
        return;
      }
      await duplicateEmailTemplate({
        agencyId,
        subAccountId,
        createdByUid: user?.uid ?? "",
        template: full,
      });
      toast.success("Template duplicated");
    } catch {
      toast.error("Couldn't duplicate this template.");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="Email Templates"
        description="Reusable starting points for Broadcasts and workflow emails."
        actions={
          <Button render={<Link href={saPath("/email/templates/new")} />}>
            <Plus className="size-4" aria-hidden="true" />
            New template
          </Button>
        }
      />

      {(templates.length > 0 || loading) && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search templates…"
          aria-label="Search email templates"
          className="sm:max-w-sm"
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-card" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState newTemplateHref={saPath("/email/templates/new")} />
      ) : filtered.length === 0 ? (
        <SystemEmptyState compact title="No templates match that search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TemplateLibraryCard
              key={t.id}
              template={t}
              href={saPath(`/email/templates/${t.id}?source=${t.source}`)}
              duplicating={duplicatingId === t.id}
              onDuplicate={() => handleDuplicate(t)}
              onRename={() => setRenaming(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      )}

      <RenameTemplateDialog
        template={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onRename={(t, name) => renameEmailTemplate(t.id, t.source, name)}
      />
      <DeleteTemplateDialog
        template={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDelete={(t) => deleteEmailTemplate(t.id, t.source)}
        description="will be removed from the Email Template Library. Broadcasts or workflow emails that already copied it are unaffected."
      />
    </PageShell>
  );
}

function EmptyState({ newTemplateHref }: { newTemplateHref: string }) {
  return (
    <SystemEmptyState
      icon={FileText}
      title="No email templates yet"
      description="Build a reusable starting point once, then reuse it from any broadcast or workflow email — subject, content, and images included."
      action={
        <Button render={<Link href={newTemplateHref} />}>
          <Plus className="size-4" aria-hidden="true" />
          Build your first template
        </Button>
      }
    />
  );
}
