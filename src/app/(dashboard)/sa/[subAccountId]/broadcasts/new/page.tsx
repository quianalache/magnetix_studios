"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  AudienceConditionBuilder,
  audienceFilterToApiShape,
  audienceStateHasNegation,
  defaultAudienceFilterState,
  useAudiencePreview,
  type AudienceFilterState,
} from "@/components/broadcasts/audience-condition-builder";
import { TemplatePickerDialog } from "@/components/broadcasts/template-picker-dialog";
import { audienceLabel } from "@/lib/broadcasts/audience-label";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type {
  BroadcastContent,
  EmailBlock,
  BroadcastTemplateDoc,
} from "@/types";

/** Audience size at/above which the send-confirmation dialog requires
 *  typing "SEND" rather than a single click (2026-08-26 production safety
 *  controls, requirement 3: "make the confirmation materially harder to
 *  miss" for large audiences). Also triggered by a detected negation/broad
 *  filter pattern regardless of size — see audienceStateHasNegation. */
const LARGE_AUDIENCE_THRESHOLD = 100;

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
      return { id: newBlockId(), type: "text", html: "<p>Write something…</p>" };
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
          [{ id: newBlockId(), type: "text", html: "<p></p>" }],
          [{ id: newBlockId(), type: "text", html: "<p></p>" }],
        ],
      };
  }
}

