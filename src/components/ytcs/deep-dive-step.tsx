"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DictateButton } from "@/components/ui/dictate-button";
import { LegacyVoiceNotes } from "@/components/ytcs/legacy-voice-notes";
import {
  GENERIC_DEEP_DIVE_QUESTIONS,
  PRODUCT_SHOWCASE_DEEP_DIVE_QUESTIONS,
  SIGNATURE_OFFER_DEEP_DIVE_QUESTIONS,
} from "@/lib/ytcs/deep-dive-questions";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Step 2: Deep Dive. Two conceptual categories per migration spec §8:
 * normal Deep Dive (Brain Dump/Coaching Call/Short-Form Post/Story Bank/
 * Framework) and Product/Offer Deep Dive (dynamic by
 * productOfferVideoFormat). Question sets are FIXED/VERIFIED real data
 * (src/lib/ytcs/deep-dive-questions.ts) — no AI call is made here.
 *
 * Dictation product decision (2026-09-03): the per-question "Record
 * voice note" recorder is no longer the active interaction. Each
 * question now shows a small dictate mic (the existing, already-shipped
 * `DictateButton`/`useDictation` — Web Speech API, browser-native, no
 * audio ever leaves the browser as a file, nothing to store or discard)
 * pointed at the ONE canonical answer field (`deepDiveAnswers`/
 * `productOfferDeepDiveAnswers`) this step has always persisted to — no
 * second per-question answer store was created. Any project with real
 * historical `deepDiveVoiceNotes`/`productOfferDeepDiveVoiceNotes` still
 * shows them, read-only, in a collapsed "Legacy voice notes" section —
 * preserved, never deleted, just no longer the primary interaction.
 */
export function DeepDiveStep({
  project,
  onSave,
  onContinue,
}: {
  /** No longer used by this step — dictation is browser-native (no
   *  upload), so the sub-account-scoped voice-note upload path this
   *  prop used to feed is gone. Kept optional in the type so the
   *  parent page's existing `subAccountId={subAccountId}` prop stays
   *  harmless rather than requiring a matching parent-side edit. */
  subAccountId?: string;
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
    return <ProductOfferDeepDive project={project} format={format!} onSave={onSave} onContinue={onContinue} />;
  }

  return <NormalDeepDive project={project} onSave={onSave} onContinue={onContinue} />;
}

function NormalDeepDive({
  project,
  onSave,
  onContinue,
}: {
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
          Answer these to find the real video inside your raw idea. Tap the mic next to
          any question to dictate your answer straight into the box below.
        </p>
        {GENERIC_DEEP_DIVE_QUESTIONS.map((q, i) => {
          const attached = voiceNotes.filter((vn) => vn.questionAssociation === q);
          return (
            <div key={q} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">
                  {i + 1}. {q}
                </p>
                <DictateButton value={answers} onChange={setAnswers} className="shrink-0" />
              </div>
              {attached.length > 0 && <LegacyVoiceNotes voiceNotes={attached} />}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="dd-answers">Your Deep Dive answers</Label>
          <DictateButton value={answers} onChange={setAnswers} />
        </div>
        <p className="text-xs text-muted-foreground">
          Type, paste, or dictate — everything lands here, in one place.
        </p>
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
  project,
  format,
  onSave,
  onContinue,
}: {
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">
                  Question {i + 1}: {q}
                </p>
                <DictateButton value={answers} onChange={setAnswers} className="shrink-0" />
              </div>
              {attached.length > 0 && <LegacyVoiceNotes voiceNotes={attached} />}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="po-dd-answers">
            {isShowcase ? "Deep Dive answers / additional notes" : "Deep Dive answers"}
          </Label>
          <DictateButton value={answers} onChange={setAnswers} />
        </div>
        <p className="text-xs text-muted-foreground">
          Type, paste, or dictate — tap the mic next to a question above, or here for
          anything general.
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
