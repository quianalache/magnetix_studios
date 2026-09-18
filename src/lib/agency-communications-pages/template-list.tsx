"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Mail, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import type { EmailTemplateSummary } from "@/lib/email/template-library";

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
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">Communications is managed by the agency owner.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link href="/agency/communications" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Communications
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-sm text-muted-foreground">Reusable starting points for Magnetix Studios broadcasts.</p>
        </div>
        <Link href="/agency/communications/templates/new">
          <Button>
            <Plus className="mr-1 h-4 w-4" /> New template
          </Button>
        </Link>
      </div>

      {(templates.length > 0 || loading) && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…" className="pl-8" aria-label="Search email templates" />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">No templates match that search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link key={t.id} href={`/agency/communications/templates/${t.id}`} className="flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-primary/50 hover:bg-accent/30">
              <TemplatePreview blockCount={t.blockCount} />
              <div className="min-w-0 flex-1 space-y-1 p-3">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.subject || "(no subject)"}</p>
                <p className="text-[11px] text-muted-foreground">Updated {formatRelativeTime(new Date(t.updatedAtMs))}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ blockCount }: { blockCount: number }) {
  const bars = Math.max(1, Math.min(blockCount, 5));
  return (
    <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b bg-gradient-to-b from-muted/40 to-muted/10 px-6">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Mail className="h-3 w-3" />
      </div>
      <div className="flex w-full flex-col gap-1 pt-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="h-1.5 rounded-full bg-foreground/10" style={{ width: `${100 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No email templates yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Build a reusable starting point once, then reuse it from any broadcast.</p>
      <div className="mt-6 flex justify-center">
        <Link href="/agency/communications/templates/new">
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Build your first template
          </Button>
        </Link>
      </div>
    </div>
  );
}
