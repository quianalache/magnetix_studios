"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  loadEmailTemplate,
  renameEmailTemplate,
  type EmailTemplateSummary,
} from "@/lib/email/template-library";
import { useEmailTemplateList } from "@/hooks/use-email-template-list";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailTemplatePreview } from "@/components/broadcasts/email-template-preview";
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
            <TemplateCard
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

      <RenameDialog
        template={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
      />
      <DeleteDialog
        template={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </PageShell>
  );
}

function TemplateCard({
  template,
  href,
  duplicating,
  onDuplicate,
  onRename,
  onDelete,
}: {
  template: EmailTemplateSummary;
  href: string;
  duplicating: boolean;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop">
      <Link href={href} className="flex flex-1 flex-col outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <EmailTemplatePreview blockCount={template.blockCount} />
        <div className="min-w-0 flex-1 space-y-1 p-3">
          <p className="truncate text-body-sm font-semibold text-foreground">{template.name}</p>
          <p className="truncate text-caption text-muted-foreground">
            {template.subject || "(no subject)"}
          </p>
          <p className="text-caption text-ink-tertiary">
            Updated {formatRelativeTime(new Date(template.updatedAtMs))}
          </p>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 rounded-md bg-background/80 p-0 opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100 data-popup-open:opacity-100"
                aria-label="Template actions"
              >
                {duplicating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate} disabled={duplicating}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function RenameDialog({
  template,
  onOpenChange,
}: {
  template: EmailTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!template || !name.trim()) return;
    setSaving(true);
    try {
      await renameEmailTemplate(template.id, template.source, name.trim());
      toast.success("Template renamed");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't rename this template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!template}
      onOpenChange={(open) => {
        if (open && template) setName(template.name);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-template-name">Template name</Label>
          <Input
            id="rename-template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  template,
  onOpenChange,
}: {
  template: EmailTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!template) return;
    setDeleting(true);
    try {
      await deleteEmailTemplate(template.id, template.source);
      toast.success("Template deleted");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't delete this template.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this template?</DialogTitle>
          <DialogDescription>
            &quot;{template?.name || "Untitled email template"}&quot; will be
            removed from the Email Template Library. Broadcasts or workflow
            emails that already copied it are unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Delete template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
