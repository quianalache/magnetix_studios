/**
 * In-app Generate Titles — structured-output contract (2026-09-09
 * Script + Titles AI UX pass). `buildTitlePrompt()` (title-prompt.ts)
 * is completely unchanged and still IS the real, verified-verbatim
 * copy-paste prompt used by the external/secondary path. This file
 * only adds what the copy-paste prompt never needed: an instruction
 * telling the model to answer in a specific JSON shape, plus a strict
 * server-side parser/validator for that shape — so the UI never has to
 * scrape freeform prose. The underlying title strategy (10 titles, the
 * 9 listed types, at least 2 Search-Driven, Top 3 "Top Pick" with a
 * 4-part explanation each, 3 thumbnail ideas) is untouched; this is a
 * disclosed, smallest-possible adaptation for machine-readability, not
 * a new strategy.
 */

import { buildTitlePrompt, type TitlePromptContext } from "@/lib/ytcs/title-prompt";

export interface GeneratedTitleOption {
  title: string;
  titleType: string;
  characterCount: number;
  /** 1, 2, or 3 for the three titles the model calls out as "Top Pick";
   *  undefined for the other 7. */
  topPickRank?: 1 | 2 | 3;
}

export interface GeneratedTitleTopPick {
  title: string;
  whyItWorks: string;
  viewerTension: string;
  curiosityPromiseBenefit: string;
  whyItFitsScript: string;
}

export interface GeneratedTitleSet {
  titles: GeneratedTitleOption[];
  /** The rank-1 Top Pick's own explanation — the prompt asks for an
   *  explanation on all 3 Top Picks; the UI only surfaces the single
   *  highest-ranked one in its own section (see the Titles step's own
   *  doc comment for the reasoning), so only that one is kept. */
  topPick: GeneratedTitleTopPick;
  thumbnailIdeas: [string, string, string];
}

const JSON_FORMAT_INSTRUCTIONS = `

Respond with ONLY valid JSON — no markdown code fences, no commentary before or after — matching exactly this shape:

{
  "titles": [
    { "title": string, "titleType": string, "characterCount": number, "topPickRank": number or null }
  ],
  "topPick": {
    "title": string,
    "whyItWorks": string,
    "viewerTension": string,
    "curiosityPromiseBenefit": string,
    "whyItFitsScript": string
  },
  "thumbnailIdeas": [string, string, string]
}

Requirements:
- "titles" must have exactly 10 entries.
- Exactly 3 of those entries have "topPickRank" set to 1, 2, or 3 (one each, no repeats) — these are the Top 3 / Top Pick titles. The other 7 entries have "topPickRank": null.
- "topPick" describes the entry whose "topPickRank" is 1 — its "title" must exactly match that entry's "title" text.
- "thumbnailIdeas" has exactly 3 entries.
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
    return {
      title: to.title.trim(),
      titleType: to.titleType.trim(),
      characterCount: to.characterCount,
      topPickRank: rank === null ? undefined : (rank as 1 | 2 | 3),
    };
  });

  const ranks = titles.map((t) => t.topPickRank).filter((r): r is 1 | 2 | 3 => r !== undefined);
  if (ranks.length !== 3 || new Set(ranks).size !== 3 || !ranks.includes(1) || !ranks.includes(2) || !ranks.includes(3)) {
    throw new Error("Expected exactly 3 titles ranked 1, 2, and 3 as Top Picks.");
  }

  const topPickRaw = obj.topPick;
  if (!topPickRaw || typeof topPickRaw !== "object") {
    throw new Error("Missing the Top Pick explanation in the AI response.");
  }
  const tp = topPickRaw as Record<string, unknown>;
  if (
    !isNonEmptyString(tp.title) ||
    !isNonEmptyString(tp.whyItWorks) ||
    !isNonEmptyString(tp.viewerTension) ||
    !isNonEmptyString(tp.curiosityPromiseBenefit) ||
    !isNonEmptyString(tp.whyItFitsScript)
  ) {
    throw new Error("The Top Pick explanation is missing required fields.");
  }
  const rank1 = titles.find((t) => t.topPickRank === 1);
  if (!rank1 || rank1.title !== tp.title.trim()) {
    throw new Error("The Top Pick explanation doesn't match the #1-ranked title.");
  }

  const thumbnailIdeasRaw = obj.thumbnailIdeas;
  if (!Array.isArray(thumbnailIdeasRaw) || thumbnailIdeasRaw.length !== 3 || !thumbnailIdeasRaw.every(isNonEmptyString)) {
    throw new Error("Expected exactly 3 thumbnail text ideas in the AI response.");
  }

  return {
    titles,
    topPick: {
      title: tp.title.trim(),
      whyItWorks: tp.whyItWorks.trim(),
      viewerTension: tp.viewerTension.trim(),
      curiosityPromiseBenefit: tp.curiosityPromiseBenefit.trim(),
      whyItFitsScript: tp.whyItFitsScript.trim(),
    },
    thumbnailIdeas: [
      (thumbnailIdeasRaw[0] as string).trim(),
      (thumbnailIdeasRaw[1] as string).trim(),
      (thumbnailIdeasRaw[2] as string).trim(),
    ],
  };
}
