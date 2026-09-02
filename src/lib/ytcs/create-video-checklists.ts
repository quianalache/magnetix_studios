/**
 * Create Video — Step 4. Recording/Editing checklists and status values,
 * captured verbatim from the live migration audit (migration spec §11).
 * Real data confirms these are stable, real, hand-tuned content — not
 * invented here.
 *
 * Real export evidence (Phase 3A investigation): all 15 real projects'
 * `recordingChecklist` fields are empty (no real state to preserve for
 * that one); 2 of 15 real `editingChecklist` fields ARE populated, but
 * with keys that don't match ANY of the 9 canonical items below —
 * `{"Record Hook": false}` on one project and `{"c1": false, "c2":
 * false}` on another. This is a genuine historical data-quality
 * inconsistency (different keying schemes across the tool's history),
 * not something to silently normalize: those real keys are preserved
 * as-is in Firestore (Firestore's own merge-set behavior deep-merges
 * nested objects, so writing one canonical item never touches them),
 * they just don't visually map to any checkbox row here since their key
 * text doesn't match a real canonical item.
 */

export const RECORDING_CHECKLIST_ITEMS = [
  "Review your script or recording draft",
  "Make sure your background is distraction-free",
  "Record your hook",
  "Record the main teaching/body section",
  "Record your CTA",
  "Record your Watch Next bridge if using one",
  "Check lighting",
  "Check audio",
  "Check camera framing",
];

export const EDITING_CHECKLIST_ITEMS = [
  "Import your footage",
  "Arrange clips in order",
  "Remove long pauses",
  "Clean up obvious mistakes",
  "Add simple zooms or emphasis moments if desired",
  "Add captions if desired",
  "Check audio levels",
  "Color grade or adjust the video look if needed",
  "Export the final video",
];

/**
 * Real data confirms ONLY "Ready to Record" has ever been observed (10
 * of 15 real projects; the other 5 are unset). "Editing" and "Ready for
 * Titles" were specified directly as this migration's final intended
 * enum in an earlier task instruction (Create Video's own spec section)
 * — carried forward here as documented, not re-decided.
 */
export const CREATE_VIDEO_STATUSES = ["Ready to Record", "Editing", "Ready for Titles"];

export const EDITS_LAB_URL = "https://quianalache.com/the-edits-lab";
