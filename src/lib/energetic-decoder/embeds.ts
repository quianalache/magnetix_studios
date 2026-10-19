import type {
  EmbedConfig,
  EmbedFieldMode,
  EmbedNextStep,
  EmbedResultView,
  EmbedSettings,
  EmbedShowOnPage,
  EmbedStatus,
  PublicEmbedConfig,
} from "@/types/embed-config";
import { DEFAULT_CONTENT_SET_ID } from "@/lib/energetic-decoder/content-sets";

/**
 * Pure Embed rules (Public Reading Tool, Phase 1) — defaults, normalizing
 * stored docs, validating staff edits, the "sensible combinations" rules,
 * and the public projection. Client-safe: no Firestore, no server-only.
 */

export const EMBED_LIMITS = {
  name: 80,
  placementNote: 200,
  title: 120,
  intro: 400,
  buttonLabel: 40,
  consentText: 400,
  confirmationMessage: 400,
  nextStepLabel: 40,
  url: 500,
  tag: 40,
  tags: 10,
} as const;

export const EMBED_STATUSES: EmbedStatus[] = ["draft", "live", "archived"];
export const EMBED_VIEWS: EmbedResultView[] = ["humanDesign", "mandala", "astrology"];
export const EMBED_SHOW_OPTIONS: EmbedShowOnPage[] = ["full", "chartFacts", "confirmation"];
const FIELD_MODES: EmbedFieldMode[] = ["off", "optional", "required"];

export const EMBED_STATUS_LABEL: Record<EmbedStatus, string> = {
  draft: "Draft",
  live: "Live",
  archived: "Archived",
};

export const EMBED_VIEW_LABEL: Record<EmbedResultView, string> = {
  humanDesign: "Human Design",
  mandala: "Mandala",
  astrology: "Astrology",
};

export const EMBED_SHOW_LABEL: Record<EmbedShowOnPage, string> = {
  full: "Full result",
  chartFacts: "Chart + key facts",
  confirmation: "Confirmation only",
};

export function defaultEmbedSettings(): EmbedSettings {
  return {
    access: { mode: "anyone" },
    form: {
      title: "Your Energetic Profile",
      intro: "Enter your birth details to decode your energetic blueprint.",
      buttonLabel: "Get my reading",
      phone: "off",
      consent: { enabled: false, text: "I agree to receive emails about my reading." },
    },
    reading: {
      contentSetId: DEFAULT_CONTENT_SET_ID,
      chartDesignSetId: null,
      views: ["humanDesign", "astrology"],
    },
    afterSubmit: {
      show: "full",
      confirmationMessage: "Your reading is ready.",
      myMagnetix: true,
      output: { kind: "readingReport" },
      pdf: true,
      email: true,
      nextStep: { kind: "none" },
    },
    contact: { tags: [] },
  };
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.trim().slice(0, max) : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Lowercase, hyphenated, de-duplicated tags (the same shape Contacts use). */
export function normalizeEmbedTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, EMBED_LIMITS.tag);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= EMBED_LIMITS.tags) break;
  }
  return out;
}

function normalizeViews(raw: unknown, fallback: EmbedResultView[]): EmbedResultView[] {
  if (!Array.isArray(raw)) return fallback;
  const views = EMBED_VIEWS.filter((v) => raw.includes(v));
  return views;
}

