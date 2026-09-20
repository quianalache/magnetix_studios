"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Eye,
  FileText,
  FlaskConical,
  Loader2,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
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
import { documentHasIncompleteBlock, firstIncompleteBlockId } from "@/components/email-authoring/builder/block-factory";
import {
  EmailTemplatePickerDialog,
  type PickedEmailTemplate,
} from "@/components/email-authoring/email-template-picker-dialog";
import { SaveAsTemplateDialog } from "@/components/email-authoring/save-as-template-dialog";
import { AgencyAudiencePicker } from "@/components/agency-communications/agency-audience-picker";
import type {
  AgencyAudienceSource,
  AgencyCommunicationDoc,
} from "@/types/agency-communications";
import type { BroadcastContent } from "@/types/broadcast-content";

const LARGE_AUDIENCE_THRESHOLD = 100;
const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Agency Communications composer — the agency-scope sibling of
 * BroadcastComposer, reusing its block editor/preview/test-send/draft-
 * autosave/send-confirmation UI verbatim. Two deliberate differences: (1)
 * fetch-based instead of `useSubAccount()`/client Firestore, matching
 * every other agency-owner surface; (2) `AgencyAudiencePicker` instead of
 * `AudienceConditionBuilder` — a real Contact segmentation engine has
 * nothing to reuse here (Agency audiences are a small, enumerable set of
 * real sources, not a Contact filter), so there's no Test Mode/test-
 * recipient search either (that requires a client-side contact list this
 * scope has no equivalent of) — Test Send (one address) still covers
 * "verify the render before a real send."
 */
