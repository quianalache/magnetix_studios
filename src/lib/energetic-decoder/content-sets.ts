/**
 * Content Sets (2026-10-07) — the pure, client-safe model behind
 * Energetic Decoder → Content.
 *
 * A Reading is the CALCULATION. A Content Set is reusable INTERPRETATION
 * text (plus optional custom terms) for that calculation. A Report Design
 * will later pick one Content Set, and the generated report freezes the
 * text it used. Different sets (General, Business & Career, a Spanish
 * translation…) can describe the same chart without recalculating it.
 *
 * Two kinds of set:
 *   - "default": built in, one per workspace, never deletable. It IS the
 *     existing Magnetix library: shipped defaults + the workspace's own
 *     edits (the legacy override collections, unchanged), so readings and
 *     report designs keep working exactly as before. No migration.
 *   - custom sets: independent copies (start from Default, Blank or another
 *     set), stored in `contentSets/{id}` + `entries/{entryId}`.
 *
 * Locked rules (owner, 2026-10-07):
 *   - Status is operational (Active / Draft), never completeness.
 *   - Missing content stays BLANK. Nothing here ever substitutes Default
 *     text into a custom set — Default is only an editing reference.
 *   - Fields are predetermined per category (no practitioner-made fields).
 *   - A custom term changes the displayed label, never the calculated key.
 *
 * No React, no Firestore — tested in scripts/check-content-sets.ts.
 */

export const DEFAULT_CONTENT_SET_ID = "default";
export const DEFAULT_CONTENT_SET_NAME = "Default";

export const CONTENT_SET_NAME_MAX = 80;
export const CONTENT_SET_DESCRIPTION_MAX = 100;
export const CONTENT_TERM_MAX = 80;

export type ContentSystem = "hd" | "astro" | "freq";
export type ContentSetStatus = "active" | "draft";
export const CONTENT_SET_STATUSES: ContentSetStatus[] = ["active", "draft"];

export const CONTENT_SYSTEMS: { key: ContentSystem; label: string }[] = [
  { key: "hd", label: "Human Design" },
  { key: "astro", label: "Astrology" },
  { key: "freq", label: "Frequency" },
];

export interface ContentFieldSchema {
  key: string;
  label: string;
  /** Character limit, enforced in the UI and on the server (never truncated). */
  max: number;
  /** Multi-line text area vs one line. */
  long: boolean;
  /** Short hint shown under the label. */
  hint?: string;
}

export interface ContentCategorySchema {
  /** `${system}:${category}` — matches the legacy content ids (hd:type:Generator…). */
  id: string;
  system: ContentSystem;
  category: string;
  label: string;
  /** Singular noun for one entry ("Type", "Gate"). */
  noun: string;
  fields: ContentFieldSchema[];
  /** Whether custom sets may provide a practitioner-facing replacement term. */
  allowCustomLabel?: boolean;
}

const LONG = 2000;
const SHORT = 300;

/**
 * The categories that have a real interpretation schema today — the current
 * Magnetix Content categories, with their existing richer fields kept
 * (Centers: defined/undefined/headline; Frequency gates: shadow/gift).
 * Adding a category later (Channels, Gate Lines, Incarnation Crosses,
 * planet-in-sign…) is one more entry here plus its default copy — the
 * editor, progress, export/import and report resolver all read this list.
 * A category is only listed when its interpretation schema exists:
 * calculation support alone never creates an editable (empty) category.
 */