function normalizeNextStep(raw: unknown): EmbedNextStep {
  const n = obj(raw);
  const label = str(n.label, EMBED_LIMITS.nextStepLabel) || "Continue";
  switch (n.kind) {
    case "myMagnetix":
      return { kind: "myMagnetix", label: str(n.label, EMBED_LIMITS.nextStepLabel) || "Open MyMagnetix" };
    case "course": {
      const courseId = str(n.courseId, 64);
      return courseId ? { kind: "course", courseId, label } : { kind: "none" };
    }
    case "offer": {
      const offerId = str(n.offerId, 64);
      return offerId ? { kind: "offer", offerId, label } : { kind: "none" };
    }
    case "url": {
      const url = str(n.url, EMBED_LIMITS.url);
      return url && isHttpUrl(url) ? { kind: "url", url, label } : { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

/** A stored doc (any vintage) → a complete EmbedConfig. Never throws. */
export function normalizeEmbedConfig(id: string, raw: Record<string, unknown>): EmbedConfig {
  const d = defaultEmbedSettings();
  const form = obj(raw.form);
  const reading = obj(raw.reading);
  const after = obj(raw.afterSubmit);
  const contact = obj(raw.contact);
  const consent = obj(form.consent);
  const output = obj(after.output);
  const stats = obj(raw.stats);
  const status = EMBED_STATUSES.includes(raw.status as EmbedStatus) ? (raw.status as EmbedStatus) : "draft";
  const toIso = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return null;
  };
  return {
    id,
    subAccountId: String(raw.subAccountId ?? ""),
    agencyId: String(raw.agencyId ?? ""),
    name: str(raw.name, EMBED_LIMITS.name) || "Untitled embed",
    placementNote: str(raw.placementNote, EMBED_LIMITS.placementNote) ?? "",
    status,
    access: { mode: "anyone" },
    form: {
      title: str(form.title, EMBED_LIMITS.title) ?? d.form.title,
      intro: str(form.intro, EMBED_LIMITS.intro) ?? d.form.intro,
      buttonLabel: str(form.buttonLabel, EMBED_LIMITS.buttonLabel) || d.form.buttonLabel,
      phone: FIELD_MODES.includes(form.phone as EmbedFieldMode) ? (form.phone as EmbedFieldMode) : d.form.phone,
      consent: {
        enabled: consent.enabled === true,
        text: str(consent.text, EMBED_LIMITS.consentText) || d.form.consent.text,
      },
    },
    reading: {
      contentSetId: str(reading.contentSetId, 64) || DEFAULT_CONTENT_SET_ID,
      chartDesignSetId: str(reading.chartDesignSetId, 64) || null,
      views: normalizeViews(reading.views, d.reading.views),
    },
    afterSubmit: {
      show: EMBED_SHOW_OPTIONS.includes(after.show as EmbedShowOnPage) ? (after.show as EmbedShowOnPage) : d.afterSubmit.show,
      confirmationMessage: str(after.confirmationMessage, EMBED_LIMITS.confirmationMessage) || d.afterSubmit.confirmationMessage,
      myMagnetix: typeof after.myMagnetix === "boolean" ? after.myMagnetix : d.afterSubmit.myMagnetix,
      output:
        output.kind === "reportDesign" && typeof output.reportDesignId === "string" && output.reportDesignId
          ? { kind: "reportDesign", reportDesignId: output.reportDesignId }
          : { kind: "readingReport" },
      pdf: typeof after.pdf === "boolean" ? after.pdf : d.afterSubmit.pdf,
      email: typeof after.email === "boolean" ? after.email : d.afterSubmit.email,
      nextStep: normalizeNextStep(after.nextStep),
    },
    contact: { tags: normalizeEmbedTags(contact.tags) },
    stats: {
      readings: typeof stats.readings === "number" ? stats.readings : 0,
      contacts: typeof stats.contacts === "number" ? stats.contacts : 0,
      lastReadingAt: toIso(stats.lastReadingAt),
    },
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
}

/**
 * Sensible combinations — a visitor must always be able to reach their
 * Reading somewhere. Returns a staff-facing message, or null when valid.
 */
export function embedCombinationError(s: EmbedSettings): string | null {
  if (s.afterSubmit.show !== "confirmation" && s.reading.views.length === 0) {
    return "Choose at least one result view, or show a confirmation only.";
  }
  if (s.afterSubmit.show === "confirmation" && !s.afterSubmit.myMagnetix && !s.afterSubmit.email) {
    return "Confirmation only needs MyMagnetix or the email turned on, so the visitor can still reach their Reading.";
  }
  if (s.afterSubmit.nextStep.kind === "myMagnetix" && !s.afterSubmit.myMagnetix) {
    return "Turn on “Save to MyMagnetix” to use MyMagnetix as the next step.";
  }
  if (s.afterSubmit.output.kind === "reportDesign") {
    return "Report Design delivery arrives with Reading access. Use the Reading Report for now.";
  }
  return null;
}

export type EmbedPatch = Partial<Pick<EmbedConfig, "name" | "placementNote" | "status">> & Partial<EmbedSettings>;

/**
 * Validates a staff edit (any subset of sections) against the current Embed.
 * Returns the full next document state so combination rules see the result.
 */
export function applyEmbedPatch(
  current: EmbedConfig,
  raw: unknown,
): { ok: true; next: EmbedConfig } | { ok: false; error: string } {
  const body = obj(raw);
  const merged: Record<string, unknown> = {
    ...current,
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.placementNote === "string" ? { placementNote: body.placementNote } : {}),
    ...(typeof body.status === "string" ? { status: body.status } : {}),
    form: body.form ? { ...current.form, ...obj(body.form) } : current.form,
    reading: body.reading ? { ...current.reading, ...obj(body.reading) } : current.reading,
    afterSubmit: body.afterSubmit ? { ...current.afterSubmit, ...obj(body.afterSubmit) } : current.afterSubmit,
    contact: body.contact ? { ...current.contact, ...obj(body.contact) } : current.contact,
  };
  if (typeof body.status === "string" && !EMBED_STATUSES.includes(body.status as EmbedStatus)) {
    return { ok: false, error: "Unknown status." };
  }
  if (typeof body.name === "string" && !body.name.trim()) {
    return { ok: false, error: "Give this Embed a name." };
  }
  const next = normalizeEmbedConfig(current.id, merged);
  const nextStep = obj(obj(body.afterSubmit).nextStep);
  if (nextStep.kind === "url" && next.afterSubmit.nextStep.kind !== "url") {
    return { ok: false, error: "The next-step link must be a full web address starting with https://." };
  }
  // Only enforce combinations once the Embed is (or is becoming) usable.
  if (next.status === "live") {
    const err = embedCombinationError(next);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, next };
}

/** Views a reading can actually show, given which systems were calculated. */
export function availableViews(
  views: EmbedResultView[],
  systems: { humanDesign: boolean; astrology: boolean },
): EmbedResultView[] {
  return views.filter((v) => (v === "astrology" ? systems.astrology : systems.humanDesign));
}

export function nextStepHref(subAccountId: string, step: EmbedNextStep): { href: string; label: string } | null {
  switch (step.kind) {
    case "myMagnetix":
      return { href: "/my/readings", label: step.label };
    case "course":
      return { href: `/course/${subAccountId}/${step.courseId}`, label: step.label };
    case "offer":
      return { href: `/offer/${subAccountId}/${step.offerId}`, label: step.label };
    case "url":
      return { href: step.url, label: step.label };
    default:
      return null;
  }
}

export function toPublicEmbed(embed: EmbedConfig): PublicEmbedConfig {
  return {
    id: embed.id,
    form: embed.form,
    views: embed.reading.views,
    afterSubmit: {
      show: embed.afterSubmit.show,
      confirmationMessage: embed.afterSubmit.confirmationMessage,
      myMagnetix: embed.afterSubmit.myMagnetix,
      pdf: embed.afterSubmit.pdf,
      email: embed.afterSubmit.email,
      nextStep: nextStepHref(embed.subAccountId, embed.afterSubmit.nextStep),
    },
  };
}

/** The behavior of the original, Embed-less public tool (/decoder/{saId}). */
export function legacyPublicEmbed(): PublicEmbedConfig {
  const d = defaultEmbedSettings();
  return {
    id: "",
    form: d.form,
    views: d.reading.views,
    afterSubmit: {
      show: "full",
      confirmationMessage: d.afterSubmit.confirmationMessage,
      myMagnetix: true,
      pdf: true,
      email: true,
      nextStep: null,
    },
  };
}

/** One-line summaries for the Embeds list. */
export function embedDeliverySummary(e: EmbedConfig): string {
  const parts: string[] = [EMBED_SHOW_LABEL[e.afterSubmit.show]];
  if (e.afterSubmit.myMagnetix) parts.push("MyMagnetix");
  if (e.afterSubmit.email) parts.push("email");
  return parts.join(" · ");
}

export function embedAccessLabel(e: EmbedConfig): string {
  void e;
  return "Anyone";
}
