/**
 * Title Prompt Builder — Step 5 (migration spec §12). Deterministic
 * template assembly, zero AI/OpenRouter calls — same discipline as
 * `script-prompt.ts` (Phase 2). The final active product is a
 * copy-paste AI prompt, not an in-app title generator; the old in-app
 * generator's real output (`generatedTitles`/`top3Titles`, `legacy`
 * bucket) is preserved read-only and never resurrected here.
 *
 * The header below is VERIFIED VERBATIM, not reconstructed from the
 * dossier's abbreviated description — it is the real, live-generated
 * `generatedTitlePrompt` text found byte-identical across TWO
 * independent real projects (`86417107-f51a-...`, `f4a91664-...`),
 * confirming it is genuine deterministic output, not AI-varying
 * content. This supersedes the dossier's requirements list per this
 * migration's precedence model (real exported data > live audit >
 * dossier) — see the migration spec's Phase 3B addendum for the full
 * evidence trail. Notably the real template omits "Trend-Jacking"
 * entirely (the dossier lists it as "only if appropriate"); the real
 * captured version simply never includes it, so it's left out here too
 * rather than force-added.
 *
 * A third real project (`cf95ee97-...`) has a DIFFERENT, older
 * generatedTitlePrompt (15 titles, positioning-element references, a
 * "video context" fallback instead of requiring the Final Script
 * Draft, per-title "Thumbnail Angle" — a field the dossier explicitly
 * rejects keeping). This is the pre-pivot legacy generator's output —
 * outweighed 2-to-1 by the cross-confirmed template below, and matches
 * exactly what this migration's own locked decision already rejects
 * ("do not resurrect deprecated historical title-generation systems").
 * That real string is preserved and still rendered as-is if a project
 * already has it saved (never regenerated away), but all NEW
 * generation uses only the template below.
 */

import type { BusinessBrain } from "@/types/business-brain";

/** VERIFIED VERBATIM real live-generated prompt header, cross-confirmed
 *  byte-identical across 2 real projects. */
const HEADER = `You are helping me create strong YouTube title options based on my final script.

Use the script as the main source of truth.

Do not create generic titles.
Do not create repeated titles.
Do not invent results, numbers, timelines, years, or claims.
Do not use outdated years.
Do not use placeholder phrasing.
Do not use vague titles that could apply to any video.

Create 10 title options.

Use a mix of title types when they fit:
Benefit-Focused
Question-Based
Controversial / Bold
How-To / Tutorial
Authority / Expertise
Curiosity / Viral
Emotional / Story
Search-Driven
Positioning-Led

At least 2 titles should be Search-Driven or SEO-friendly if the script supports it.

For each title, include:
Title Type
Title
Character Count

Choose the Top 3 titles and label them:
Top Pick

For each Top Pick, explain:
Why this title works
What viewer tension it speaks to
What curiosity, promise, or benefit it creates
Why it fits the script

Also include:
3 thumbnail text ideas based on the strongest title options.

Final Script Draft:`;

/** VERIFIED VERBATIM (migration spec §12) — shown in the UI, not part
 *  of the generated prompt text itself. */
export const MISSING_SCRIPT_GUARD =
  "Add your final script first so the title prompt can be based on the actual video… not a vague idea wearing a blazer.";

export interface TitlePromptContext {
  compiledScript: string;
  businessBrain: BusinessBrain | null;
}

/**
 * Assembles the Title Prompt exactly like the real captured template:
 * header + Final Script Draft + (Audience Context, if real content
 * exists) + (Brand Voice, if real content exists). Both trailing
 * sections were confirmed, byte-for-byte, to be the Business Brain
 * `audience.help` / `voice.sound` fields pasted verbatim — no separate
 * wording was ever added around them beyond the section label — so
 * they're included only when there's real content, never as an empty
 * heading.
 */
export function buildTitlePrompt({ compiledScript, businessBrain }: TitlePromptContext): string {
  // Not trimmed — confirmed via a real-data round trip that the real
  // template inserts the Final Script Draft exactly as stored,
  // including a real project with real leading whitespace in its
  // compiledScript.
  const parts = [`${HEADER}\n${compiledScript}`];

  const audience = businessBrain?.audience?.help?.trim();
  if (audience) {
    parts.push("", "Audience Context:", audience);
  }

  const voice = businessBrain?.voice?.sound?.trim();
  if (voice) {
    parts.push("", "Brand Voice:", voice);
  }

  // The real captured template ends with exactly one trailing newline
  // after the last section (confirmed via a real-data round trip).
  return `${parts.join("\n")}\n`;
}
