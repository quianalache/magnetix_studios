"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ChevronDown, FileText, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseDb } from "@/lib/firebase/client";
import { EmailBlocksEditor } from "@/components/email-authoring/email-blocks-editor";
import { newBlockId } from "@/components/broadcasts/block-editors";
import {
  emailDocumentFromBroadcastContent,
  broadcastContentFromEmailDocument,
  workflowEmailFromDocument,
} from "@/lib/email/adapters";
import { renderEmailHtml } from "@/lib/email/render";
import { SUPPORTED_TAGS_EMAIL } from "@/lib/automations/merge-tags";
import { plainTextToEmailHtml } from "@/lib/automations/workflow-email";
import type { BroadcastContent } from "@/types/broadcast-content";
import type { EmailDocumentRef } from "@/types/email-document";
import type { WorkflowEmailTemplateOption } from "./workflow-email-composer";

/**
 * The "Design Email" workspace for a Workflow Send Email step (Shared Email
 * Foundation Phase 3, 2026-09-09). Authors in the exact same BroadcastContent
 * block model + adapters + shared renderer Broadcasts use — this is the
 * "same underlying Magnetix email designer" in a Workflow context, not a
 * second architecture.
 *
 * Lives inside NodeConfigDialog as an alternate view (not a routed page):
 * the existing builder holds a workflow's whole node tree as in-memory
 * client state with no per-node routing today, and a brand-new step has no
 * durable id yet — inventing page-level navigation for this one step type
 * would be a bigger, riskier departure than the product problem calls for.
 * Nothing unmounts when this opens, so "preserve workflow context" is
 * trivially true. All edits here are LOCAL until the operator presses
 * "Save email design", exactly mirroring the outer dialog's own
 * Save/Cancel contract.
 */