export default function NewBroadcastPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, saPath } = useSubAccount();
  const router = useRouter();

  const [draftId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [audience, setAudience] = useState<AudienceFilterState>(defaultAudienceFilterState());
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Production safety controls (2026-08-26) — Test Mode, send confirmation,
  // Test Send. See docs/debug notes on broadcast nf4y6KBytpIAwzO0l17d.
  const [testMode, setTestMode] = useState(false);
  const [testRecipientIds, setTestRecipientIds] = useState<string[]>([]);
  const [testModeQuery, setTestModeQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTypedText, setConfirmTypedText] = useState("");
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testSendEmail, setTestSendEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, (list) =>
      setContacts(list),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  useEffect(() => {
    if (user?.email) setTestSendEmail((prev) => prev || user.email!);
  }, [user?.email]);

  const content: BroadcastContent = useMemo(() => ({ version: 1, blocks }), [blocks]);
  const audiencePreview = useAudiencePreview(contacts, audience);

  // Test Mode audience — intersected server-side too (resolveAudience), but
  // computed here so the operator sees the SAME small number they're about
  // to confirm, not the raw (possibly huge) segment count. A contact only
  // counts if they'd both match the segment/opt-out/email checks AND be on
  // the allowlist — matches the server's intersection order exactly.
  const testModeContacts = useMemo(() => {
    if (!testMode) return [];
    const idSet = new Set(testRecipientIds);
    return audiencePreview.recipientContacts.filter((c) => idSet.has(c.id));
  }, [testMode, testRecipientIds, audiencePreview.recipientContacts]);

  const effectiveRecipientCount = testMode ? testModeContacts.length : audiencePreview.recipients;
  const hasNegationWarning = audienceStateHasNegation(audience);
  const requiresTypedConfirm =
    !testMode && (effectiveRecipientCount >= LARGE_AUDIENCE_THRESHOLD || hasNegationWarning);

  const testModeCandidates = useMemo(() => {
    const q = testModeQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter(
        (c) =>
          !testRecipientIds.includes(c.id) &&
          ((c.name ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [contacts, testModeQuery, testRecipientIds]);

  // Debounced live preview — the composer's iframe renders the EXACT same
  // renderer output the real send uses, never a second approximate render.
  useEffect(() => {
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/broadcasts/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subAccountId, content }),
        });
        const data = (await res.json()) as { html?: string };
        if (data.html) setPreviewHtml(data.html);
      } catch {
        // Preview is best-effort — a network hiccup shouldn't block composing.
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [subAccountId, content]);

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

  const missingAddress = !subAccount?.mailingAddress;
  const audienceFilter = audienceFilterToApiShape(audience);
  const canSend =
    !!subject.trim() &&
    blocks.length > 0 &&
    !!audienceFilter &&
    effectiveRecipientCount > 0 &&
    !missingAddress &&
    !sending &&
    (!testMode || testRecipientIds.length > 0);

  // Opening the Send button never sends directly — it always opens the
  // confirmation dialog first (production safety controls, 2026-08-26,
  // requirement 3). The dialog itself calls handleSend on confirm.
  function openConfirm() {
    if (!canSend) return;
    setConfirmTypedText("");
    setConfirmOpen(true);
  }

  async function handleSend() {
    if (!audienceFilter) return;
    // Capture the count the operator is confirming RIGHT NOW — sent to the
    // server as confirmedAudienceSize, which recomputes independently and
    // rejects the request if the two don't match (see send/route.ts).
    const confirmedAudienceSize = effectiveRecipientCount;
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          content,
          subject: subject.trim(),
          preheader: preheader.trim() || null,
          audienceFilter,
          sourceTemplateId,
          testMode,
          testRecipientIds: testMode ? testRecipientIds : undefined,
          confirmedAudienceSize,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        broadcastId?: string;
        queued?: number;
        skipped?: number;
        error?: string;
        code?: string;
        currentAudienceSize?: number;
      };
      if (!res.ok || !data.ok || !data.broadcastId) {
        if (data.code === "AUDIENCE_CHANGED") {
          toast.error(
            `${data.error ?? "Audience changed."} Review the updated count and send again.`,
          );
          setConfirmOpen(false);
          return;
        }
        toast.error(data.error ?? "Couldn't send. Try again.");
        return;
      }
      toast.success(
        testMode
          ? `Test Mode broadcast queued — ${data.queued ?? 0} test recipient(s)`
          : `Broadcast queued — ${data.queued ?? 0} recipients${data.skipped ? ` (${data.skipped} skipped)` : ""}`,
      );
      setConfirmOpen(false);
      router.push(saPath(`/broadcasts/${data.broadcastId}`));
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
      const res = await fetch("/api/broadcasts/email/test-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          content,
          subject: subject.trim(),
          preheader: preheader.trim() || null,
          testEmail: email,
        }),
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

  async function handleSaveTemplate() {
    if (!agencyId) return;
    const name = window.prompt("Template name");
    if (!name || !name.trim()) return;
    setSavingTemplate(true);
    try {
      await addDoc(collection(getFirebaseDb(), "broadcastTemplates"), {
        agencyId,
        subAccountId,
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || null,
        content,
        createdByUid: user?.uid ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Saved to your templates.");
    } catch {
      toast.error("Couldn't save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  function handlePickTemplate(t: BroadcastTemplateDoc) {
    setSubject(t.subject);
    setPreheader(t.preheader ?? "");
    setBlocks(t.content.blocks);
    setSourceTemplateId(t.id);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a
            href={saPath("/broadcasts")}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Broadcasts
          </a>
          <h1 className="text-2xl font-bold tracking-tight">New broadcast</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setTemplatePickerOpen(true)}>
            <FileText className="mr-1 h-4 w-4" /> Load template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveTemplate}
            disabled={savingTemplate || blocks.length === 0}
          >
            {savingTemplate ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save as template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTestSendOpen(true)}
            disabled={blocks.length === 0 || !subject.trim()}
          >
            <FlaskConical className="mr-1 h-4 w-4" /> Test Send
          </Button>
          <Button type="button" onClick={openConfirm} disabled={!canSend}>
            {sending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Send to {effectiveRecipientCount}
          </Button>
        </div>
      </div>

      {missingAddress && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          You need a business mailing address before you can send a broadcast
          — required by CAN-SPAM.{" "}
          <a href={saPath("/dashboard/settings")} className="underline">
            Add it in Settings → Sending preferences
          </a>
          .
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: composer */}
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Input
              placeholder="Subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-base font-medium"
            />
            <Input
              placeholder="Preview text (optional — shown next to the subject in most inboxes)"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Recipients</h2>
            <AudienceConditionBuilder
              contacts={contacts}
              value={audience}
              onChange={setAudience}
              subAccountId={subAccountId}
            />

            <div className="mt-4 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="test-mode-toggle" className="flex items-center gap-1.5 text-sm font-medium">
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  Test Mode
                </Label>
                <Switch id="test-mode-toggle" checked={testMode} onCheckedChange={setTestMode} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                When on, this send only ever reaches the test recipients you
                pick below — enforced server-side, no matter how broad the
                segment above resolves. The real segment currently matches{" "}
                <span className="font-mono">{audiencePreview.recipients}</span> contact
                {audiencePreview.recipients === 1 ? "" : "s"}.
              </p>

              {testMode && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {testRecipientIds.map((id) => {
                      const c = contacts.find((x) => x.id === id);
                      return (
                        <span
                          key={id}
                          className="flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs"
                        >
                          {c ? c.name || c.email : id}
                          <button
                            type="button"
                            onClick={() =>
                              setTestRecipientIds((prev) => prev.filter((x) => x !== id))
                            }
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove test recipient"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                    {testRecipientIds.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No test recipients selected yet — Send is disabled until you add at least one.
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="Search contacts by name or email…"
                      value={testModeQuery}
                      onChange={(e) => setTestModeQuery(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {testModeCandidates.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md">
                        {testModeCandidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setTestRecipientIds((prev) => [...prev, c.id]);
                              setTestModeQuery("");
                            }}
                            className="flex w-full flex-col items-start px-3 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span className="font-medium">{c.name || "(no name)"}</span>
                            <span className="text-muted-foreground">{c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Will actually email:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {testModeContacts.length}
                    </span>{" "}
                    of {testRecipientIds.length} selected (the rest don&apos;t match the segment above, or are opted out).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    saId={subAccountId}
                    draftId={draftId}
                    onChange={(next) => updateBlock(block.id, next)}
                    onRemove={() => removeBlock(block.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {blocks.length === 0 && (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add your first block below.
              </div>
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

        {/* Right: live preview — the exact rendered email, not an approximation */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Preview</h2>
            {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <iframe
              title="Broadcast preview"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[720px] w-full bg-white"
            />
          </div>
        </div>
      </div>

      <TemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        subAccountId={subAccountId}
        onPick={handlePickTemplate}
      />

      {/* Production safety controls (2026-08-26) — send confirmation.
          Always required, before ANY live send; large/risky audiences add a
          typed-confirmation step so a single accidental click can't launch
          a large fan-out. See send/route.ts's confirmedAudienceSize check. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {testMode ? "Send test-mode broadcast?" : "Send this broadcast?"}
            </DialogTitle>
            <DialogDescription>
              {testMode
                ? "Test Mode is on — only your selected test recipients will receive this, even though the segment below matches more contacts."
                : "This sends immediately. Review the audience before confirming."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {testMode ? "Test recipients" : "Will receive email"}
                </span>
                <span className="font-mono text-lg font-semibold">{effectiveRecipientCount}</span>
              </div>
              {!testMode && (
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Skipped (unsubscribed / no email)</span>
                  <span className="font-mono">{audiencePreview.skipped}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Segment</span>
                <span>{audienceFilter ? audienceLabel(audienceFilter) : "—"}</span>
              </div>
              {testMode && (
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Real segment size (not who gets emailed)</span>
                  <span className="font-mono">{audiencePreview.recipients}</span>
                </div>
              )}
            </div>

            {hasNegationWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This condition may include most contacts in your CRM
                  (it uses a &quot;not&quot; rule). Double-check the count above
                  before sending.
                </span>
              </div>
            )}

            {requiresTypedConfirm && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-send-text" className="text-xs">
                  Type <span className="font-mono font-semibold">SEND</span> to confirm this
                  {effectiveRecipientCount >= LARGE_AUDIENCE_THRESHOLD
                    ? ` ${effectiveRecipientCount}-recipient send`
                    : " send"}
                  :
                </Label>
                <Input
                  id="confirm-send-text"
                  value={confirmTypedText}
                  onChange={(e) => setConfirmTypedText(e.target.value)}
                  placeholder="SEND"
                  className="font-mono"
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={
                sending || (requiresTypedConfirm && confirmTypedText.trim() !== "SEND")
              }
            >
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Confirm &amp; Send{testMode ? " (test)" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production safety control (2026-08-26) — Test Send. One email, to
          one address, using the exact same renderer + sender domain as a
          live send. No broadcast doc, no history, no totals. */}
      <Dialog open={testSendOpen} onOpenChange={setTestSendOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>
              Sends the exact rendered email to one address. Doesn&apos;t create a
              broadcast or affect any recipient list.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="email"
            placeholder="you@example.com"
            value={testSendEmail}
            onChange={(e) => setTestSendEmail(e.target.value)}
          />
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

function BlockCard({
  block,
  saId,
  draftId,
  onChange,
  onRemove,
}: {
  block: EmailBlock;
  saId: string;
  draftId: string;
  onChange: (next: EmailBlock) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const { label, icon: Icon } = BLOCK_LABELS[block.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3",
        isDragging && "opacity-60 ring-2 ring-primary/40",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Remove
        </button>
      </div>

      {block.type === "text" && (
        <TextBlockEditor value={block.html} onChange={(html) => onChange({ ...block, html })} />
      )}
      {block.type === "image" && (
        <ImageBlockEditor block={block} saId={saId} draftId={draftId} onChange={onChange} />
      )}
      {block.type === "video" && (
        <VideoBlockEditor block={block} saId={saId} draftId={draftId} onChange={onChange} />
      )}
      {block.type === "button" && <ButtonBlockEditor block={block} onChange={onChange} />}
      {block.type === "divider" && (
        <div className="border-t py-2 text-center text-xs text-muted-foreground">
          A horizontal divider — no settings.
        </div>
      )}
      {block.type === "columns" && <ColumnsBlockEditor block={block} onChange={onChange} />}
    </div>
  );
}
