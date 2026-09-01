"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionFieldForm, type FieldSpec } from "@/components/settings/business-brain/field-form";
import { PositioningTab } from "@/components/settings/business-brain/positioning-tab";
import { RecordListEditor, type RecordFieldSpec } from "@/components/settings/business-brain/record-list-editor";
import { TopicsTab } from "@/components/settings/business-brain/topics-tab";
import { FRAMEWORK_TYPES } from "@/lib/business-brain/enums";
import { storyTypeOptions } from "@/lib/business-brain/enums";
import type {
  BusinessBrain,
  BusinessBrainAudience,
  BusinessBrainFramework,
  BusinessBrainOffer,
  BusinessBrainStory,
  BusinessBrainVision,
  BusinessBrainVoice,
} from "@/types/business-brain";

/**
 * Settings -> Business Brain — the shared, sub-account-level strategic
 * context UI. Not owned by YouTube Content Studio or any other module;
 * this is the ONE place the canonical `businessBrain/main` document gets
 * edited, via the same `getBusinessBrain`/PATCH-by-section write path any
 * future consumer (YTCS Phase 1, Content Alchemy Lab) will read from —
 * no UI-specific duplicate representation.
 *
 * Section nav is a SegmentedControl (existing component, no new pattern)
 * over the 8 canonical sections; each section's content and save
 * behavior lives in its own small component under ./business-brain/.
 */

type SectionKey =
  | "vision"
  | "audience"
  | "offers"
  | "frameworks"
  | "stories"
  | "voice"
  | "topics"
  | "positioning";

const SECTIONS: { value: SectionKey; label: string }[] = [
  { value: "vision", label: "Creator Vision" },
  { value: "audience", label: "Audience" },
  { value: "offers", label: "Offers" },
  { value: "frameworks", label: "Frameworks" },
  { value: "stories", label: "Stories + Proof" },
  { value: "voice", label: "Brand Voice" },
  { value: "topics", label: "Topics + Subtopics" },
  { value: "positioning", label: "Positioning" },
];

const VISION_FIELDS: FieldSpec<BusinessBrainVision>[] = [
  { key: "statement", label: "Creator Vision Statement or Main Brand Belief", rows: 3 },
  { key: "knownFor", label: "What you want your content to be known for", rows: 3 },
  { key: "feelRealize", label: "What people should feel or realize after watching", rows: 3 },
  { key: "believe", label: "What you fundamentally believe", rows: 3 },
  { key: "against", label: "What you stand against", rows: 3 },
  { key: "transformation", label: "The transformation you care about most", rows: 3 },
  { key: "different", label: "What makes your point of view different", rows: 3 },
  { key: "returnTo", label: "What your content should keep returning to", rows: 3 },
];

const AUDIENCE_FIELDS: FieldSpec<BusinessBrainAudience>[] = [
  { key: "help", label: "Who I Help", rows: 3 },
  { key: "struggling", label: "What They Are Struggling With Right Now", rows: 3 },
  { key: "want", label: "What They Want Instead", rows: 3 },
  { key: "understandBeforeTrust", label: "What They Need to Understand Before They Trust My Work", rows: 3 },
  { key: "tired", label: "What They Are Tired of Hearing", rows: 3 },
  { key: "wrong", label: "What They Believe Is Wrong With Them", rows: 3 },
  { key: "identity", label: "The Identity They Are Trying to Step Into", rows: 3 },
  { key: "objections", label: "Objections or Hesitations Before Working With Me", rows: 3 },
  { key: "unaware", label: "Unaware Stage", groupHeading: "Awareness Stages", rows: 3 },
  { key: "problemAware", label: "Problem Aware Stage", rows: 3 },
  { key: "solutionAware", label: "Solution Aware Stage", rows: 3 },
  { key: "productAware", label: "Product Aware Stage", rows: 3 },
  { key: "mostAware", label: "Most Aware Stage", rows: 3 },
];

const VOICE_FIELDS: FieldSpec<BusinessBrainVoice>[] = [
  { key: "sound", label: "How My Content Should Sound", rows: 3 },
  { key: "wordsOften", label: "Words or Phrases I Use Often", rows: 3 },
  { key: "wordsAvoid", label: "Words or Phrases to Avoid", rows: 3 },
  { key: "feelLikeYou", label: "What Makes My Voice Feel Like Me", rows: 3 },
  { key: "tone", label: "Tone Preferences", rows: 3 },
  { key: "rules", label: "Style Rules", rows: 4 },
];

const OFFER_FIELDS: RecordFieldSpec<BusinessBrainOffer>[] = [
  { key: "name", label: "Offer Name", type: "text" },
  { key: "price", label: "Price", type: "text" },
  { key: "who", label: "Who It's For", type: "textarea", rows: 2 },
  { key: "transformation", label: "Transformation", type: "textarea", rows: 2 },
  { key: "problem", label: "What Problem This Offer Solves", type: "textarea", rows: 2 },
  { key: "when", label: "When This Offer Should Be Mentioned In Content", type: "textarea", rows: 2 },
  { key: "viewerStage", label: "Best-Fit Viewer Stage", type: "text" },
  { key: "link", label: "Offer Link", type: "text" },
  { key: "notes", label: "Notes", type: "textarea", rows: 2 },
];

