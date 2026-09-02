/**
 * Publish — Step 6 (migration spec §13). Upload Checklist, Optimization
 * Checklist, Final Review, and the default YouTube Description
 * template — all VERIFIED live, verbatim, reused exactly, no invented
 * copy.
 *
 * Real-data note: only `finalReviewChecklist` has a confirmed real
 * field name (populated on 1/15 real projects, with keys that match
 * these Final Review items exactly). No real field name was ever found
 * for an Upload Checklist or Optimization Checklist — same situation
 * Phase 2 hit with Deep Dive voice notes — so `uploadChecklist` and
 * `optimizationChecklist` are new field names established here,
 * following the exact naming convention already used by
 * `recordingChecklist`/`editingChecklist`/`finalReviewChecklist`.
 */

export const UPLOAD_CHECKLIST_ITEMS = [
  "Final title added",
  "YouTube description added",
  "Primary CTA link is the first link in the description",
  "Helpful links added",
  "Watch Next link added if available",
  "Thumbnail uploaded",
  "Thumbnail text is short and readable",
  "Tags / keywords added",
  "Pinned comment added",
  "Playlist selected if relevant",
  "End screen added",
  "Cards added to relevant videos if needed",
  "Visibility setting checked",
  "Publish date and time confirmed",
];

export const OPTIMIZATION_CHECKLIST_ITEMS = [
  "Title clearly matches the video",
  "Title includes a strong keyword or searchable phrase if relevant",
  "Thumbnail supports the title instead of repeating it",
  "Thumbnail text is 3 to 5 words max when possible",
  "Description clearly explains what the video helps the viewer understand",
  "Description includes the title or main keyword naturally",
  "Description includes the main CTA or next step",
  "Pinned comment includes an engagement question or next step",
  "Video is added to the best-fit playlist if available",
  "End screen points to a relevant next video or playlist",
  "Cards are placed where they naturally support the viewer journey",
  "Tags are relevant and not stuffed with random keywords",
];

export const FINAL_REVIEW_ITEMS = [
  "Video plays correctly after upload",
  "Audio sounds clear",
  "Thumbnail looks good on mobile",
  "Title is readable on mobile",
  "Description links work",
  "Pinned comment is posted",
  "End screen and cards work",
  "Publish settings are correct",
  "YouTube link copied and saved",
];

/**
 * VERIFIED, captured from a real export record — 14/15 real projects
 * have this exact text stored verbatim as their `youtubeDescription`
 * value (not just an empty-state UI placeholder — it's seeded into the
 * field itself). Used here as the pre-filled starting text when a
 * project has no description yet; still requires an explicit Save to
 * persist, per the established YTCS text-field convention.
 */
export const DEFAULT_YOUTUBE_DESCRIPTION = `[PRIMARY CTA LINK FIRST]
Add the most important next step here. This should usually be your offer, lead magnet, community, booking link, or resource mentioned in the video.

Helpful links:
[Relevant link]
[Relevant link]

Watch next:
[Related video link]

What you’ll learn:
00:00 Intro
00:00 [Main point 1]
00:00 [Main point 2]
00:00 [Main point 3]
00:00 Next step`;
