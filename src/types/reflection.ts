import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Reflection — ported from MomentumOS's real "Reflection" tool
 * (2026-08-08, read directly from her saved logged-in capture:
 * "Momentum OS Reflection.html"). Her exact real prompts and hints,
 * verbatim, not paraphrased — this is personal, spiritually-oriented
 * content and rewording it would be exactly the kind of thin
 * substitution flagged elsewhere in this app.
 *
 * The real tool has 8 sub-tabs: Daily, Weekly, Monthly, Quarterly,
 * Money, Rituals, Notes, Memories. Only Daily was actually expanded in
 * her saved capture (the other 7 were empty `hidden` panels — she never
 * clicked into them before saving) — so only Daily is built here. The
 * other 7 need their own real capture before being built the same way,
 * rather than inventing content for something this personal.
 */

export interface DailyReflectionDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  /** YYYY-MM-DD, local to the sub-account's own "today" — one doc per day. */
  date: string;
  // AM Reflection + Intentions
  divineDownloads: string;
  availableForMagic: string;
  identityInvocation: string;
  magicalMantra: string;
  ideasThoughts: string;
  freeFlow: string;
  // PM Reflection + Review
  outcomeReflection: string;
  proofOfMagic: string;
  celebrations: string;
  improvements: string;
  freeReflection: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function emptyDailyReflectionFields() {
  return {
    divineDownloads: "",
    availableForMagic: "",
    identityInvocation: "",
    magicalMantra: "",
    ideasThoughts: "",
    freeFlow: "",
    outcomeReflection: "",
    proofOfMagic: "",
    celebrations: "",
    improvements: "",
    freeReflection: "",
  };
}

export interface ReflectionPrompt {
  key: keyof ReturnType<typeof emptyDailyReflectionFields>;
  label: string;
  hint: string;
}

/** Real, verbatim from the saved page — "AM Reflection + Intentions" card. */
export const AM_PROMPTS: ReflectionPrompt[] = [
  { key: "divineDownloads", label: "Divine Downloads", hint: "What messages, ideas, or intuitive insights are coming through?" },
  { key: "availableForMagic", label: "Available For Magic", hint: "What opportunities, outcomes, or experiences are you open to receiving today?" },
  { key: "identityInvocation", label: "Identity Invocation", hint: "What identity are you stepping into today? What qualities, thoughts, beliefs, and actions define this version of you?" },
  { key: "magicalMantra", label: "Magical Mantra", hint: "What mantra, quote, or words set the tone for your day?" },
  { key: "ideasThoughts", label: "Ideas + Thoughts", hint: "What ideas, concepts, or thoughts are currently on your mind?" },
  { key: "freeFlow", label: "Free Flow", hint: "Use this space for free writing, downloads, strategy thoughts, or anything else." },
];

/** Real, verbatim from the saved page — "PM Reflection + Review" card. */
export const PM_PROMPTS: ReflectionPrompt[] = [
  { key: "outcomeReflection", label: "Outcome Reflection", hint: "What worked well today? What progress or movement happened?" },
  { key: "proofOfMagic", label: "Proof of Magic", hint: "What evidence did you see that your desired outcomes are becoming reality?" },
  { key: "celebrations", label: "Celebrations", hint: "What are you celebrating today?" },
  { key: "improvements", label: "Improvements", hint: "What could be improved or approached differently tomorrow?" },
  { key: "freeReflection", label: "Free Reflection", hint: "Use this space for additional thoughts, emotional processing, or reflections." },
];

/**
 * "Operational Awareness" mini-stats — real where a source system exists,
 * honestly zero where it doesn't (same "honest substitute" rule as
 * Growth's Hours Tracked/Momentum Score). Rituals has no tracking system
 * in this app at all — it's literally one of the 7 un-built Reflection
 * sub-tabs — so it's a flagged placeholder, not a fake number.
 */
export interface DailyOperationalStats {
  tasksCompleted: number;
  ritualsCompleted: number | null; // null = no source system yet, not "0 rituals done"
  income: number;
  netFlow: number;
  contentPublished: number;
  hoursTracked: number; // manual/no tracking source yet, same honesty as Growth's Hours Tracked
}
