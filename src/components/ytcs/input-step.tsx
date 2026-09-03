"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { uploadYtcsVoiceNote } from "@/lib/ytcs/upload-voice-note";
import type { BusinessBrain } from "@/types/business-brain";
import type { YtcsVideoProject, YtcsVoiceNoteRef } from "@/types/ytcs";
import type { VoiceNote } from "@/types/media-attachment";

/** Real, verbatim Brain Dump prompt questions — migration spec §7/§8,
 *  captured live from the original tool. Not paraphrased. */
const BRAIN_DUMP_QUESTIONS = [
  "What is top of mind for me right now in my business or content?",
  "What is a mistake I made early on that I wish someone had warned me about?",
  "What question do I keep getting from my audience, clients, or community?",
  "What did I just figure out that I'm genuinely excited about?",
  "What is something I used to believe that I now know is completely wrong?",
  "What conversation, post, or moment recently made me think, 'This needs to be a video'?",
  "What do I wish my audience understood before they try to solve this problem?",
];

const SHORT_FORM_TYPES = ["Reel", "TikTok", "Short", "Caption", "Email", "Carousel", "Post"];

function toVoiceNoteRef(vn: VoiceNote): YtcsVoiceNoteRef {
  return {
    id: vn.id,
    storagePath: vn.storagePath,
    url: vn.url,
    mimeType: vn.mimeType,
    sizeBytes: vn.fileSizeBytes,
  };
}

/**
 * Video Workspace Step 1: Input. Covers all 6 real starting points
 * (migration spec §7) — deliberately NOT one generic textarea, since the
 * real structures genuinely differ (Story Bank/Framework/Product-Offer
 * pull from Business Brain; Brain Dump has canned questions + voice
 * notes; Short-Form Post has its own type field).
 */