export const CONTENT_CATEGORIES: ContentCategorySchema[] = [
  {
    id: "hd:type", system: "hd", category: "type", label: "Types", noun: "Type",
    fields: [
      { key: "strategy", label: "Strategy", max: SHORT, long: false },
      { key: "description", label: "Interpretation", max: LONG, long: true },
    ],
  },
  {
    id: "hd:authority", system: "hd", category: "authority", label: "Authorities", noun: "Authority",
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "hd:line", system: "hd", category: "line", label: "Profile Lines", noun: "Profile Line",
    fields: [{ key: "name", label: "Line name", max: 120, long: false, hint: "Used for Profiles, e.g. “The Investigator / The Martyr”." }],
  },
  {
    id: "hd:center", system: "hd", category: "center", label: "Centers", noun: "Center",
    fields: [
      { key: "definedText", label: "When defined", max: LONG, long: true },
      { key: "undefinedText", label: "When undefined", max: LONG, long: true },
      { key: "strengthHeadline", label: "Strength headline (Skills & Attributes)", max: SHORT, long: false },
    ],
  },
  {
    id: "hd:crossAngle", system: "hd", category: "crossAngle", label: "Incarnation Cross Angles", noun: "Cross Angle",
    fields: [{ key: "framing", label: "Framing line (Skills & Attributes)", max: 600, long: true }],
  },
  {
    id: "hd:channel", system: "hd", category: "channel", label: "Channels", noun: "Channel", allowCustomLabel: false,
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "hd:incarnationCross", system: "hd", category: "incarnationCross", label: "Incarnation Crosses", noun: "Incarnation Cross", allowCustomLabel: false,
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  ...(["digestion", "sense", "designSense", "motivation", "perspective", "environment"] as const).map((c) => ({
    id: `hd:${c}`,
    system: "hd" as const,
    category: c,
    label: { digestion: "Digestion", sense: "Sense", designSense: "Design Sense", motivation: "Motivation", perspective: "Perspective", environment: "Environment" }[c],
    noun: { digestion: "Digestion", sense: "Sense", designSense: "Design Sense", motivation: "Motivation", perspective: "Perspective", environment: "Environment" }[c],
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  })),
  {
    id: "astro:sign", system: "astro", category: "sign", label: "Signs", noun: "Sign",
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "astro:house", system: "astro", category: "house", label: "Houses", noun: "House",
    fields: [
      { key: "theme", label: "Theme", max: SHORT, long: false },
      { key: "description", label: "Interpretation", max: LONG, long: true },
    ],
  },
  {
    id: "astro:aspect", system: "astro", category: "aspect", label: "Aspect Types", noun: "Aspect",
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "astro:planetSign", system: "astro", category: "planetSign", label: "Planet in Sign", noun: "Planet in Sign", allowCustomLabel: false,
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "astro:planetHouse", system: "astro", category: "planetHouse", label: "Planet in House", noun: "Planet in House", allowCustomLabel: false,
    fields: [{ key: "description", label: "Interpretation", max: LONG, long: true }],
  },
  {
    id: "freq:gate", system: "freq", category: "gate", label: "Gates", noun: "Gate",
    fields: [
      { key: "showsUp", label: "How the shadow shows up", max: LONG, long: true },
      { key: "giftText", label: "How the gift shows up", max: LONG, long: true },
    ],
  },
];

export function categorySchema(categoryId: string): ContentCategorySchema | undefined {
  return CONTENT_CATEGORIES.find((c) => c.id === categoryId);
}

/** Entry id = `${system}:${category}:${key}` (Frequency gates: `freq:gate:12`). */
export function contentEntryId(system: ContentSystem, category: string, key: string): string {
  return `${system}:${category}:${key}`;
}

export function parseContentEntryId(id: string): { system: ContentSystem; category: string; key: string; categoryId: string } | null {
  const m = /^(hd|astro|freq):([A-Za-z]+):(.+)$/.exec(id);
  if (!m) return null;
  return { system: m[1] as ContentSystem, category: m[2], key: m[3], categoryId: `${m[1]}:${m[2]}` };
}

/** One entry of the catalog: what exists to be written about (never the text). */
export interface ContentCatalogEntry {
  id: string;
  system: ContentSystem;
  category: string;
  key: string;
  /** The canonical Magnetix label ("Generator", "Gate 12") — never changes. */
  canonicalLabel: string;
}

/** One entry's values inside one set. Missing field = blank. */
export interface ContentEntryValues {
  /** Optional custom term shown instead of the canonical label (e.g. "Doer"). */
  label?: string | null;
  fields: Record<string, string>;
}

export type ContentEntryState = "complete" | "customized" | "needs_content" | "not_started";

export const ENTRY_STATE_LABEL: Record<ContentEntryState, string> = {
  complete: "Complete",
  customized: "Customized",
  needs_content: "Needs content",
  not_started: "Not started",
};

function filled(v: string | undefined | null): boolean {
  return !!v && v.trim().length > 0;
}

/**
 * Editor-level progress cue for one entry — never the set's Active/Draft.
 *   Default set:  Customized (the workspace rewrote it) / Complete (shipped).
 *   Custom set:   Not started (nothing written) / Needs content (some fields
 *                 blank) / Customized (all written, differs from Default or
 *                 has a custom term) / Complete (all written, same as Default).
 */
export function entryState(
  schema: ContentCategorySchema,
  values: ContentEntryValues | undefined,
  defaults: ContentEntryValues | undefined,
  opts: { isDefaultSet: boolean; defaultCustomized?: boolean },
): ContentEntryState {
  if (opts.isDefaultSet) {
    const authored = schema.fields.every((f) => filled(values?.fields?.[f.key]));
    if (!authored) return "not_started";
    return opts.defaultCustomized ? "customized" : "complete";
  }
  const vals = schema.fields.map((f) => values?.fields?.[f.key]);
  const n = vals.filter(filled).length;
  if (n === 0 && !filled(values?.label)) return "not_started";
  if (n < schema.fields.length) return "needs_content";
  const differs = filled(values?.label) || schema.fields.some((f) => (values?.fields?.[f.key] ?? "").trim() !== (defaults?.fields?.[f.key] ?? "").trim());
  return differs ? "customized" : "complete";
}

/** "12 of 24" per system: entries that are Complete or Customized, out of all entries. */
export function systemProgress(states: ContentEntryState[]): { done: number; total: number; label: "Not started" | "In progress" | "Complete" } {
  const total = states.length;
  const done = states.filter((s) => s === "complete" || s === "customized").length;
  const touched = states.some((s) => s !== "not_started");
  return { done, total, label: total > 0 && done === total ? "Complete" : touched ? "In progress" : "Not started" };
}

/**
 * What a report gets for one entry from one set — the custom term (or the
 * canonical label) and the set's own text. NO fallback: a blank field stays
 * blank even when Default has text for it.
 */
export function resolveEntryForReport(
  entry: ContentCatalogEntry,
  values: ContentEntryValues | undefined,
): { canonical: string; label: string; fields: Record<string, string> } {
  const term = values?.label?.trim();
  return { canonical: entry.canonicalLabel, label: term || entry.canonicalLabel, fields: { ...(values?.fields ?? {}) } };
}

/** The slice of a reading needed to know which entries a report would use. */
export interface ContentReadingInput {
  humanDesign?: {
    type?: string;
    authority?: string;
    profile?: string | null;
    definedCenters?: string[];
    openCenters?: string[];
    variables?: Partial<Record<"digestion" | "sense" | "designSense" | "motivation" | "perspective" | "environment", { value: string }>>;
    definedChannels?: { key: string }[];
    incarnationCross?: string | null;
  } | null;
  astrology?: {
    placements?: { body: string; sign: string; house: number }[];
    angles?: { ascendant?: { sign: string } };
    aspects?: { type: string }[];
  } | null;
  spheres?: { gate: number }[];
}

/**
 * Every (entry, field) a report for this reading could draw on — the basis
 * for the pre-generation "missing content" warning. Mirrors what the
 * interpretation shortcodes read today (Type, Authority, Profile lines, the
 * 9 Centers' defined/undefined text, Sun/Moon/Rising/Chiron signs, the Sun's
 * house, the tightest aspect, the Variables, the Frequency sphere gates).
 */
export function contentNeededForReading(reading: ContentReadingInput): { entryId: string; field: string }[] {
  const out: { entryId: string; field: string }[] = [];
  const add = (entryId: string, field: string) => {
    if (!out.some((o) => o.entryId === entryId && o.field === field)) out.push({ entryId, field });
  };
  const hd = reading.humanDesign;
  if (hd?.type) { add(contentEntryId("hd", "type", hd.type), "strategy"); add(contentEntryId("hd", "type", hd.type), "description"); }
  if (hd?.authority) add(contentEntryId("hd", "authority", hd.authority), "description");
  if (hd?.profile) for (const line of hd.profile.split("/").map((s) => s.trim()).filter(Boolean)) add(contentEntryId("hd", "line", line), "name");
  for (const c of hd?.definedCenters ?? []) add(contentEntryId("hd", "center", c), "definedText");
  for (const c of hd?.openCenters ?? []) add(contentEntryId("hd", "center", c), "undefinedText");
  for (const [cat, v] of Object.entries(hd?.variables ?? {})) if (v?.value) add(contentEntryId("hd", cat, v.value), "description");
  for (const channel of hd?.definedChannels ?? []) add(contentEntryId("hd", "channel", channel.key), "description");
  if (hd?.incarnationCross) {
    const cross = INCARNATION_CROSSES.find((entry) => entry.label === hd.incarnationCross || entry.name === hd.incarnationCross);
    if (cross) add(contentEntryId("hd", "incarnationCross", cross.key), "description");
  }
  const astro = reading.astrology;
  for (const body of ["sun", "moon", "chiron"]) {
    const p = astro?.placements?.find((x) => x.body === body);
    if (p) add(contentEntryId("astro", "sign", p.sign), "description");
  }
  if (astro?.angles?.ascendant?.sign) add(contentEntryId("astro", "sign", astro.angles.ascendant.sign), "description");
  const sun = astro?.placements?.find((x) => x.body === "sun");
  if (sun) { add(contentEntryId("astro", "house", String(sun.house)), "theme"); add(contentEntryId("astro", "house", String(sun.house)), "description"); }
  if (astro?.aspects?.[0]) add(contentEntryId("astro", "aspect", astro.aspects[0].type), "description");
  for (const s of reading.spheres ?? []) { add(contentEntryId("freq", "gate", String(s.gate)), "showsUp"); add(contentEntryId("freq", "gate", String(s.gate)), "giftText"); }
  return out;
}

/** The blank (entry, field) pairs this set would leave in a report for this reading. Used for the warning; never to fill anything in. */
export function missingContentForReading(
  reading: ContentReadingInput,
  values: (entryId: string) => ContentEntryValues | undefined,
): { entryId: string; field: string }[] {
  return contentNeededForReading(reading).filter((n) => !filled(values(n.entryId)?.fields?.[n.field]));
}

/** Practitioner-facing label for a missing content requirement. Internal ids
 * remain useful in logs, but should not be the primary warning copy. */
export function contentRequirementLabel(entryId: string, field: string): string {
  const parsed = parseContentEntryId(entryId);
  if (!parsed) return `${entryId} — ${field}`;
  const fieldLabel = categorySchema(parsed.categoryId)?.fields.find((f) => f.key === field)?.label ?? field;
  if (parsed.categoryId === "hd:channel") return `Channel ${parsed.key.replace(/-/g, "–")} — ${fieldLabel}`;
  if (parsed.categoryId === "hd:incarnationCross") {
    const cross = INCARNATION_CROSSES.find((entry) => entry.key === parsed.key);
    return `${cross?.label ?? `Incarnation Cross ${parsed.key}`} — ${fieldLabel}`;
  }
  if (parsed.categoryId === "astro:planetSign") {
    const [body, sign] = parsed.key.split(":");
    return `${body ? `${body[0].toUpperCase()}${body.slice(1)}` : "Planet"} in ${sign ?? "sign"} — ${fieldLabel}`;
  }
  if (parsed.categoryId === "astro:planetHouse") {
    const [body, house] = parsed.key.split(":");
    const houseNumber = Number(house);
    const suffix = houseNumber % 100 >= 11 && houseNumber % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[houseNumber % 10] ?? "th";
    return `${body ? `${body[0].toUpperCase()}${body.slice(1)}` : "Planet"} in ${Number.isFinite(houseNumber) ? `${houseNumber}${suffix}` : house ?? "house"} House — ${fieldLabel}`;
  }
  if (parsed.categoryId === "freq:gate") return `Frequency Gate ${parsed.key} — ${fieldLabel}`;
  return `${categorySchema(parsed.categoryId)?.noun ?? parsed.category} ${parsed.key} — ${fieldLabel}`;
}

// ── Validation ──────────────────────────────────────────────────────────

export function validateContentSetMeta(input: { name?: unknown; description?: unknown }): { ok: true; name: string; description: string } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!name) return { ok: false, error: "Give the content set a name." };
  if (name.length > CONTENT_SET_NAME_MAX) return { ok: false, error: `Names can be up to ${CONTENT_SET_NAME_MAX} characters.` };
  if (description.length > CONTENT_SET_DESCRIPTION_MAX) return { ok: false, error: `Descriptions can be up to ${CONTENT_SET_DESCRIPTION_MAX} characters.` };
  if (name.toLowerCase() === DEFAULT_CONTENT_SET_NAME.toLowerCase()) return { ok: false, error: "“Default” is the built-in set — choose another name." };
  return { ok: true, name, description };
}