const FRAMEWORK_FIELDS: RecordFieldSpec<BusinessBrainFramework>[] = [
  { key: "name", label: "Framework Name", type: "text" },
  { key: "type", label: "Framework Type", type: "select", options: [...FRAMEWORK_TYPES] },
  { key: "helpDo", label: "What This Framework Helps People Do", type: "textarea", rows: 2 },
  { key: "who", label: "Who This Framework Is For", type: "textarea", rows: 2 },
  { key: "steps", label: "Main Steps, Phases, or Principles", type: "textarea", rows: 3 },
  { key: "different", label: "What Makes This Framework Different", type: "textarea", rows: 2 },
  { key: "misunderstand", label: "What People Misunderstand About This Topic", type: "textarea", rows: 2 },
  { key: "transformation", label: "How This Framework Creates the Transformation", type: "textarea", rows: 2 },
  { key: "when", label: "When This Framework Should Be Used In Content", type: "textarea", rows: 2 },
  { key: "relatedOffer", label: "Related Offer", type: "text" },
  { key: "ideas", label: "Example Video Ideas From This Framework", type: "textarea", rows: 2 },
  { key: "notes", label: "Notes", type: "textarea", rows: 2 },
];

export function SubAccountBusinessBrainSection() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [brain, setBrain] = useState<BusinessBrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("vision");

  useEffect(() => {
    if (!subAccountId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/sub-accounts/${subAccountId}/business-brain`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          brain?: BusinessBrain | null;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't load Business Brain.");
        if (!cancelled) setBrain(data.brain ?? {});
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load Business Brain.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  async function patchSection(partial: Partial<BusinessBrain>) {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/business-brain`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      brain?: BusinessBrain | null;
      error?: string;
    };
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save.");
    setBrain(data.brain ?? {});
  }

  if (!isAdmin) return null;

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Business Brain</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Shared strategic context — audience, voice, offers, frameworks,
            stories, topics, and positioning — available to every
            AI-assisted content feature in this workspace.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Business Brain…
        </div>
      )}

      {loadError && !loading && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="space-y-5">
          <div className="overflow-x-auto">
            <SegmentedControl value={section} onChange={setSection} options={SECTIONS} />
          </div>

          {section === "vision" && (
            <SectionFieldForm
              value={brain?.vision}
              fields={VISION_FIELDS}
              onSave={(next) => patchSection({ vision: next })}
            />
          )}

          {section === "audience" && (
            <SectionFieldForm
              value={brain?.audience}
              fields={AUDIENCE_FIELDS}
              onSave={(next) => patchSection({ audience: next })}
            />
          )}

          {section === "voice" && (
            <SectionFieldForm
              value={brain?.voice}
              fields={VOICE_FIELDS}
              onSave={(next) => patchSection({ voice: next })}
            />
          )}

          {section === "positioning" && (
            <PositioningTab
              value={brain?.positioning}
              onSave={(next) => patchSection({ positioning: next })}
            />
          )}

          {section === "offers" && (
            <RecordListEditor
              records={brain?.offers ?? []}
              fields={OFFER_FIELDS}
              titleField="name"
              subtitleField="price"
              emptyLabel="No offers saved yet."
              addLabel="Add Offer"
              makeNewRecord={() => ({ id: newId(), name: "", price: "", who: "", transformation: "", problem: "", when: "", viewerStage: "", link: "", notes: "" })}
              onSave={(next) => patchSection({ offers: next })}
            />
          )}

          {section === "frameworks" && (
            <RecordListEditor
              records={brain?.frameworks ?? []}
              fields={FRAMEWORK_FIELDS}
              titleField="name"
              subtitleField="type"
              emptyLabel="No frameworks saved yet."
              addLabel="Add Framework"
              makeNewRecord={() => ({ id: newId(), name: "", type: "", helpDo: "", who: "", steps: "", different: "", misunderstand: "", transformation: "", when: "", relatedOffer: "", ideas: "", notes: "" })}
              onSave={(next) => patchSection({ frameworks: next })}
            />
          )}

          {section === "stories" && (
            <RecordListEditor
              records={brain?.stories ?? []}
              fields={[
                { key: "name", label: "Story Name", type: "text" },
                {
                  key: "type",
                  label: "Story Type",
                  type: "select",
                  options: storyTypeOptions,
                },
                { key: "problem", label: "Problem", type: "textarea", rows: 3 },
                { key: "pursuit", label: "Pursuit", type: "textarea", rows: 3 },
                { key: "payoff", label: "Payoff", type: "textarea", rows: 3 },
                { key: "lesson", label: "Key Lesson", type: "textarea", rows: 2 },
                { key: "rawTranscript", label: "Raw Story Transcript / Notes", type: "textarea", rows: 4 },
              ] satisfies RecordFieldSpec<BusinessBrainStory>[]}
              titleField="name"
              subtitleField="type"
              emptyLabel="No stories saved yet."
              addLabel="Add Story"
              makeNewRecord={() => ({ id: newId(), name: "", type: "", problem: "", pursuit: "", payoff: "", lesson: "", rawTranscript: "" })}
              onSave={(next) => patchSection({ stories: next })}
            />
          )}

          {section === "topics" && (
            <TopicsTab
              topics={brain?.topics ?? []}
              subtopics={brain?.subtopics ?? []}
              onSave={(next) => patchSection({ topics: next.topics, subtopics: next.subtopics })}
            />
          )}
        </div>
      )}
    </section>
  );
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
