import type { Timestamp, FieldValue } from "firebase/firestore";
import type { PipelineStageId } from "@/types/deals";

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "company"
  | "textarea"
  | "select"
  // A2P 10DLC SMS opt-in consent checkbox. Renders an unchecked checkbox with
  // a compliance disclosure (the `consentText`). When checked, the submit
  // route records an audit trail on the contact + clears `smsOptedOut`; when
  // a form HAS a consent field and the box is left unchecked, the contact is
  // created `smsOptedOut: true` (no consent → never SMS them). Forms without
  // a consent field keep the existing default behaviour.
  | "sms_consent"
  // A link field — a Loom/Descript/video/portfolio URL the submitter pastes
  // in. Stored and validated like `text` but rendered with a link icon and
  // browser URL-format validation (type="url").
  | "url"
  // A display-only block, not an answerable field — instructional copy the
  // form owner drops between real fields (e.g. "Record a quick Loom walking
  // through your question, then paste the link below"). Never required,
  // never mapped to a Contact field, and excluded from the submission's
  // `answers` snapshot. See `content` below.
  | "text_block"
  // Single-choice, same `options` list as `select` but rendered as a radio
  // group instead of a dropdown — GHL calls this "Multiple choice".
  | "radio"
  // Multi-choice — same `options` list, rendered as a checkbox group. The
  // selected options are stored as ONE comma-joined string in `values[id]`
  // (e.g. "Option A, Option C"), same shape every other field uses, rather
  // than restructuring the values model to support arrays.
  | "checkboxes"
  // Invisible to the visitor — auto-populated from a URL query parameter
  // (e.g. "utm_source") when the form page loads, then submitted like any
  // other field. Never required (there's nothing for the visitor to fill
  // in), never rendered. See `queryParam` below.
  | "hidden"
  // A marker, not an answerable field — everything after this point (until
  // the next one) becomes a new step. The hosted/embed form (PublicForm)
  // groups fields into steps by splitting on these markers and shows a
  // progress bar + Back/Next; a form with zero page breaks renders exactly
  // as before (single scrolling page, no progress bar). The raw HTML
  // export snippet — a power-user escape hatch — does NOT implement real
  // multi-step JS; it renders this as a plain `<hr>` divider instead, since
  // that path is meant to stay simple, unstyled, framework-free HTML.
  | "page_break";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  options: string[];
  // Maps this field's value back to the Contact shape.
  // "name" | "email" | "phone" | "company" | "notes" | null
  mapsTo: "name" | "email" | "phone" | "company" | "notes" | null;
  /**
   * Only used by the `text_block` field type — the paragraph copy rendered
   * in place of an input. `label` doubles as an optional heading above it.
   */
  content?: string;
  /**
   * Only used by the `sms_consent` field type — the disclosure paragraph
   * rendered next to the checkbox (and stored verbatim as the proof-of-consent
   * text). Must carry the CTIA-required elements: sender identity, message
   * frequency, "message & data rates may apply", and STOP/HELP instructions.
   */
  consentText?: string;
  /**
   * Only used by the `hidden` field type — the URL query parameter name
   * (e.g. "utm_source") this field auto-captures from on page load.
   */
  queryParam?: string;
  /**
   * Conditional show/hide — this field only renders (and is only
   * validated) when the condition evaluates true against the current
   * answers. Null/undefined = always shown, the default for every
   * existing field. Not offered for `page_break` or `hidden` (structural
   * markers, not something a visitor sees). Only ever points at a field
   * EARLIER in `form.fields` than this one — the builder's picker enforces
   * that so a condition can never reference an answer that hasn't been
   * collected yet.
   */
  visibleIf?: FormFieldCondition | null;
}

export type FormFieldConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_empty"
  | "is_filled";

export interface FormFieldCondition {
  fieldId: string;
  operator: FormFieldConditionOperator;
  /** Unused (and not shown in the builder) for is_empty / is_filled. */
  value: string;
}

export const CONDITION_OPERATOR_LABELS: Record<
  FormFieldConditionOperator,
  string
> = {
  equals: "is exactly",
  not_equals: "is not",
  contains: "contains",
  is_empty: "is empty",
  is_filled: "is filled in",
};

/** Shared by the builder (preview) and the public form (real gating). */
export function evaluateCondition(
  condition: FormFieldCondition | null | undefined,
  values: Record<string, string>,
): boolean {
  if (!condition) return true;
  const actual = (values[condition.fieldId] ?? "").trim();
  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "contains":
      return actual.toLowerCase().includes(condition.value.toLowerCase());
    case "is_empty":
      return actual === "";
    case "is_filled":
      return actual !== "";
    default:
      return true;
  }
}