/**
 * Validates one entry save against its category's fixed fields. Unknown
 * fields and over-length text are rejected (never truncated). Interpretation
 * fields are optional; blank content stays blank and is represented by the
 * entry state rather than a validation error.
 */
export function validateEntryInput(
  schema: ContentCategorySchema,
  input: { label?: unknown; fields?: unknown },
  opts: { allowLabel: boolean; labelError?: string },
): { ok: true; label: string | null; fields: Record<string, string> } | { ok: false; error: string } {
  const raw = (input.fields && typeof input.fields === "object" ? input.fields : {}) as Record<string, unknown>;
  for (const k of Object.keys(raw)) if (!schema.fields.some((f) => f.key === k)) return { ok: false, error: `Unknown field “${k}”.` };
  const fields: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = raw[f.key];
    if (v !== undefined && typeof v !== "string") return { ok: false, error: `${f.label} must be text.` };
    const t = (v ?? "").trim();
    if (t.length > f.max) return { ok: false, error: `${f.label} can be up to ${f.max} characters (it has ${t.length}).` };
    fields[f.key] = t;
  }
  let label: string | null = null;
  if (input.label !== undefined && input.label !== null && input.label !== "") {
    if (!opts.allowLabel) return { ok: false, error: opts.labelError ?? "Custom terms aren’t available on the Default set." };
    if (typeof input.label !== "string") return { ok: false, error: "The custom term must be text." };
    const t = input.label.trim();
    if (t.length > CONTENT_TERM_MAX) return { ok: false, error: `Custom terms can be up to ${CONTENT_TERM_MAX} characters.` };
    label = t || null;
  }
  return { ok: true, label, fields };
}

