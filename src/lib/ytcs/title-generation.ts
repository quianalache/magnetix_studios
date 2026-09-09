/**
 * In-app Generate Titles — structured-output contract (2026-09-09
 * Script + Titles AI UX pass; per-title analysis expanded 2026-09-10).
 * `buildTitlePrompt()` (title-prompt.ts) is completely unchanged and
 * still IS the real, verified-verbatim copy-paste prompt used by the
 * external/secondary path. This file only adds what the copy-paste
 * prompt never needed: an instruction telling the model to answer in a
 * specific JSON shape, plus a strict server-side parser/validator for
 * that shape — so the UI never has to scrape freeform prose.
 *
 * Per-title analysis (2026-09-10, explicit instruction): the real
 * verified prompt only asks for a "Why this title works / viewer
 * tension / curiosity, promise, or benefit / why it fits the script"
 * explanation on the Top 3 titles, and one SHARED set of 3 thumbnail
 * ideas for the whole batch — not per-title, not for all 10. The
 * in-app JSON contract below deliberately asks for MORE than that: a
 * full explanation and its own 3 thumbnail ideas on EVERY one of the
 * 10 titles, so each card can carry its own complete analysis instead
 * of only the single highest-ranked title having one. This is a
 * disclosed, explicitly-authorized expansion of the in-app generation
 * experience only — the external copy-paste prompt (`buildTitlePrompt`)
 * is byte-for-byte unchanged, so a user who prefers pasting into their
 * own AI tool still gets exactly the real, verified strategy, nothing
 * added or removed.
 */

import { buildTitlePrompt, type TitlePromptContext } from "@/lib/ytcs/title-prompt";

export interface GeneratedTitleOption {
  title: string;
  titleType: string;
  characterCount: number;
  /** 1, 2, or 3 for the three titles the model calls out as "Top Pick";
   *  undefined for the other 7. */
  topPickRank?: 1 | 2 | 3;
  whyItWorks: string;
  viewerTension: string;
  curiosityPromiseBenefit: string;
  whyItFitsScript: string;
  /** This title's own 3 thumbnail ideas — distinct from every other
   *  title's, not one shared set for the whole batch. */
  thumbnailIdeas: [string, string, string];
}

export interface GeneratedTitleSet {
  titles: GeneratedTitleOption[];
}

/** Legacy shape only (2026-09-09 through 2026-09-10) — no longer
 *  written by a new generation (superseded by the per-title analysis
 *  fields on `GeneratedTitleOption` itself), kept only so
 *  `YtcsVideoProject.titleTopPick`'s type still describes the one real
 *  project that already has data in this old shape. */
export interface GeneratedTitleTopPick {
  title: string;
  whyItWorks: string;
  viewerTension: string;
  curiosityPromiseBenefit: string;
  whyItFitsScript: string;
}

const JSON_FORMAT_INSTRUCTIONS = `

Respond with ONLY valid JSON — no markdown code fences, no commentary before or after — matching exactly this shape:

{
  "titles": [
    {
      "title": string,
      "titleType": string,
      "characterCount": number,
      "topPickRank": number or null,
      "whyItWorks": string,
      "viewerTension": string,
      "curiosityPromiseBenefit": string,
      "whyItFitsScript": string,
      "thumbnailIdeas": [string, string, string]
    }
  ]
}

Requirements:
- "titles" must have exactly 10 entries.
- Exactly 3 of those entries have "topPickRank" set to 1, 2, or 3 (one each, no repeats) — these are the Top 3 / Top Pick titles. The other 7 entries have "topPickRank": null.
- EVERY entry (all 10, not just the Top 3) must include its own real "whyItWorks", "viewerTension", "curiosityPromiseBenefit", and "whyItFitsScript" — written specifically about THAT title, not a generic or shared explanation.
- EVERY entry (all 10) must include its own "thumbnailIdeas" — exactly 3 thumbnail text ideas specific to THAT title, not one shared set for the whole batch.
- "characterCount" must be the real character count of that title's "title" text.`;

