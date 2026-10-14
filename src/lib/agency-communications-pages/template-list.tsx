"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

import { formatRelativeTime } from "@/lib/format";
import type { EmailTemplateSummary } from "@/lib/email/template-library";
import { Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SearchField } from "@/components/system/search-field";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { EmailTemplatePreview } from "@/components/broadcasts/email-template-preview";

/** Agency Email Template Library — the agency-scope sibling of the tenant
 *  Email Template Library, fetch-based against /api/agency/email-templates. */
export default function AgencyEmailTemplateLibraryPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/agency/email-templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates?: EmailTemplateSummary[] } | null) => setTemplates(d?.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [isOwner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }, [templates, query]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <PageShell width="data">
        <SystemEmptyState icon={Lock} title="Owner only" description="Communications is managed by the agency owner." />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        breadcrumbs={
          <Link href="/agency/communications" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Communications
          </Link>
        }
        title="Email Templates"
        description="Reusable starting points for Magnetix Studios broadcasts."
        actions={
          <Button render={<Link href="/agency/communications/templates/new" />}>
            <Plus className="size-4" aria-hidden="true" /> New template
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
        <SystemEmptyState
          icon={FileText}
          title="No email templates yet"
          description="Build a reusable starting point once, then reuse it from any broadcast."
          action={
            <Button render={<Link href="/agency/communications/templates/new" />}>
              <Plus className="size-4" aria-hidden="true" /> Build your first template
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <SystemEmptyState compact title="No templates match that search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/agency/communications/templates/${t.id}`}
              className="flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <EmailTemplatePreview blockCount={t.blockCount} />
              <div className="min-w-0 flex-1 space-y-1 p-3">
                <p className="truncate text-body-sm font-semibold text-foreground">{t.name}</p>
                <p className="truncate text-caption text-muted-foreground">{t.subject || "(no subject)"}</p>
                <p className="text-caption text-ink-tertiary">Updated {formatRelativeTime(new Date(t.updatedAtMs))}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
