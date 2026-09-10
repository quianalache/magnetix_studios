"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Copy, Eye, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
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
import { EmailBlocksEditor } from "@/components/email-authoring/email-blocks-editor";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  loadEmailTemplate,
  saveEmailTemplate,
  type EmailTemplateSource,
} from "@/lib/email/template-library";
import { emailDocumentFromBroadcastContent } from "@/lib/email/adapters";
import { renderEmailHtml } from "@/lib/email/render";
import { SUPPORTED_TAGS_EMAIL } from "@/lib/automations/merge-tags";
import type { BroadcastContent } from "@/types/broadcast-content";

/**
 * Standalone Email Template create/edit surface — the shared visual
 * EmailDocument designer (same block components Broadcast and Workflow
 * Design Email use), given its own page instead of being embedded in a
 * step dialog. A brand-new, unsimple email is still just an Email Template:
 * there's no separate "simple" authoring mode here.
 */
export function EmailTemplateEditor({
  templateId,
}: {
  /** Absent for a brand-new, unsaved template. */
  templateId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { agencyId, subAccountId, saPath } = useSubAccount();
  const uid = user?.uid ?? "";
  const [uploadScopeId] = useState(() => templateId ?? crypto.randomUUID());
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<EmailTemplateSource>("visual");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [content, setContent] = useState<BroadcastContent>({
    version: 1,
    blocks: [],
  });
  const [tagTarget, setTagTarget] = useState<"subject" | "preheader">(
    "subject"
  );
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const requestedSource = searchParams.get("source");
  const sourceHint: EmailTemplateSource | undefined =
    requestedSource === "legacy" || requestedSource === "visual"
      ? requestedSource
      : undefined;

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const loaded = await loadEmailTemplate(templateId, sourceHint);
      if (cancelled) return;
      if (!loaded) {
        toast.error("That template no longer exists.");
        router.replace(saPath("/email/templates"));
        return;
      }
      setSource(loaded.source);
      setName(loaded.name);
      setSubject(loaded.subject);
      setPreheader(loaded.preheader ?? "");
      setContent(loaded.content);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, sourceHint]);

  function insertTag(tag: string) {
    const token = "{{" + tag + "}}";
    if (tagTarget === "subject") setSubject((s) => s + token);
    else setPreheader((s) => s + token);
    setTagMenuOpen(false);
  }

  const previewDocument = useMemo(
    () => emailDocumentFromBroadcastContent(content, subject, preheader),
    [content, subject, preheader]
  );
  const previewHtml = useMemo(() => {
    try {
      return renderEmailHtml(previewDocument, {});
    } catch {
      return "";
    }
  }, [previewDocument]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give this template a name first.");
      return;
    }
    if (!agencyId) return;
    setSaving(true);
    try {
      if (templateId) {
        await saveEmailTemplate({
          id: templateId,
          source,
          name,
          subject,
          preheader: preheader || null,
          content,
        });
        toast.success("Template saved");
      } else {
        const id = await createEmailTemplate({
          agencyId,
          subAccountId,
          createdByUid: uid,
          name,
          subject,
          preheader: preheader || null,
          content,
        });
        toast.success("Template created");
        router.replace(saPath(`/email/templates/${id}`));
      }
    } catch {
      toast.error("Couldn't save this template. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!templateId || !agencyId) return;
    setDuplicating(true);
    try {
      const newId = await duplicateEmailTemplate({
        agencyId,
        subAccountId,
        createdByUid: uid,
        template: { source, name, subject, preheader: preheader || null, content },
      });
      toast.success("Template duplicated");
      router.push(saPath(`/email/templates/${newId}`));
    } catch {
      toast.error("Couldn't duplicate this template.");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!templateId) return;
    setDeleting(true);
    try {
      await deleteEmailTemplate(templateId, source);
      toast.success("Template deleted");
      router.push(saPath("/email/templates"));
    } catch {
      toast.error("Couldn't delete this template.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl py-16 text-center text-sm text-muted-foreground">
        Loading template…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled email template"
            className="h-auto border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />
          {templateId && (
            <p className="text-xs text-muted-foreground">
              {source === "legacy"
                ? "Originally a simple template — now editable here like any other."
                : "Email Template"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {templateId && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicating}
              >
                {duplicating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Duplicate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {templateId ? "Save" : "Create template"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="et-subject">Subject</Label>
              <TagButton
                open={tagMenuOpen && tagTarget === "subject"}
                onToggle={() => {
                  setTagTarget("subject");
                  setTagMenuOpen((o) => !o || tagTarget !== "subject");
                }}
                onInsert={insertTag}
              />
            </div>
            <Input
              id="et-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Welcome, {{contact.firstName}}"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="et-preheader">Preheader</Label>
              <TagButton
                open={tagMenuOpen && tagTarget === "preheader"}
                onToggle={() => {
                  setTagTarget("preheader");
                  setTagMenuOpen((o) => !o || tagTarget !== "preheader");
                }}
                onInsert={insertTag}
              />
            </div>
            <Input
              id="et-preheader"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="Shown next to the subject in most inboxes (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Content</Label>
            <p className="text-[11px] text-muted-foreground">
              Type personalization tags like <code>{"{{contact.firstName}}"}</code>{" "}
              directly into text, button labels, or alt text.
            </p>
            <EmailBlocksEditor
              blocks={content.blocks}
              onChange={(blocks) => setContent({ version: 1, blocks })}
              saId={subAccountId}
              draftId={uploadScopeId}
            />
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <iframe
              title="Email template preview"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[600px] w-full bg-white"
            />
          </div>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this template?</DialogTitle>
            <DialogDescription>
              &quot;{name || "Untitled email template"}&quot; will be removed
              from the Email Template Library. Broadcasts or workflow emails
              that already copied it are unaffected — this only deletes the
              template itself.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
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
    </div>
  );
}

function TagButton({
  open,
  onToggle,
  onInsert,
}: {
  open: boolean;
  onToggle: () => void;
  onInsert: (tag: string) => void;
}) {
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={onToggle}
      >
        <Sparkles className="h-3 w-3" /> Insert personalization
      </Button>
      {open && (
        <div className="bg-popover absolute right-0 z-10 mt-1 w-72 rounded-md border p-1 shadow-md">
          {SUPPORTED_TAGS_EMAIL.map((tag) => (
            <button
              key={tag.tag}
              type="button"
              className="hover:bg-muted w-full rounded px-2 py-1.5 text-left"
              onClick={() => onInsert(tag.tag)}
            >
              <span className="block text-xs font-medium">{tag.description}</span>
              <code className="text-muted-foreground text-[10px]">
                {"{{" + tag.tag + "}}"}
              </code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