/** Sent to the model for in-app generation only — the copy-paste prompt
 *  (`buildTitlePrompt()`'s own return value) is never altered. */
export function buildTitleGenerationPrompt(context: TitlePromptContext): string {
  return `${buildTitlePrompt(context)}${JSON_FORMAT_INSTRUCTIONS}`;
}

/** Strips a leading/trailing ```json ... ``` or ``` ... ``` fence if the
 *  model wrapped its JSON in one despite being asked not to — a common,
 *  harmless deviation worth tolerating rather than failing on. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Strict validator — throws a descriptive `Error` on ANY shape
 * violation so the route can return a clean, recoverable error instead
 * of saving malformed data. Never guesses/repairs a bad shape.
 */
export function parseTitleGenerationResponse(raw: string): GeneratedTitleSet {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new Error("The AI response wasn't valid JSON.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("The AI response wasn't a JSON object.");
  }
  const obj = data as Record<string, unknown>;

  const titlesRaw = obj.titles;
  if (!Array.isArray(titlesRaw) || titlesRaw.length !== 10) {
    throw new Error("Expected exactly 10 titles in the AI response.");
  }
  const titles: GeneratedTitleOption[] = titlesRaw.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`Title ${i + 1} wasn't a valid object.`);
    const to = t as Record<string, unknown>;
    if (!isNonEmptyString(to.title)) throw new Error(`Title ${i + 1} is missing its title text.`);
    if (!isNonEmptyString(to.titleType)) throw new Error(`Title ${i + 1} is missing its title type.`);
    if (typeof to.characterCount !== "number" || !Number.isFinite(to.characterCount)) {
      throw new Error(`Title ${i + 1} is missing a valid character count.`);
    }
    const rank = to.topPickRank;
    if (rank !== null && rank !== 1 && rank !== 2 && rank !== 3) {
      throw new Error(`Title ${i + 1} has an invalid topPickRank.`);
    }
    if (!isNonEmptyString(to.whyItWorks)) throw new Error(`Title ${i + 1} is missing "whyItWorks".`);
    if (!isNonEmptyString(to.viewerTension)) throw new Error(`Title ${i + 1} is missing "viewerTension".`);
    if (!isNonEmptyString(to.curiosityPromiseBenefit)) {
      throw new Error(`Title ${i + 1} is missing "curiosityPromiseBenefit".`);
    }
    if (!isNonEmptyString(to.whyItFitsScript)) throw new Error(`Title ${i + 1} is missing "whyItFitsScript".`);
    const thumbs = to.thumbnailIdeas;
    if (!Array.isArray(thumbs) || thumbs.length !== 3 || !thumbs.every(isNonEmptyString)) {
      throw new Error(`Title ${i + 1} needs exactly 3 thumbnail ideas of its own.`);
    }
    return {
      title: to.title.trim(),
      titleType: to.titleType.trim(),
      characterCount: to.characterCount,
      topPickRank: rank === null ? undefined : (rank as 1 | 2 | 3),
      whyItWorks: to.whyItWorks.trim(),
      viewerTension: to.viewerTension.trim(),
      curiosityPromiseBenefit: to.curiosityPromiseBenefit.trim(),
      whyItFitsScript: to.whyItFitsScript.trim(),
      thumbnailIdeas: [
        (thumbs[0] as string).trim(),
        (thumbs[1] as string).trim(),
        (thumbs[2] as string).trim(),
      ],
    };
  });

  const ranks = titles.map((t) => t.topPickRank).filter((r): r is 1 | 2 | 3 => r !== undefined);
  if (ranks.length !== 3 || new Set(ranks).size !== 3 || !ranks.includes(1) || !ranks.includes(2) || !ranks.includes(3)) {
    throw new Error("Expected exactly 3 titles ranked 1, 2, and 3 as Top Picks.");
  }

  return { titles };
}