// ── Export / import ─────────────────────────────────────────────────────

export const CONTENT_SET_EXPORT_FORMAT = "magnetix-content-set";
export const CONTENT_SET_EXPORT_VERSION = 1;

export interface ContentSetExport {
  format: typeof CONTENT_SET_EXPORT_FORMAT;
  version: number;
  name: string;
  description: string;
  exportedAt: string;
  entries: Record<string, { label?: string | null; fields: Record<string, string> }>;
}

export function buildContentSetExport(meta: { name: string; description: string }, entries: Map<string, ContentEntryValues>, now = new Date()): ContentSetExport {
  const out: ContentSetExport["entries"] = {};
  for (const [id, v] of [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fields = Object.fromEntries(Object.entries(v.fields ?? {}).filter(([, t]) => filled(t)));
    if (Object.keys(fields).length === 0 && !filled(v.label)) continue;
    out[id] = { ...(filled(v.label) ? { label: v.label!.trim() } : {}), fields };
  }
  return { format: CONTENT_SET_EXPORT_FORMAT, version: CONTENT_SET_EXPORT_VERSION, name: meta.name, description: meta.description, exportedAt: now.toISOString(), entries: out };
}

export interface ImportPreview {
  ok: boolean;
  name: string;
  description: string;
  entries: Map<string, ContentEntryValues>;
  recognized: number;
  /** Problems that block the import (bad format, over-length text…). */
  errors: string[];
  /** Entries skipped because this workspace has no such entry (e.g. an unseen Variable value). */
  skipped: string[];
}

/**
 * Validates an export file before anything is written. Never merges into an
 * existing set — the caller creates a NEW Draft set from a clean preview.
 */
export function parseContentSetImport(json: unknown, knownEntryIds: Set<string>): ImportPreview {
  const errors: string[] = [];
  const skipped: string[] = [];
  const entries = new Map<string, ContentEntryValues>();
  const obj = (json && typeof json === "object" ? json : null) as Partial<ContentSetExport> | null;
  if (!obj || obj.format !== CONTENT_SET_EXPORT_FORMAT) {
    return { ok: false, name: "", description: "", entries, recognized: 0, errors: ["This isn’t a Magnetix content set export file."], skipped };
  }
  if (obj.version !== CONTENT_SET_EXPORT_VERSION) errors.push(`Unsupported export version (${String(obj.version)}).`);
  const meta = validateContentSetMeta({ name: typeof obj.name === "string" && obj.name.trim().toLowerCase() === "default" ? "Default (imported)" : obj.name, description: obj.description });
  if (!meta.ok) errors.push(meta.error);
  for (const [id, raw] of Object.entries(obj.entries ?? {})) {
    const parsed = parseContentEntryId(id);
    const schema = parsed ? categorySchema(parsed.categoryId) : undefined;
    if (!parsed || !schema || !knownEntryIds.has(id)) { skipped.push(id); continue; }
    const v = validateEntryInput(schema, raw ?? {}, { allowLabel: true });
    if (!v.ok) { errors.push(`${id}: ${v.error}`); continue; }
    entries.set(id, { label: v.label, fields: v.fields });
  }
  return { ok: errors.length === 0, name: meta.ok ? meta.name : "", description: meta.ok ? meta.description : "", entries, recognized: entries.size, errors, skipped };
}
import { INCARNATION_CROSSES } from "@/lib/energetics/incarnation-cross-data";