/**
 * CTIA-compliant default SMS-consent disclosure. The operator edits this in
 * the builder; the business name is injected at field-creation time. Operators
 * should also surface their Privacy Policy + Terms links on the form/page per
 * carrier requirements.
 */
export function defaultSmsConsentText(businessName?: string): string {
  const biz = (businessName && businessName.trim()) || "us";
  return `By checking this box, you agree to receive SMS messages from ${biz}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.`;
}

/**
 * Visual customisation for the public form page. Used by the form-builder
 * "Embed appearance" panel + by the public form's URL params (params win
 * for one-off overrides without saving).
 */
export interface FormAppearance {
  theme: "light" | "dark";
  /** Hex string with leading #. Drives the submit button + focus ring. */
  accent: string;
  /**
   * Base text size for the whole form (title, labels, inputs, button), in
   * px. A continuous slider (12–24px), not presets — matches
   * `cornerRadius` below. Optional — undefined on docs saved before this
   * shipped, treated as 16px. Docs saved back when this was a 3-option
   * "sm"|"md"|"lg" enum still have those string values on disk; every read
   * goes through `normalizeFontSizePx()` so old forms keep rendering at
   * the exact size they always did (sm=14, md=16, lg=18) without a
   * migration. Every text element in the public form and embed scales off
   * this via `em`, not a fixed rem size.
   */
  fontSize?: number | "sm" | "md" | "lg";
  /**
   * Corner radius in px, applied to the form card, inputs, and buttons
   * together (they all derive from one `--radius` design token already,
   * so overriding it rescales everything proportionally). Optional —
   * undefined on docs saved before this shipped, treated as the app
   * default (10px).
   */
  cornerRadius?: number;
  /**
   * Submit/Back/Next button treatment. "fill" = solid accent background
   * (the only option before this shipped). Optional, defaults to "fill".
   */
  buttonStyle?: "fill" | "outline" | "text";
  /**
   * Curated web-safe font stacks only (no webfont loading, so no extra
   * network request or FOUT) — "system" is the existing default.
   * Optional, defaults to "system".
   */
  fontFamily?: "system" | "serif" | "rounded" | "mono";
  /**
   * Border color override for the card + inputs. Hex string, or null/
   * undefined to inherit the theme's own neutral border color (the
   * behavior before this shipped).
   */
  borderColor?: string | null;
  /**
   * Vertical rhythm between fields and within a field's own label/input
   * stack. Optional, defaults to "comfortable" (the existing spacing).
   */
  fieldSpacing?: "compact" | "comfortable" | "spacious";
  /** Hide the LeadStack header + "Powered by" footer when embedded. */
  hideChrome: boolean;
  /**
   * Hide the form name + "Fill this out…" tagline above the fields. Use
   * when the host page already has its own heading above the iframe.
   */
  hideTitle: boolean;
  /**
   * Raw CSS injected into a `<style>` tag on the hosted/embed page, after
   * every built-in style — lets an operator override anything the
   * theme/accent controls don't cover. Saved-settings only, never
   * overridable via URL param (unlike theme/accent/hideChrome/hideTitle)
   * to keep arbitrary-CSS injection scoped to the account owner's own
   * saved form, not to whoever constructs the embed URL.
   */
  customCss: string;
}

export const FONT_FAMILY_STACKS: Record<
  NonNullable<FormAppearance["fontFamily"]>,
  string
> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

export interface FormSettings {
  pipelineStageId: PipelineStageId | null;
  autoTags: string[];
  thankYouMessage: string;
  redirectUrl: string;
  createDeal: boolean;
  dealTitleTemplate: string;
  dealValue: number;
  dealCurrency: string;
  appearance: FormAppearance;
}

