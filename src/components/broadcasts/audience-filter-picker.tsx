"use client";

import { useMemo } from "react";
import { PIPELINE_STAGES } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type { BroadcastAudienceFilter } from "@/types";

/**
 * Extracted from the old bulk-email-dialog.tsx, which used to own both
 * template-picking AND audience-picking — the composer now owns content, so
 * this component keeps only the audience half, reused as-is. Audience
 * targeting itself is unchanged/out of scope for the broadcast rebuild (see
 * the "What's kept vs. replaced" section of the rebuild plan).
 */

export type AudienceFilterKind = "all" | "tag" | "pipeline_stage";

export interface AudienceFilterState {
  kind: AudienceFilterKind;
  tag: string;
  stage: string;
}

export function defaultAudienceFilterState(): AudienceFilterState {
  return { kind: "all", tag: "", stage: PIPELINE_STAGES[0]?.id ?? "new" };
}

export function audienceFilterToApiShape(
  state: AudienceFilterState,
): BroadcastAudienceFilter | null {
  if (state.kind === "tag") {
    return state.tag ? { kind: "tag", tag: state.tag } : null;
  }
  if (state.kind === "pipeline_stage") {
    return { kind: "pipeline_stage", stage: state.stage };
  }
  return { kind: "all" };
}

export function useAudiencePreview(
  contacts: Contact[],
  state: AudienceFilterState,
): { recipients: number; skipped: number; matching: number } {
  return useMemo(() => {
    let matching: Contact[];
    if (state.kind === "tag") {
      if (!state.tag) return { recipients: 0, skipped: 0, matching: 0 };
      matching = contacts.filter((c) => (c.tags ?? []).includes(state.tag));
    } else if (state.kind === "pipeline_stage") {
      matching = contacts.filter((c) => c.pipelineStage === state.stage);
    } else {
      matching = contacts;
    }
    let recipients = 0;
    let skipped = 0;
    for (const c of matching) {
      if (c.emailOptedOut) {
        skipped += 1;
        continue;
      }
      if (!c.email || !c.email.includes("@")) {
        skipped += 1;
        continue;
      }
      recipients += 1;
    }
    return { recipients, skipped, matching: matching.length };
  }, [contacts, state.kind, state.tag, state.stage]);
}

const SELECT_CLASS =
  "block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function AudienceFilterPicker({
  contacts,
  value,
  onChange,
}: {
  contacts: Contact[];
  value: AudienceFilterState;
  onChange: (next: AudienceFilterState) => void;
}) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      for (const t of c.tags ?? []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set).sort();
  }, [contacts]);

  const preview = useAudiencePreview(contacts, value);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">
          Audience
        </label>
        <select
          value={value.kind}
          onChange={(e) =>
            onChange({ ...value, kind: e.target.value as AudienceFilterKind })
          }
          className={SELECT_CLASS}
        >
          <option value="all">All contacts in this sub-account</option>
          <option value="tag" disabled={allTags.length === 0}>
            Contacts with a specific tag
            {allTags.length === 0 ? " (no tags exist yet)" : ""}
          </option>
          <option value="pipeline_stage">Contacts in a pipeline stage</option>
        </select>
      </div>

      {value.kind === "tag" && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            Tag
          </label>
          <select
            value={value.tag}
            onChange={(e) => onChange({ ...value, tag: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">Pick a tag…</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.kind === "pipeline_stage" && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            Pipeline stage
          </label>
          <select
            value={value.stage}
            onChange={(e) => onChange({ ...value, stage: e.target.value })}
            className={SELECT_CLASS}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Will receive email</span>
          <span className="font-mono font-semibold">{preview.recipients}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Skipped (opted out / no email)</span>
          <span className="font-mono">{preview.skipped}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Total matching</span>
          <span className="font-mono">{preview.matching}</span>
        </div>
      </div>
    </div>
  );
}
