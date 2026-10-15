"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import type { EmailTemplateSummary } from "@/lib/email/template-library";
import { EmailTemplatePreview } from "@/components/broadcasts/email-template-preview";

/**
 * Email Template Library card + its Rename / Delete dialogs — shared by the
 * sub-account Email Templates library and Agency → Communications → Email
 * Templates (parity pass). The page owns the data and passes scope-specific
 * callbacks (tenant template-library.ts vs the owner-only agency API), so
 * neither scope's storage or access rules change.
 */
export function TemplateLibraryCard({
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
          <p className="truncate text-caption text-muted-foreground">{template.subject || "(no subject)"}</p>
          <p className="text-caption text-ink-tertiary">Updated {formatRelativeTime(new Date(template.updatedAtMs))}</p>
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                // Hover-revealed on pointer devices; always visible on touch
                // screens (no hover there, so it would otherwise be unreachable).
                className="size-8 shrink-0 rounded-md bg-background/80 p-0 opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label={`Actions for ${template.name}`}
              >
                {duplicating ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate} disabled={duplicating}>
              <Copy className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function RenameTemplateDialog({
  template,
  onOpenChange,
  onRename,
}: {
  template: EmailTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
  /** Persist the new name; throw to keep the dialog open with an error toast. */
  onRename: (template: EmailTemplateSummary, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!template || !name.trim()) return;
    setSaving(true);
    try {
      await onRename(template, name.trim());
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
          <Input id="rename-template-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTemplateDialog({
  template,
  onOpenChange,
  onDelete,
  description,
}: {
  template: EmailTemplateSummary | null;
  onOpenChange: (open: boolean) => void;
  /** Remove the template; throw to keep the dialog open with an error toast. */
  onDelete: (template: EmailTemplateSummary) => Promise<void>;
  /** What else is (not) affected — differs per scope. */
  description: string;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!template) return;
    setDeleting(true);
    try {
      await onDelete(template);
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
            &quot;{template?.name || "Untitled email template"}&quot; {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="size-3.5 animate-spin" />}
            Delete template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
