"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
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
import { EmailBuilder } from "@/components/email-authoring/builder/email-builder";
import { documentHasIncompleteBlock, firstIncompleteBlockId } from "@/components/email-authoring/builder/block-factory";
import {
  AudienceConditionBuilder,
  audienceFilterFromApiShape,
  audienceFilterToApiShape,
  audienceStateHasNegation,
  defaultAudienceFilterState,
  useAudiencePreview,
  type AudienceFilterState,
} from "@/components/broadcasts/audience-condition-builder";
import {
  EmailTemplatePickerDialog,
  type PickedEmailTemplate,
} from "@/components/email-authoring/email-template-picker-dialog";
import { SaveAsTemplateDialog } from "@/components/email-authoring/save-as-template-dialog";
import { createEmailTemplate } from "@/lib/email/template-library";
import { audienceLabel } from "@/lib/broadcasts/audience-label";
import type { Contact } from "@/types/contacts";
import type {
  BroadcastAudienceFilter,
  BroadcastContent,
  BroadcastDoc,
} from "@/types";

/** Audience size at/above which the send-confirmation dialog requires
 *  typing "SEND" rather than a single click (2026-08-26 production safety
 *  controls, requirement 3: "make the confirmation materially harder to
 *  miss" for large audiences). Also triggered by a detected negation/broad
 *  filter pattern regardless of size — see audienceStateHasNegation. */
const LARGE_AUDIENCE_THRESHOLD = 100;

/** Debounce window before an edit triggers an autosave request. Long
 *  enough that normal typing never fires one per keystroke, short enough
 *  that a refresh a couple seconds after the last edit rarely loses
 *  anything (2026-08-27 Persistent Broadcast Drafts V1). */
const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The Broadcast composer — used both for a brand-new broadcast
 * (`/broadcasts/new`) and for resuming a saved draft
 * (`/broadcasts/[broadcastId]/edit`). Extracted to a shared component
 * (2026-08-27, Persistent Broadcast Drafts V1) so both routes stay in
 * lockstep with zero duplicated logic — the only difference between them
 * is whether `existingBroadcastId` is set, which decides whether this
 * mount hydrates from a persisted draft on load.
 */
