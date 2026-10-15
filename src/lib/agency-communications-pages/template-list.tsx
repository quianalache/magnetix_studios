"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

import type { EmailTemplateSummary } from "@/lib/email/template-library";
import { Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SearchField } from "@/components/system/search-field";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { DeleteTemplateDialog, RenameTemplateDialog, TemplateLibraryCard } from "@/components/email-authoring/template-library-card";
import type { BroadcastContent } from "@/types/broadcast-content";

/** Agency Email Template Library — the agency-scope sibling of the tenant
 *  Email Template Library, fetch-based against /api/agency/email-templates. */
export default function AgencyEmailTemplateLibraryPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<EmailTemplateSummary | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplateSummary | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/agency/email-templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates?: EmailTemplateSummary[] } | null) => setTemplates(d?.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOwner) load();
  }, [isOwner, load]);

  // Card actions (parity with the sub-account library) — all through the
  // existing owner-only, agency-scoped /api/agency/email-templates routes.
  async function loadFull(id: string): Promise<FullTemplate> {
    const res = await fetch(`/api/agency/email-templates/${id}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { template?: FullTemplate };
    if (!res.ok || !data.template) throw new Error("load failed");
    return data.template;
  }

  async function handleRename(t: EmailTemplateSummary, name: string) {
    const full = await loadFull(t.id);
    const res = await fetch(`/api/agency/email-templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, subject: full.subject, preheader: full.preheader ?? null, content: full.content }),
    });
    if (!res.ok) throw new Error("rename failed");
    load();
  }

  async function handleDuplicate(t: EmailTemplateSummary) {
    setDuplicatingId(t.id);
    try {
      const full = await loadFull(t.id);
      const res = await fetch("/api/agency/email-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${full.name} (copy)`.trim(), subject: full.subject, preheader: full.preheader ?? null, content: full.content }),
      });
      if (!res.ok) throw new Error("duplicate failed");
      toast.success("Template duplicated");
      load();
    } catch {
      toast.error("Couldn't duplicate this template.");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(t: EmailTemplateSummary) {
    const res = await fetch(`/api/agency/email-templates/${t.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    load();
  }

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
            <TemplateLibraryCard
              key={t.id}
              template={t}
              href={`/agency/communications/templates/${t.id}`}
              duplicating={duplicatingId === t.id}
              onDuplicate={() => handleDuplicate(t)}
              onRename={() => setRenaming(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      )}

      <RenameTemplateDialog template={renaming} onOpenChange={(open) => !open && setRenaming(null)} onRename={handleRename} />
      <DeleteTemplateDialog
        template={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDelete={handleDelete}
        description="will be removed. Broadcasts that already copied it are unaffected."
      />
    </PageShell>
  );
}

type FullTemplate = { name: string; subject: string; preheader: string | null; content: BroadcastContent };
