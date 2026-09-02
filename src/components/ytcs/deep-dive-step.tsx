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
import {
  GENERIC_DEEP_DIVE_QUESTIONS,
  PRODUCT_SHOWCASE_DEEP_DIVE_QUESTIONS,
  SIGNATURE_OFFER_DEEP_DIVE_QUESTIONS,
} from "@/lib/ytcs/deep-dive-questions";
import type { YtcsVideoProject, YtcsVoiceNoteRef } from "@/types/ytcs";
import type { VoiceNote } from "@/types/media-attachment";

/**
 * Step 2: Deep Dive. Two conceptual categories per migration spec §8:
 * normal Deep Dive (Brain Dump/Coaching Call/Short-Form Post/Story Bank/
 * Framework) and Product/Offer Deep Dive (dynamic by
 * productOfferVideoFormat). Question sets are FIXED/VERIFIED real data
 * (src/lib/ytcs/deep-dive-questions.ts) — no AI call is made here.
 */
export function DeepDiveStep({
  subAccountId,
  project,
  onSave,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onContinue: () => void;
}) {
  const isProductOffer = project.startingPointType === "productOffer";
  const format = project.productOfferInput?.productOfferVideoFormat;

  if (isProductOffer && !format) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">Choose a video format first</p>
        <p className="text-sm text-muted-foreground">
          This Product / Offer project doesn&apos;t have a format set yet — go back to
          Input and choose Product Showcase or Signature Offer Video before starting
          the Deep Dive for it.
        </p>
      </div>
    );
  }

  if (isProductOffer) {
    return (
      <ProductOfferDeepDive
        subAccountId={subAccountId}
        project={project}
        format={format!}
        onSave={onSave}
        onContinue={onContinue}
      />
    );
  }

  return <NormalDeepDive subAccountId={subAccountId} project={project} onSave={onSave} onContinue={onContinue} />;
}

function toVoiceNoteRef(vn: VoiceNote, question: string): YtcsVoiceNoteRef {
  return {
    id: vn.id,
    storagePath: vn.storagePath,
    url: vn.url,
    mimeType: vn.mimeType,
    sizeBytes: vn.fileSizeBytes,
    questionAssociation: question,
  };
}

function NormalDeepDive({
  subAccountId,
  project,
  onSave,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onContinue: () => void;
}) {
  const [answers, setAnswers] = useState(project.deepDiveAnswers ?? "");
  const [saving, setSaving] = useState(false);
  const voiceNotes = project.deepDiveVoiceNotes ?? [];

  async function save() {
    setSaving(true);
    try {
      await onSave({
        deepDiveAnswers: answers,
        generatedDeepDiveQuestions: GENERIC_DEEP_DIVE_QUESTIONS,
      });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function attach(vn: VoiceNote, question: string) {
    try {
      await onSave({ deepDiveVoiceNotes: [...voiceNotes, toVoiceNoteRef(vn, question)] });
      toast.success("Voice note attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't attach voice note.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Step 2: Deep Dive</h2>
        <p className="text-sm text-muted-foreground">
          Surface the gold before you outline or script.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Strategic Questions</Label>
        <p className="text-xs text-muted-foreground">
          Answer these to find the real video inside your raw idea.
        </p>
        {GENERIC_DEEP_DIVE_QUESTIONS.map((q, i) => {
          const attached = voiceNotes.filter((vn) => vn.questionAssociation === q);
          return (
            <div key={q} className="rounded-lg border p-3">
              <p className="text-sm">
                {i + 1}. {q}
              </p>
              {attached.map((vn) =>
                vn.url ? (
                  <div key={vn.id} className="mt-2">
                    <VoiceNotePlayer url={vn.url} durationMs={0} />
                  </div>
                ) : null,
              )}
              <div className="mt-2">
                <VoiceNoteRecorder
                  saId={subAccountId}
                  confirmLabel="Attach"
                  upload={uploadYtcsVoiceNote}
                  onUploaded={(vn) => attach(vn, q)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dd-answers">Paste your Deep Dive answers or transcript here</Label>
        <Textarea id="dd-answers" value={answers} onChange={(e) => setAnswers(e.target.value)} rows={8} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button
          type="button"
          onClick={async () => {
            await save();
            onContinue();
          }}
          disabled={saving}
        >
          Continue to Script Prompt Builder
        </Button>
      </div>
    </div>
  );
}

function ProductOfferDeepDive({
  subAccountId,
  project,
  format,
  onSave,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  format: string;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onContinue: () => void;
}) {
  const isShowcase = format === "productShowcase";
  const questions = isShowcase ? PRODUCT_SHOWCASE_DEEP_DIVE_QUESTIONS : SIGNATURE_OFFER_DEEP_DIVE_QUESTIONS;
  const heading = isShowcase ? "Product Showcase Deep Dive" : "Signature Offer Video Deep Dive";

  const [answers, setAnswers] = useState(project.productOfferDeepDiveAnswers ?? "");
  const [saving, setSaving] = useState(false);
  const voiceNotes = project.productOfferDeepDiveVoiceNotes ?? [];

  async function save() {
    setSaving(true);
    try {
      await onSave({ productOfferDeepDiveAnswers: answers });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function attach(vn: VoiceNote, question: string) {
    try {
      await onSave({ productOfferDeepDiveVoiceNotes: [...voiceNotes, toVoiceNoteRef(vn, question)] });
      toast.success("Voice note attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't attach voice note.");
    }
  }

  function appendAnswer(question: string, text: string) {
    const block = `Question: ${question}\n${text}`;
    setAnswers((prev) => (prev ? `${prev}\n\n${block}` : block));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Step 2: {heading}</h2>
        <p className="text-sm text-muted-foreground">
          {isShowcase
            ? "Only one question from the original tool's Product Showcase Deep Dive was recoverable during migration — use it, plus the notes area below, to capture everything else this video needs."
            : "Answer these to shape a Signature Offer Video that earns its place in the video, not just a CTA at the end."}
        </p>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => {
          const attached = voiceNotes.filter((vn) => vn.questionAssociation === q);
          return (
            <div key={q} className="rounded-lg border p-3">
              <p className="text-sm">
                Question {i + 1}: {q}
              </p>
              {attached.map((vn) =>
                vn.url ? (
                  <div key={vn.id} className="mt-2">
                    <VoiceNotePlayer url={vn.url} durationMs={0} />
                  </div>
                ) : null,
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VoiceNoteRecorder
                  saId={subAccountId}
                  confirmLabel="Attach"
                  upload={uploadYtcsVoiceNote}
                  onUploaded={(vn) => attach(vn, q)}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => appendAnswer(q, "")}>
                  <Mic className="h-3.5 w-3.5" /> Add answer line below
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-dd-answers">
          {isShowcase ? "Deep Dive answers / additional notes" : "Deep Dive answers"}
        </Label>
        <p className="text-xs text-muted-foreground">
          After listening back to a voice note, type or paste what you said here — there
          isn&apos;t an automatic transcription step yet.
        </p>
        <Textarea id="po-dd-answers" value={answers} onChange={(e) => setAnswers(e.target.value)} rows={8} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button
          type="button"
          onClick={async () => {
            await save();
            onContinue();
          }}
          disabled={saving}
        >
          Continue to Script Prompt Builder
        </Button>
      </div>
    </div>
  );
}