export function BroadcastComposer({
  existingBroadcastId,
}: {
  existingBroadcastId?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, saPath } = useSubAccount();
  const router = useRouter();

  // The SAME id is used for (a) the Firestore broadcast doc once a draft
  // is persisted and (b) draftId-scoped image/video uploads (see
  // upload-image.ts) — generated once, up front, whether this is a brand
  // new composer or resuming an existing draft. This is what lets "the
  // existing draftId/image-upload relationship" stay exactly as it was:
  // there's never a seam where uploads move from one id to another.
  const [draftId] = useState(() => existingBroadcastId ?? crypto.randomUUID());
  const [hydrating, setHydrating] = useState(!!existingBroadcastId);
  // True once a real Firestore doc exists for this draftId — either
  // hydrated from an existing draft, or created by this composer's own
  // first autosave. Gates the autosave "creation boundary": a brand-new,
  // untouched composer never creates a doc at all.
  const [hasPersistedDraft, setHasPersistedDraft] = useState(!!existingBroadcastId);

  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [content, setContent] = useState<BroadcastContent>({ version: 1, blocks: [] });
  const [audience, setAudience] = useState<AudienceFilterState>(defaultAudienceFilterState());
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [jumpToBlockId, setJumpToBlockId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

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

  // Persistent Broadcast Drafts V1 (2026-08-27) — autosave state.
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const sessionIdRef = useRef(crypto.randomUUID());
  const clientSeqRef = useRef(0);
  // Last successfully-collapsed audience filter — sent to the draft-save
  // route even while a condition row is mid-edit (incomplete), so a draft
  // never regresses to an invalid/missing audienceFilter between one valid
  // state and the next. Send Now still requires a fully valid filter
  // (unchanged, via `canSend` below).
  const lastValidAudienceFilterRef = useRef<BroadcastAudienceFilter>({ kind: "all" });

  // Hydrate from a persisted draft on mount. Read-once (not onSnapshot) —
  // this composer becomes the source of truth for the session the moment
  // it loads; autosave (not a live listener) is what keeps Firestore in
  // sync from here, matching "one person editing in two tabs doesn't need
  // real-time merge" from the spec.
  useEffect(() => {
    if (!existingBroadcastId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(getFirebaseDb(), "broadcasts", existingBroadcastId));
        if (cancelled) return;
        if (!snap.exists()) {
          toast.error("That draft no longer exists.");
          router.replace(saPath("/broadcasts"));
          return;
        }
        const data = snap.data() as BroadcastDoc;
        if (data.status !== "draft") {
          // Already sent (e.g. from another tab) — the read-only detail
          // page is the correct place for it now, not the composer.
          toast.message("This broadcast has already been sent.");
          router.replace(saPath(`/broadcasts/${existingBroadcastId}`));
          return;
        }
        setSubject(data.subject ?? "");
        setPreheader(data.preheader ?? "");
        setContent(data.content ?? { version: 1, blocks: [] });
        setAudience(audienceFilterFromApiShape(data.audienceFilter));
        if (data.audienceFilter) lastValidAudienceFilterRef.current = data.audienceFilter;
        setSourceTemplateId(data.sourceTemplateId ?? null);
        setTestMode(data.testMode === true);
        setTestRecipientIds(data.testRecipientContactIds ?? []);
        setHasPersistedDraft(true);
      } catch {
        toast.error("Couldn't load this draft. Try again.");
        router.replace(saPath("/broadcasts"));
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingBroadcastId]);

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

  // On-demand preview — Preview is now the top-controls final-verification
  // action (task instruction 8), not an always-rendering detached column;
  // the Preview modal calls this the moment it opens, and it returns the
  // EXACT same renderer output the real send uses, never an approximation.
  const getPreviewHtml = useCallback(async () => {
    const res = await fetch("/api/broadcasts/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subAccountId, subject, preheader, content }),
    });
    const data = (await res.json()) as { html?: string; error?: string };
    if (!res.ok || !data.html) throw new Error(data.error ?? "Preview failed to load");
    return data.html;
  }, [subAccountId, subject, preheader, content]);

  const missingAddress = !subAccount?.mailingAddress;
  const audienceFilter = audienceFilterToApiShape(audience);
  if (audienceFilter) lastValidAudienceFilterRef.current = audienceFilter;
  const canSend =
    !!subject.trim() &&
    content.blocks.length > 0 &&
    !!audienceFilter &&
    effectiveRecipientCount > 0 &&
    !missingAddress &&
    !sending &&
    (!testMode || testRecipientIds.length > 0);

  // Persistent Broadcast Drafts V1 (2026-08-27) — autosave. Creation
  // boundary: a brand-new composer only starts persisting once there's
  // real content (subject, a block, or a segmentation condition) — an
  // operator who opens the page and leaves never creates a doc. Once a
  // draft exists (hydrated OR created by an earlier tick), every
  // subsequent debounced change saves regardless, including clearing
  // content back to empty.
  const hasMeaningfulContent =
    !!subject.trim() || content.blocks.length > 0 || audience.conditions.length > 0;

  const saveDraftNow = useCallback(async () => {
    if (!hasPersistedDraft && !hasMeaningfulContent) return;
    clientSeqRef.current += 1;
    const seq = clientSeqRef.current;
    setSaveState("saving");
    try {
      const res = await fetch("/api/broadcasts/draft/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          broadcastId: draftId,
          subAccountId,
          subject,
          preheader: preheader || null,
          content,
          audienceFilter: lastValidAudienceFilterRef.current,
          sourceTemplateId,
          testMode,
          testRecipientIds: testMode ? testRecipientIds : undefined,
          sessionId: sessionIdRef.current,
          clientSeq: seq,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; ignored?: string; created?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        // A launched broadcast (status flipped away from "draft" by
        // another tab's Send) rejects further autosave — stop trying to
        // save into a broadcast that isn't editable anymore.
        setSaveState("error");
        return;
      }
      if (data.ignored === "stale") return; // a newer request already won; leave saveState as-is
      setHasPersistedDraft(true);
      setSaveState("saved");
      // The FIRST time a brand-new composer (no existingBroadcastId, i.e.
      // /broadcasts/new) actually persists a draft, silently swap the
      // visible URL to /broadcasts/{draftId}/edit — a raw History API
      // call, not a Next.js navigation, so the component never remounts
      // and no in-progress state is lost. This is what makes "hard
      // refresh restores the exact draft" true even for a draft that
      // started life on the plain /new URL: refreshing now reloads at
      // the /edit URL, which hydrates from this same persisted doc.
      if (data.created && !existingBroadcastId) {
        window.history.replaceState(null, "", saPath(`/broadcasts/${draftId}/edit`));
      }
    } catch {
      setSaveState("error");
    }
  }, [
    hasPersistedDraft,
    hasMeaningfulContent,
    draftId,
    existingBroadcastId,
    saPath,
    subAccountId,
    subject,
    preheader,
    content,
    sourceTemplateId,
    testMode,
    testRecipientIds,
  ]);

  useEffect(() => {
    if (hydrating) return; // never autosave over content still being loaded
    if (!hasPersistedDraft && !hasMeaningfulContent) return;
    const handle = setTimeout(() => {
      saveDraftNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrating,
    subject,
    preheader,
    content,
    audienceFilter,
    testMode,
    testRecipientIds,
  ]);

  // Opening the Send button never sends directly — it always opens the
  // confirmation dialog first (production safety controls, 2026-08-26,
  // requirement 3). The dialog itself calls handleSend on confirm.
  // Strict Send validation (task instruction 10) — draft authoring in the
  // canvas is deliberately tolerant of incomplete blocks (instruction 9),
  // but neither a real Send nor a real Test Send may go out with one.
  // Blocks the action, names the problem, and selects the offending block
  // in the builder so the owner can jump straight to it instead of
  // discovering it only after clicking Send.
  function blockIfIncomplete(): boolean {
    if (!documentHasIncompleteBlock(content.blocks)) return true;
    const id = firstIncompleteBlockId(content.blocks);
    setJumpToBlockId(id);
    toast.error("This email has an incomplete block — finish it before sending.");
    return false;
  }

  function openConfirm() {
    if (!canSend) return;
    if (!blockIfIncomplete()) return;
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
          // Persistent Broadcast Drafts V1 — reuse this SAME record when
          // it's already a persisted draft, rather than creating a
          // second one. Omitted (undefined) for a composer that never
          // reached the autosave creation boundary — the send route
          // falls back to creating a fresh doc, unchanged from before
          // this feature.
          draftId: hasPersistedDraft ? draftId : undefined,
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
    if (!blockIfIncomplete()) return;
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

  async function handleConfirmSaveTemplate(name: string) {
    if (!agencyId) return;
    setSavingTemplate(true);
    try {
      await createEmailTemplate({
        agencyId,
        subAccountId,
        createdByUid: user?.uid ?? "",
        name,
        subject: subject.trim(),
        preheader: preheader.trim() || null,
        content,
      });
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
    // Provenance only — `sourceTemplateId` is write-through metadata never
    // re-read server-side to reconstruct content, so recording it here
    // doesn't create a live link back to the template.
    setSourceTemplateId(t.id);
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
          <a
            href={saPath("/broadcasts")}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Broadcasts
          </a>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {existingBroadcastId ? "Edit draft" : "New broadcast"}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setSaveTemplateOpen(true)}
            disabled={content.blocks.length === 0}
          >
            <Save className="mr-1 h-4 w-4" />
            Save as template
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-1 h-4 w-4" /> Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTestSendOpen(true)}
            disabled={content.blocks.length === 0 || !subject.trim()}
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

      <div className="space-y-6">
        {/* Recipients — the composer's existing single-page audience/Test
            Mode workflow, unchanged. The mockup's "Content → Audience →
            Review & Send" step indicator doesn't exist as a literal wizard
            in this product today, so rather than inventing one, the shared
            builder below replaces only the content-authoring half of this
            page (task instruction 12's "reuse existing data/workflow"
            escape hatch) — Recipients/Test Mode/Send stay exactly where an
            operator already knows to find them. */}
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

        {/* Content — the shared visual Email Builder. Same 3-pane surface
            (Elements / Canvas / Inspector) TENANT Email Templates, AGENCY
            Broadcasts, and AGENCY Email Templates all use — see
            src/components/email-authoring/builder/email-builder.tsx. */}
        <EmailBuilder
          content={content}
          onChange={setContent}
          subject={subject}
          preheader={preheader}
          onSubjectChange={setSubject}
          onPreheaderChange={setPreheader}
          saId={subAccountId}
          draftId={draftId}
          getPreviewHtml={getPreviewHtml}
          previewOpen={previewOpen}
          onPreviewOpenChange={setPreviewOpen}
          jumpToBlockId={jumpToBlockId}
        />
      </div>

      <EmailTemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        subAccountId={subAccountId}
        onPick={handlePickTemplate}
      />

      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultName={subject}
        saving={savingTemplate}
        onSave={handleConfirmSaveTemplate}
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

/** Small, unobtrusive autosave status — deliberately not a toast/banner.
 *  Persistent Broadcast Drafts V1 (2026-08-27). */
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