export interface LeadForm {
  id: string;
  name: string;
  slug: string;
  fields: FormField[];
  settings: FormSettings;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  enabled: boolean;
  submissionCount: number;
  /** Submissions since the Submissions tab was last opened. Undefined on forms created before this shipped — treated as 0. */
  unreadSubmissionCount?: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** One answered field on a submission, snapshotted with its label as it read AT SUBMIT TIME — stays accurate even if the form's fields are later renamed or removed. */
export interface FormSubmissionAnswer {
  fieldId: string;
  label: string;
  value: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  /**
   * Snapshotted at submit time so a cross-form list (the contact profile's
   * Submitted Forms section) doesn't need to look up every referenced form.
   * Undefined on submissions written before this field existed.
   */
  formName?: string;
  /** Raw field-id-keyed values, kept for existing consumers (webhook payloads, the HTML snippet's `name` attributes). */
  values: Record<string, string>;
  /** The four contact-mapped fields, denormalized for a quick row preview. Undefined on legacy submissions. */
  mapped?: { name: string; email: string; phone: string; company: string };
  /** Every field's label + value, in form order — the human-readable view. Undefined on legacy submissions (fall back to `values`). */
  answers?: FormSubmissionAnswer[];
  contactId: string | null;
  dealId: string | null;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * Form template variants exposed by the "New form" UI. "blank" is the
 * existing default; "contact" is a typical website contact form (Name,
 * Email, Phone, Message). Add new presets here and surface them in the
 * forms list page when needed.
 */
export type FormTemplate = "blank" | "contact";

export function defaultFormFields(): FormField[] {
  return [
    {
      id: "name",
      type: "text",
      label: "Full name",
      placeholder: "Jane Doe",
      required: true,
      options: [],
      mapsTo: "name",
    },
    {
      id: "email",
      type: "email",
      label: "Email",
      placeholder: "jane@example.com",
      required: true,
      options: [],
      mapsTo: "email",
    },
    {
      id: "phone",
      type: "phone",
      label: "Phone",
      placeholder: "+1 555 000 0000",
      required: false,
      options: [],
      mapsTo: "phone",
    },
    {
      id: "company",
      type: "company",
      label: "Company",
      placeholder: "Acme Inc.",
      required: false,
      options: [],
      mapsTo: "company",
    },
  ];
}

/**
 * Fields for the "Contact form" preset. Drops Company (most generic contact
 * forms don't ask), adds a required Message textarea that maps to the
 * contact's notes field so the body lands on the contact profile timeline.
 */
export function contactFormFields(): FormField[] {
  return [
    {
      id: "name",
      type: "text",
      label: "Full name",
      placeholder: "Jane Doe",
      required: true,
      options: [],
      mapsTo: "name",
    },
    {
      id: "email",
      type: "email",
      label: "Email",
      placeholder: "jane@example.com",
      required: true,
      options: [],
      mapsTo: "email",
    },
    {
      id: "phone",
      type: "phone",
      label: "Phone",
      placeholder: "+1 555 000 0000",
      required: false,
      options: [],
      mapsTo: "phone",
    },
    {
      id: "message",
      type: "textarea",
      label: "How can we help?",
      placeholder: "Tell us a bit about what you're looking for…",
      required: true,
      options: [],
      mapsTo: "notes",
    },
  ];
}

export function contactFormSettings(): FormSettings {
  return {
    ...defaultFormSettings(),
    thankYouMessage:
      "Thanks for reaching out — we'll get back to you shortly.",
    autoTags: ["form", "contact"],
  };
}

export function defaultFormSettings(): FormSettings {
  return {
    pipelineStageId: "new",
    autoTags: ["form"],
    thankYouMessage: "Thanks — we'll be in touch shortly.",
    redirectUrl: "",
    createDeal: false,
    dealTitleTemplate: "New lead — {name}",
    dealValue: 0,
    dealCurrency: "USD",
    appearance: defaultFormAppearance(),
  };
}

export function defaultFormAppearance(): FormAppearance {
  return {
    theme: "light",
    accent: "#7c3aed",
    fontSize: 16,
    cornerRadius: 10,
    buttonStyle: "fill",
    fontFamily: "system",
    borderColor: null,
    fieldSpacing: "comfortable",
    hideChrome: false,
    hideTitle: false,
    customCss: "",
  };
}

/** Legacy 3-option values, kept only so old saved forms render unchanged. */
const LEGACY_FONT_SIZE_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

export const FONT_SIZE_MIN_PX = 12;
export const FONT_SIZE_MAX_PX = 24;

/** Resolve a saved `fontSize` (old string enum, new number, or undefined) to a concrete, clamped px value. */
export function normalizeFontSizePx(value: FormAppearance["fontSize"]): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(FONT_SIZE_MAX_PX, Math.max(FONT_SIZE_MIN_PX, value));
  }
  if (value === "sm" || value === "md" || value === "lg") {
    return LEGACY_FONT_SIZE_PX[value];
  }
  return LEGACY_FONT_SIZE_PX.md;
}
