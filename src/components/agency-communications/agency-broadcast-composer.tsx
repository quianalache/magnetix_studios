"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  ArrowLeft,
  Check,
  CloudUpload,
  FileText,
  FlaskConical,
  GripVertical,
  ImageIcon,
  Loader2,
  MousePointerClick,
  Minus,
  Columns2,
  Plus,
  Save,
  Send,
  TriangleAlert,
  Video,
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
import { TextBlockEditor } from "@/components/broadcasts/text-block-editor";
import {
  ImageBlockEditor,
  VideoBlockEditor,
  ButtonBlockEditor,
  ColumnsBlockEditor,
  newBlockId,
} from "@/components/broadcasts/block-editors";
import {
  EmailTemplatePickerDialog,
  type PickedEmailTemplate,
} from "@/components/email-authoring/email-template-picker-dialog";
import { SaveAsTemplateDialog } from "@/components/email-authoring/save-as-template-dialog";
import { AgencyAudiencePicker } from "@/components/agency-communications/agency-audience-picker";
import { cn } from "@/lib/utils";
import type {
  AgencyAudienceSource,
  AgencyCommunicationDoc,
} from "@/types/agency-communications";
import type { BroadcastContent, EmailBlock } from "@/types/broadcast-content";

const LARGE_AUDIENCE_THRESHOLD = 100;
const AUTOSAVE_DEBOUNCE_MS = 1500;

const BLOCK_LABELS: Record<EmailBlock["type"], { label: string; icon: typeof FileText }> = {
  text: { label: "Text", icon: AlignLeft },
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  button: { label: "Button", icon: MousePointerClick },
  divider: { label: "Divider", icon: Minus },
  columns: { label: "Columns", icon: Columns2 },
};

function newBlock(type: EmailBlock["type"]): EmailBlock {
  switch (type) {
    case "text":
      return { id: newBlockId(), type: "text", html: "<p></p>" };
    case "image":
      return { id: newBlockId(), type: "image", src: "", alt: "" };
    case "video":
      return { id: newBlockId(), type: "video", videoUrl: "", thumbnailSrc: "", alt: "" };
    case "button":
      return { id: newBlockId(), type: "button", label: "Click here", href: "" };
    case "divider":
      return { id: newBlockId(), type: "divider" };
    case "columns":
      return {
        id: newBlockId(),
        type: "columns",
        columns: [
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
        ],
      };
  }
}

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
  const { user, agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();

  const [draftId] = useState(() => existingCommunicationId ?? crypto.randomUUID());
  const [hydrating, setHydrating] = useState(!!existingCommunicationId);
  const [hasPersistedDraft, setHasPersistedDraft] = useState(!!existingCommunicationId);

  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [audienceSources, setAudienceSources] = useState<AgencyAudienceSource[]>([]);
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
        setBlocks(c.content?.blocks ?? []);
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

  const content: BroadcastContent = useMemo(() => ({ version: 1, blocks }), [blocks]);

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

  useEffect(() => {
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/agency/communications/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, preheader, content }),
        });
        const data = (await res.json()) as { html?: string };
        if (data.html) setPreviewHtml(data.html);
      } catch {
        // Best-effort.
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [subject, preheader, content]);

  const addBlock = useCallback((type: EmailBlock["type"]) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }, []);
  const updateBlock = useCallback((id: string, next: EmailBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)));
  }, []);
  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const canSend =
    !!subject.trim() && blocks.length > 0 && audienceSources.length > 0 && audiencePreview.recipients > 0 && !sending;
  const hasMeaningfulContent = !!subject.trim() || blocks.length > 0 || audienceSources.length > 0;

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
    setBlocks(t.content.blocks);
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
          <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(true)} disabled={blocks.length === 0}>
            <Save className="mr-1 h-4 w-4" /> Save as template
          </Button>
          <Button type="button" variant="outline" onClick={() => setTestSendOpen(true)} disabled={blocks.length === 0 || !subject.trim()}>
            <FlaskConical className="mr-1 h-4 w-4" /> Test Send
          </Button>
          <Button type="button" onClick={openConfirm} disabled={!canSend}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Send to {audiencePreview.recipients}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Input placeholder="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} className="text-base font-medium" />
            <Input
              placeholder="Preview text (optional — shown next to the subject in most inboxes)"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="text-sm"
            />
          </div>

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

          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map((block) => (
                  <BlockCard key={block.id} block={block} draftId={draftId} onChange={(next) => updateBlock(block.id, next)} onRemove={() => removeBlock(block.id)} />
                ))}
              </SortableContext>
            </DndContext>

            {blocks.length === 0 && (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Add your first block below.</div>
            )}

            <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/30 p-3">
              {(Object.keys(BLOCK_LABELS) as EmailBlock["type"][]).map((type) => {
                const { label, icon: Icon } = BLOCK_LABELS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addBlock(type)}
                    className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Preview</h2>
            {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <iframe title="Communication preview" srcDoc={previewHtml} sandbox="" className="h-[720px] w-full bg-white" />
          </div>
        </div>
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

function BlockCard({
  block,
  draftId,
  onChange,
  onRemove,
}: {
  block: EmailBlock;
  draftId: string;
  onChange: (next: EmailBlock) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const { label, icon: Icon } = BLOCK_LABELS[block.type];

  return (
    <div ref={setNodeRef} style={style} className={cn("rounded-xl border bg-card p-3", isDragging && "opacity-60 ring-2 ring-primary/40")}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label="Drag to reorder">
            <GripVertical className="h-4 w-4" />
          </button>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-muted-foreground hover:text-destructive">
          Remove
        </button>
      </div>

      {block.type === "text" && <TextBlockEditor value={block.html} onChange={(html) => onChange({ ...block, html })} />}
      {block.type === "image" && <ImageBlockEditor block={block} saId="agency" draftId={draftId} onChange={onChange} />}
      {block.type === "video" && <VideoBlockEditor block={block} saId="agency" draftId={draftId} onChange={onChange} />}
      {block.type === "button" && <ButtonBlockEditor block={block} onChange={onChange} />}
      {block.type === "divider" && <div className="border-t py-2 text-center text-xs text-muted-foreground">A horizontal divider — no settings.</div>}
      {block.type === "columns" && <ColumnsBlockEditor block={block} onChange={onChange} />}
    </div>
  );
}
