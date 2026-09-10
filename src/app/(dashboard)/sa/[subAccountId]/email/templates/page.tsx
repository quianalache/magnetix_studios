"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  FileText,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
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
    <div className="momentum-scope mx-auto w-full max-w-5xl space-y-6 rounded-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable starting points for Broadcasts and workflow emails.
          </p>
        </div>
        <Button render={<Link href={saPath("/email/templates/new")} />}>
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>

      {(templates.length > 0 || loading) && (
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="pl-8"
            aria-label="Search email templates"
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState newTemplateHref={saPath("/email/templates/new")} />
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
          No templates match that search.
        </p>
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
    </div>
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
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-primary/50 hover:bg-accent/30">
      <Link href={href} className="flex flex-1 flex-col">
        <TemplatePreview blockCount={template.blockCount} />
        <div className="min-w-0 flex-1 space-y-1 p-3">
          <p className="truncate text-sm font-medium">{template.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {template.subject || "(no subject)"}
          </p>
          <p className="text-[11px] text-muted-foreground">
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

/**
 * Abstract visual preview built purely from the summary's block count — no
 * extra per-card content fetch. Reads as "a designed email," not a generic
 * document icon, without the cost of loading every template's full content
 * just to render a list.
 */
function TemplatePreview({ blockCount }: { blockCount: number }) {
  const bars = Math.max(1, Math.min(blockCount, 5));
  return (
    <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b bg-gradient-to-b from-muted/40 to-muted/10 px-6">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Mail className="h-3 w-3" />
      </div>
      <div className="flex w-full flex-col gap-1 pt-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full bg-foreground/10"
            style={{ width: `${100 - i * 14}%` }}
          />
        ))}
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
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No email templates yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Build a reusable starting point once, then reuse it from any
        broadcast or workflow email — subject, content, and images included.
      </p>
      <div className="mt-6 flex justify-center">
        <Button render={<Link href={newTemplateHref} />}>
          <Plus className="mr-1 h-4 w-4" />
          Build your first template
        </Button>
      </div>
    </div>
  );
}