export function AgencyBroadcastComposer({ existingCommunicationId }: { existingCommunicationId?: string }) {
  const { user, agencyId, agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();

  const [draftId] = useState(() => existingCommunicationId ?? crypto.randomUUID());
  const [hydrating, setHydrating] = useState(!!existingCommunicationId);
  const [hasPersistedDraft, setHasPersistedDraft] = useState(!!existingCommunicationId);

  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [content, setContent] = useState<BroadcastContent>({ version: 1, blocks: [] });
  const [audienceSources, setAudienceSources] = useState<AgencyAudienceSource[]>([]);
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [jumpToBlockId, setJumpToBlockId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const [audiencePreview, setAudiencePreview] = useState({ recipients: 0, skipped: 0 });
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTypedText, setConfirmTypedText] = useState("");
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testSendEmail, setTestSendEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const sessionIdRef = useRef(crypto.randomUUID());
  const clientSeqRef = useRef(0);

  useEffect(() => {
    if (!existingCommunicationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agency/communications/${existingCommunicationId}`);
        if (cancelled) return;
        if (!res.ok) {
          toast.error("That draft no longer exists.");
          router.replace("/agency/communications/broadcasts");
          return;
        }
        const data = (await res.json()) as { communication?: AgencyCommunicationDoc };
        const c = data.communication;
        if (!c) {
          toast.error("That draft no longer exists.");
          router.replace("/agency/communications/broadcasts");
          return;
        }
        if (c.status !== "draft") {
          toast.message("This communication has already been sent.");
          router.replace(`/agency/communications/broadcasts/${existingCommunicationId}`);
          return;
        }
        setSubject(c.subject ?? "");
        setPreheader(c.preheader ?? "");
        setContent(c.content ?? { version: 1, blocks: [] });
        setAudienceSources(c.audienceSources ?? []);
        setSourceTemplateId(c.sourceTemplateId ?? null);
        setHasPersistedDraft(true);
      } catch {
        toast.error("Couldn't load this draft. Try again.");
        router.replace("/agency/communications/broadcasts");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCommunicationId]);

  useEffect(() => {
    if (user?.email) setTestSendEmail((prev) => prev || user.email!);
  }, [user?.email]);

  useEffect(() => {
    if (audienceSources.length === 0) {
      setAudiencePreview({ recipients: 0, skipped: 0 });
      return;
    }
    const handle = setTimeout(async () => {
      setAudienceLoading(true);
      try {
        const res = await fetch("/api/agency/communications/audience/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ audienceSources }),
        });
        const data = (await res.json()) as { recipients?: number; skipped?: number };
        setAudiencePreview({ recipients: data.recipients ?? 0, skipped: data.skipped ?? 0 });
      } catch {
        // Best-effort — a network hiccup shouldn't block composing.
      } finally {
        setAudienceLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [audienceSources]);

  const requiresTypedConfirm = audiencePreview.recipients >= LARGE_AUDIENCE_THRESHOLD;

  // On-demand preview (task instruction 8) — the Preview modal calls this
  // the moment it opens, returning the exact same renderer output the real
  // send uses.
  const getPreviewHtml = useCallback(async () => {
    const res = await fetch("/api/agency/communications/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, preheader, content }),
    });
    const data = (await res.json()) as { html?: string; error?: string };
    if (!res.ok || !data.html) throw new Error(data.error ?? "Preview failed to load");
    return data.html;
  }, [subject, preheader, content]);

  // Strict Send validation (task instruction 10/11) — see the matching
  // comment in broadcast-composer.tsx.
  function blockIfIncomplete(): boolean {
    if (!documentHasIncompleteBlock(content.blocks)) return true;
    const id = firstIncompleteBlockId(content.blocks);
    setJumpToBlockId(id);
    toast.error("This email has an incomplete block — finish it before sending.");
    return false;
  }

  const canSend =
    !!subject.trim() &&
    content.blocks.length > 0 &&
    audienceSources.length > 0 &&
    audiencePreview.recipients > 0 &&
    !sending;
  const hasMeaningfulContent = !!subject.trim() || content.blocks.length > 0 || audienceSources.length > 0;

  const saveDraftNow = useCallback(async () => {
    if (!hasPersistedDraft && !hasMeaningfulContent) return;
    clientSeqRef.current += 1;
    const seq = clientSeqRef.current;
    setSaveState("saving");
    try {
      const res = await fetch("/api/agency/communications/draft/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          communicationId: draftId,
          subject,
          preheader: preheader || null,
          content,
          audienceSources,
          sourceTemplateId,
          sessionId: sessionIdRef.current,
          clientSeq: seq,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; ignored?: string; created?: boolean };
      if (!res.ok || !data.ok) {
        setSaveState("error");
        return;
      }
      if (data.ignored === "stale") return;
      setHasPersistedDraft(true);
      setSaveState("saved");
      if (data.created && !existingCommunicationId) {
        window.history.replaceState(null, "", `/agency/communications/broadcasts/${draftId}/edit`);
      }
    } catch {
      setSaveState("error");
    }
  }, [hasPersistedDraft, hasMeaningfulContent, draftId, existingCommunicationId, subject, preheader, content, audienceSources, sourceTemplateId]);

  useEffect(() => {
    if (hydrating) return;
    if (!hasPersistedDraft && !hasMeaningfulContent) return;
    const handle = setTimeout(() => {
      saveDraftNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating, subject, preheader, content, audienceSources]);

  function openConfirm() {
    if (!canSend) return;
    if (!blockIfIncomplete()) return;
    setConfirmTypedText("");
    setConfirmOpen(true);
  }

  async function handleSend() {
    const confirmedAudienceSize = audiencePreview.recipients;
    setSending(true);
    try {
      const res = await fetch("/api/agency/communications/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          subject: subject.trim(),
          preheader: preheader.trim() || null,
          audienceSources,
          sourceTemplateId,
          confirmedAudienceSize,
          draftId: hasPersistedDraft ? draftId : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        communicationId?: string;
        queued?: number;
        skipped?: number;
        error?: string;
        code?: string;
        currentAudienceSize?: number;
      };
      if (!res.ok || !data.ok || !data.communicationId) {
        if (data.code === "AUDIENCE_CHANGED") {
          toast.error(`${data.error ?? "Audience changed."} Review the updated count and send again.`);
          setConfirmOpen(false);
          return;
        }
        toast.error(data.error ?? "Couldn't send. Try again.");
        return;
      }
      toast.success(`Communication queued — ${data.queued ?? 0} recipients${data.skipped ? ` (${data.skipped} skipped)` : ""}`);
      setConfirmOpen(false);
      router.push(`/agency/communications/broadcasts/${data.communicationId}`);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleTestSend() {
    const email = testSendEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (!blockIfIncomplete()) return;
    setTestSending(true);
    try {
      const res = await fetch("/api/agency/communications/test-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, subject: subject.trim(), preheader: preheader.trim() || null, testEmail: email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Test send failed.");
        return;
      }
      toast.success(`Test email sent to ${email}.`);
      setTestSendOpen(false);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setTestSending(false);
    }
  }

  async function handleConfirmSaveTemplate(name: string) {
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/agency/email-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, subject: subject.trim(), preheader: preheader.trim() || null, content }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved to your Email Templates.");
      setSaveTemplateOpen(false);
    } catch {
      toast.error("Couldn't save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  function handlePickTemplate(t: PickedEmailTemplate) {
    setSubject(t.subject);
    setPreheader(t.preheader ?? "");
    setContent(t.content);
    setSourceTemplateId(t.id);
  }

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Communications is managed by the agency owner.
      </div>
    );
  }
  // `agencyId` resolves from the same auth claims `agencyRole` already did,
  // so this should never actually be true once `isOwner` is — but the
  // shared Email Builder's `EmailBuilderScope` must never receive an empty
  // placeholder id (see upload-image.ts's doc comment), so this composer
  // treats a still-unresolved agencyId as an extension of the loading
  // state rather than constructing an invalid scope object.
  if (!agencyId) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    );
  }
  if (hydrating) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/agency/communications/broadcasts"
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Broadcasts
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {existingCommunicationId ? "Edit draft" : "New communication"}
            </h1>
            <SaveStateIndicator state={saveState} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={saveDraftNow} disabled={saveState === "saving"}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save draft
          </Button>
          <Button type="button" variant="outline" onClick={() => setTemplatePickerOpen(true)}>
            <FileText className="mr-1 h-4 w-4" /> Load template
          </Button>
          <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(true)} disabled={content.blocks.length === 0}>
            <Save className="mr-1 h-4 w-4" /> Save as template
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-1 h-4 w-4" /> Preview
          </Button>
          <Button type="button" variant="outline" onClick={() => setTestSendOpen(true)} disabled={content.blocks.length === 0 || !subject.trim()}>
            <FlaskConical className="mr-1 h-4 w-4" /> Test Send
          </Button>
          <Button type="button" onClick={openConfirm} disabled={!canSend}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Send to {audiencePreview.recipients}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Recipients — Agency's existing single-page audience workflow,
            unchanged (task instruction 12's "reuse existing data/workflow"
            escape hatch — see the matching comment in broadcast-composer.tsx). */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Recipients</h2>
          <AgencyAudiencePicker value={audienceSources} onChange={setAudienceSources} />
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            {audienceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>
              Will email <span className="font-mono font-semibold text-foreground">{audiencePreview.recipients}</span> recipient
              {audiencePreview.recipients === 1 ? "" : "s"}
              {audiencePreview.skipped > 0 ? ` (${audiencePreview.skipped} opted out, skipped)` : ""}.
            </span>
          </div>
        </div>

        {/* Content — the SAME shared visual Email Builder Tenant Broadcasts
            uses (task's standing shared-first rule). `agencyId` here is a
            client-side dispatch marker only — the upload route re-derives
            the real agencyId from verified auth claims regardless (see
            upload-image.ts's EmailBuilderScope doc comment). */}
        <EmailBuilder
          content={content}
          onChange={setContent}
          subject={subject}
          preheader={preheader}
          onSubjectChange={setSubject}
          onPreheaderChange={setPreheader}
          scope={{ kind: "agency", agencyId }}
          draftId={draftId}
          getPreviewHtml={getPreviewHtml}
          previewOpen={previewOpen}
          onPreviewOpenChange={setPreviewOpen}
          jumpToBlockId={jumpToBlockId}
        />
      </div>

      <EmailTemplatePickerDialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} subAccountId="agency" onPick={handlePickTemplate} />
      <SaveAsTemplateDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} defaultName={subject} saving={savingTemplate} onSave={handleConfirmSaveTemplate} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send this communication?</DialogTitle>
            <DialogDescription>This sends immediately. Review the audience before confirming.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Will receive email</span>
                <span className="font-mono text-lg font-semibold">{audiencePreview.recipients}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Skipped (opted out)</span>
                <span className="font-mono">{audiencePreview.skipped}</span>
              </div>
            </div>
            {requiresTypedConfirm && (
              <div className="space-y-1.5">
                <label htmlFor="confirm-send-text" className="text-xs">
                  Type <span className="font-mono font-semibold">SEND</span> to confirm this {audiencePreview.recipients}-recipient send:
                </label>
                <Input id="confirm-send-text" value={confirmTypedText} onChange={(e) => setConfirmTypedText(e.target.value)} placeholder="SEND" className="font-mono" autoComplete="off" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSend} disabled={sending || (requiresTypedConfirm && confirmTypedText.trim() !== "SEND")}>
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Confirm &amp; Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testSendOpen} onOpenChange={setTestSendOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>Sends the exact rendered email to one address. Doesn&apos;t create a communication or affect any recipient list.</DialogDescription>
          </DialogHeader>
          <Input type="email" placeholder="you@example.com" value={testSendEmail} onChange={(e) => setTestSendEmail(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestSendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleTestSend} disabled={testSending}>
              {testSending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveStateIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CloudUpload className="h-3 w-3 animate-pulse" /> Saving…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <TriangleAlert className="h-3 w-3" /> Couldn&apos;t save
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3" /> Saved
    </span>
  );
}