export function InputStep({
  subAccountId,
  project,
  businessBrain,
  onSave,
  onChangeStartingPoint,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  businessBrain: BusinessBrain | null;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onChangeStartingPoint: () => void;
  /** Advances the workspace's viewed tab to Deep Dive — only called
   *  after the save this same click triggers actually succeeds (see
   *  `continueToDeepDive` below). Bug fix (2026-09-03): this step never
   *  received an onContinue at all, so "Continue to Deep Dive" only
   *  ever saved and never navigated, for every starting point. */
  onContinue: () => void;
}) {
  const [rawTranscript, setRawTranscript] = useState(project.rawTranscript ?? "");
  const [saving, setSaving] = useState(false);

  /**
   * The one action every starting point's "Continue to Deep Dive"
   * button uses: save the given fields plus `currentStep: "Deep Dive"`
   * in a single atomic request, then — only if that save actually
   * succeeds — advance the viewed tab. A failed save shows an error
   * toast and never calls `onContinue()`, so the UI correctly stays on
   * Input rather than silently moving on. `currentStep` is written in
   * the very same request that saves the step's own content, so it can
   * never be advanced ahead of a save that didn't happen.
   */
  async function continueToDeepDive(extra: Partial<YtcsVideoProject> = {}) {
    setSaving(true);
    try {
      await onSave({ ...extra, currentStep: "Deep Dive" });
      toast.success("Saved.");
      onContinue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function attachVoiceNote(vn: VoiceNote) {
    const next = [...(project.brainDumpVoiceNotes ?? []), toVoiceNoteRef(vn)];
    try {
      await onSave({ brainDumpVoiceNotes: next });
      toast.success("Voice note attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't attach voice note.");
    }
  }

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold">Step 1: Input</h2>
        <p className="text-sm text-muted-foreground">
          Capture your raw material and initial ideas.
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onChangeStartingPoint}>
        Change Starting Point
      </Button>
    </div>
  );

  if (project.startingPointType === "story") {
    const stories = businessBrain?.stories ?? [];
    const selected = stories.find((s) => s.id === project.storyId);
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-muted-foreground">
          Pick a story from your Business Brain to build this video around.
        </p>
        {stories.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No stories saved yet in Business Brain.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {stories.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                onSave({
                  storyId: s.id,
                  storyName: s.name,
                  storyProblem: s.problem,
                  storyPursuit: s.pursuit,
                  storyPayoff: s.payoff,
                  storyLesson: s.lesson,
                  storyType: s.type,
                })
              }
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected?.id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-medium">{s.name || "(untitled story)"}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.problem}</p>
            </button>
          ))}
        </div>
        {selected && (
          <p className="text-sm text-muted-foreground">
            Story loaded: <span className="font-medium text-foreground">{selected.name}</span>
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!selected || saving}
            onClick={() =>
              selected &&
              continueToDeepDive({
                storyId: selected.id,
                storyName: selected.name,
                storyProblem: selected.problem,
                storyPursuit: selected.pursuit,
                storyPayoff: selected.payoff,
                storyLesson: selected.lesson,
                storyType: selected.type,
              })
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Continue to Deep Dive
          </Button>
        </div>
      </div>
    );
  }

  if (project.startingPointType === "framework") {
    const frameworks = businessBrain?.frameworks ?? [];
    const selectedId = project.frameworkId;
    const selected = frameworks.find((f) => f.id === selectedId);
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-muted-foreground">
          Pick a framework from your Business Brain to turn into a video.
        </p>
        {frameworks.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No frameworks saved yet in Business Brain.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {frameworks.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSave({ framework: f, frameworkId: f.id })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selectedId === f.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-medium">{f.name || "(untitled framework)"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.type}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!selected || saving}
            onClick={() => selected && continueToDeepDive({ framework: selected, frameworkId: selected.id })}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Continue to Deep Dive
          </Button>
        </div>
      </div>
    );
  }

  if (project.startingPointType === "productOffer") {
    const offers = businessBrain?.offers ?? [];
    const selectedOfferId = project.productOfferInput?.selectedOfferId;
    const format = project.productOfferInput?.productOfferVideoFormat;
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-muted-foreground">
          Pick an offer from your Business Brain and the video format.
        </p>
        {offers.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No offers saved yet in Business Brain.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {offers.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() =>
                onSave({
                  productOfferInput: {
                    ...project.productOfferInput,
                    selectedOfferId: o.id,
                    selectedOfferName: o.name,
                    selectedOfferDetails: o,
                  },
                })
              }
              className={`rounded-xl border p-4 text-left transition-colors ${
                selectedOfferId === o.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-medium">{o.name || "(untitled offer)"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{o.price}</p>
            </button>
          ))}
        </div>
        {selectedOfferId && (
          <div className="space-y-2">
            <Label>Video Format</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "productShowcase", label: "Product Showcase" },
                  { value: "signatureOfferVideo", label: "Signature Offer Video" },
                ] as const
              ).map((f) => (
                <Button
                  key={f.value}
                  type="button"
                  variant={format === f.value ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    onSave({
                      productOfferInput: { ...project.productOfferInput, productOfferVideoFormat: f.value },
                    })
                  }
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!selectedOfferId || !format || saving}
            onClick={() => continueToDeepDive({ productOfferInput: project.productOfferInput })}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Continue to Deep Dive
          </Button>
        </div>
      </div>
    );
  }

  if (project.startingPointType === "short_form") {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-2">
          <Label>Short-Form Type</Label>
          <div className="flex flex-wrap gap-2">
            {SHORT_FORM_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                variant={project.shortFormType === t ? "default" : "outline"}
                size="sm"
                onClick={() => onSave({ shortFormType: t })}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="raw">Paste the original post/caption/transcript</Label>
          <Textarea
            id="raw"
            value={rawTranscript}
            onChange={(e) => setRawTranscript(e.target.value)}
            rows={8}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => continueToDeepDive({ rawTranscript })} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Continue to Deep Dive
          </Button>
        </div>
      </div>
    );
  }

  // Brain Dump (default) and Coaching Call / Client Conversation share the
  // same raw-textarea + voice-note shape; Brain Dump additionally offers
  // the canned question prompts.
  const isBrainDump = project.startingPointType === "brain_dump" || !project.startingPointType;

  return (
    <div className="space-y-4">
      {header}
      {isBrainDump && (
        <div className="space-y-2">
          <Label>Select a question to answer out loud</Label>
          <div className="flex flex-col gap-1.5">
            {BRAIN_DUMP_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSave({ selectedInputQuestion: q })}
                className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${
                  project.selectedInputQuestion === q ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {isBrainDump && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5" /> Voice Note
          </Label>
          <p className="text-xs text-muted-foreground">
            Talk through the idea if typing feels too slow.
          </p>
          {(project.brainDumpVoiceNotes ?? []).map((vn) =>
            vn.url ? <VoiceNotePlayer key={vn.id} url={vn.url} durationMs={0} /> : null,
          )}
          <VoiceNoteRecorder
            saId={subAccountId}
            confirmLabel="Attach"
            upload={uploadYtcsVoiceNote}
            onUploaded={attachVoiceNote}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="raw">
          {isBrainDump
            ? "Paste your raw brain dump, transcript, or messy notes here"
            : "Paste the call/conversation transcript or notes here"}
        </Label>
        <Textarea
          id="raw"
          value={rawTranscript}
          onChange={(e) => setRawTranscript(e.target.value)}
          rows={8}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={() => continueToDeepDive({ rawTranscript })} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Continue to Deep Dive
        </Button>
      </div>
    </div>
  );
}