export function WorkflowEmailDesigner({
  saId,
  emailDocumentId,
  initialSubject,
  initialPreheader,
  initialBody,
  initialBodyHtml,
  emailType,
  businessName,
  mailingAddress,
  templates,
  onSave,
  onCancel,
}: {
  saId: string;
  emailDocumentId?: string | null;
  initialSubject: string;
  initialPreheader?: string;
  initialBody: string;
  initialBodyHtml?: string;
  emailType: "marketing" | "transactional";
  businessName: string;
  /** Formatted mailing address, or "" if the sub-account hasn't set one. */
  mailingAddress: string;
  templates: WorkflowEmailTemplateOption[];
  onSave: (patch: {
    emailDocumentId: string;
    subject: string;
    preheader: string;
    body: string;
    bodyHtml: string;
  }) => void;
  onCancel: () => void;
}) {
  const [docId] = useState(() => emailDocumentId || crypto.randomUUID());
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader ?? "");
  const [content, setContent] = useState<BroadcastContent>({
    version: 1,
    blocks: [],
  });
  const [loading, setLoading] = useState(!!emailDocumentId);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  const [tagTarget, setTagTarget] = useState<"subject" | "preheader">(
    "subject"
  );
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

  // Hydrate: an existing designed email loads from its own doc; otherwise
  // adapt whatever legacy/Quick-Compose content this step already has into
  // a single starting Text block so nothing is lost by opening the designer.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (emailDocumentId) {
        try {
          const snap = await getDoc(
            doc(getFirebaseDb(), "emailDocuments", emailDocumentId)
          );
          if (!cancelled && snap.exists()) {
            const ref = snap.data() as EmailDocumentRef;
            setContent(broadcastContentFromEmailDocument(ref.document));
            if (!initialPreheader && ref.document.preheader) {
              setPreheader(ref.document.preheader);
            }
          }
        } catch {
          if (!cancelled) toast.error("Couldn't load the designed email.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      const html =
        initialBodyHtml?.trim() ||
        (initialBody.trim() ? plainTextToEmailHtml(initialBody) : "");
      setContent({
        version: 1,
        blocks: html
          ? [{ id: newBlockId(), type: "text", html }]
          : [],
      });
      setLoading(false);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
    // Only ever run once per mount — this is a local editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query) ||
        t.body.toLowerCase().includes(query)
    );
  }, [templateQuery, templates]);

  function applyTemplate(template: WorkflowEmailTemplateOption) {
    const hasContent =
      subject.trim() || content.blocks.length > 0;
    if (
      hasContent &&
      !window.confirm(
        "Using another template will replace the email content you've designed in this step."
      )
    ) {
      return;
    }
    // Unified Email Templates (2026-09-10): `template.content` already
    // carries the template's real blocks, whether it's a from-scratch
    // visual template or a legacy plain one adapted to a single Text
    // block — either way this is a genuine copy; editing it here never
    // touches the saved template.
    setContent(template.content);
    setSubject(template.subject);
    setPreheader(template.preheader ?? "");
    setShowTemplates(false);
    setTemplateQuery("");
  }

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
      return renderEmailHtml(previewDocument, {
        businessName,
        mailingAddress,
        unsubscribeUrl: "https://example.com/unsubscribe",
        includeComplianceFooter: emailType === "marketing",
      });
    } catch {
      return "";
    }
  }, [previewDocument, businessName, mailingAddress, emailType]);

  async function handleSave() {
    setSaving(true);
    try {
      const document = emailDocumentFromBroadcastContent(
        content,
        subject,
        preheader
      );
      const res = await fetch("/api/email-documents/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: docId, subAccountId: saId, document }),
      });
      if (!res.ok) throw new Error();
      const { body, bodyHtml } = workflowEmailFromDocument(document);
      onSave({
        emailDocumentId: docId,
        subject,
        preheader,
        body,
        bodyHtml: bodyHtml ?? "",
      });
    } catch {
      toast.error("Couldn't save this email design. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        Loading email…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Editing the email for this Send Email step — not a shared template.
      </p>

      <div className="bg-muted/20 flex items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Start from a saved template</p>
          <p className="text-muted-foreground text-xs">
            Copies that template&rsquo;s content in — editing it here never
            changes the saved template.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTemplates((o) => !o)}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Start from template
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
      {showTemplates && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
            <Input
              value={templateQuery}
              onChange={(e) => setTemplateQuery(e.target.value)}
              placeholder="Search email templates…"
              className="pl-8"
              aria-label="Search email templates"
            />
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {filteredTemplates.length ? (
              filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="hover:bg-muted/60 bg-background w-full rounded-md border p-2 text-left"
                >
                  <span className="block truncate text-sm font-medium">
                    {t.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {t.subject || t.body.slice(0, 90)}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-muted-foreground px-1 py-2 text-xs">
                No email templates found for this workspace.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="design-email-subject">Subject</Label>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setTagTarget("subject");
                setTagMenuOpen((o) => !o);
              }}
            >
              <Sparkles className="h-3 w-3" /> Insert personalization
            </Button>
            {tagMenuOpen && tagTarget === "subject" && (
              <TagMenu onInsert={insertTag} />
            )}
          </div>
        </div>
        <Input
          id="design-email-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Welcome, {{contact.firstName}}"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="design-email-preheader">Preheader</Label>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setTagTarget("preheader");
                setTagMenuOpen((o) => !o);
              }}
            >
              <Sparkles className="h-3 w-3" /> Insert personalization
            </Button>
            {tagMenuOpen && tagTarget === "preheader" && (
              <TagMenu onInsert={insertTag} />
            )}
          </div>
        </div>
        <Input
          id="design-email-preheader"
          value={preheader}
          onChange={(e) => setPreheader(e.target.value)}
          placeholder="Shown next to the subject in most inboxes (optional)"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Content</Label>
        <p className="text-muted-foreground text-[11px]">
          Type personalization tags like <code>{"{{contact.firstName}}"}</code>{" "}
          directly into text, button labels, or alt text.
        </p>
        <EmailBlocksEditor
          blocks={content.blocks}
          onChange={(blocks) => setContent({ version: 1, blocks })}
          saId={saId}
          draftId={docId}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Preview</Label>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={previewHtml}
          className="h-80 w-full rounded-md border bg-white"
        />
      </div>

      <div className="mt-auto flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save email design"}
        </Button>
      </div>
    </div>
  );
}

function TagMenu({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
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
  );
}
