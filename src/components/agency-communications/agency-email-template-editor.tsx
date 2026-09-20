"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmailBuilder } from "@/components/email-authoring/builder/email-builder";
import { emailDocumentFromBroadcastContent } from "@/lib/email/adapters";
import { renderEmailHtml } from "@/lib/email/render";
import type { BroadcastContent } from "@/types/broadcast-content";

/**
 * Agency Email Template create/edit surface — the agency-scope sibling of
 * EmailTemplateEditor, reusing the exact same shared visual Email Builder
 * (task's standing shared-first rule). Fetch-based CRUD against
 * /api/agency/email-templates instead of the tenant client-Firestore
 * template-library.ts functions. No personalization-tag menu — merge
 * tags target a tenant Contact, which has no Agency equivalent.
 */
export function AgencyEmailTemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [uploadScopeId] = useState(() => templateId ?? crypto.randomUUID());
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [content, setContent] = useState<BroadcastContent>({ version: 1, blocks: [] });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/agency/email-templates/${templateId}`);
      if (cancelled) return;
      if (!res.ok) {
        toast.error("That template no longer exists.");
        router.replace("/agency/communications/templates");
        return;
      }
      const data = (await res.json()) as { template?: { name: string; subject: string; preheader: string | null; content: BroadcastContent } };
      const t = data.template;
      if (!t) {
        toast.error("That template no longer exists.");
        router.replace("/agency/communications/templates");
        return;
      }
      setName(t.name);
      setSubject(t.subject);
      setPreheader(t.preheader ?? "");
      setContent(t.content);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const getPreviewHtml = useCallback(async () => {
    const document = emailDocumentFromBroadcastContent(content, subject, preheader);
    return renderEmailHtml(document, { allowIncomplete: true });
  }, [content, subject, preheader]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give this template a name first.");
      return;
    }
    setSaving(true);
    try {
      if (templateId) {
        const res = await fetch(`/api/agency/email-templates/${templateId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, subject, preheader: preheader || null, content }),
        });
        if (!res.ok) throw new Error();
        toast.success("Template saved");
      } else {
        const res = await fetch("/api/agency/email-templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, subject, preheader: preheader || null, content }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
        if (!res.ok || !data.ok || !data.id) throw new Error();
        toast.success("Template created");
        router.replace(`/agency/communications/templates/${data.id}`);
      }
    } catch {
      toast.error("Couldn't save this template. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!templateId) return;
    setDuplicating(true);
    try {
      const res = await fetch("/api/agency/email-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${name} (copy)`.trim(), subject, preheader: preheader || null, content }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
      if (!res.ok || !data.ok || !data.id) throw new Error();
      toast.success("Template duplicated");
      router.push(`/agency/communications/templates/${data.id}`);
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
      await fetch(`/api/agency/email-templates/${templateId}`, { method: "DELETE" });
      toast.success("Template deleted");
      router.push("/agency/communications/templates");
    } catch {
      toast.error("Couldn't delete this template.");
      setDeleting(false);
    }
  }

  if (authLoading) return null;
  if (!isOwner) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Communications is managed by the agency owner.</div>;
  }
  if (loading) {
    return <div className="mx-auto w-full max-w-3xl py-16 text-center text-sm text-muted-foreground">Loading template…</div>;
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
          {templateId && <p className="text-xs text-muted-foreground">Magnetix Email Template</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {templateId && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
                {duplicating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                Duplicate
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {templateId ? "Save" : "Create template"}
          </Button>
        </div>
      </div>

      {/* The SAME shared visual Email Builder every other authoring surface
          uses (task's standing shared-first rule). */}
      <EmailBuilder
        content={content}
        onChange={setContent}
        subject={subject}
        preheader={preheader}
        onSubjectChange={setSubject}
        onPreheaderChange={setPreheader}
        saId="agency"
        draftId={uploadScopeId}
        getPreviewHtml={getPreviewHtml}
        previewOpen={previewOpen}
        onPreviewOpenChange={setPreviewOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this template?</DialogTitle>
            <DialogDescription>&quot;{name || "Untitled email template"}&quot; will be removed. Broadcasts that already copied it are unaffected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
