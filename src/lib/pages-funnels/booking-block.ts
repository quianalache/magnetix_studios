/**
 * Booking block (Wave 2B-2) — the stored model. The block only REFERENCES an
 * existing Magnetix Booking Page and says how to present it; availability,
 * duration, timezone, intake questions, confirmation and booking records all
 * stay with the booking engine (`subAccounts/{sa}/bookingPages/{slug}` +
 * `/api/booking/[saId]/[slug]/*`). Stored inside normal page Puck content.
 *
 * Identity: the Booking Page's slug — its document id, immutable once created
 * (the PATCH route refuses a slug change) and the same key the canonical
 * `booking` destination uses (`Destination.bookingPageSlug`). The workspace is
 * never stored: it is always the page's own sub-account.
 *
 * Parsing is strict at save (`findBookingProblem` — a malformed block is a
 * clear 400) and lenient at render (`normalizeBookingBlock` — a bad value
 * falls back to its default, so a page never crashes).
 */

export type BookingDisplayMode = "embed" | "button";
export type BookingButtonStyle = "primary" | "secondary" | "outline";
export type BookingAlign = "left" | "center" | "right";

/** Presentation of the embedded flow — display only; the Booking Page owns the copy. */
export interface BookingDisplay {
  /** Business name + booking page name. */
  showTitle: boolean;
  showDescription: boolean;
  /** Duration and deposit lines. */
  showDetails: boolean;
  /** The flow inside the booking card (border + surface) or flat on the page. */
  card: boolean;
}

/** Button-only presentation: a button to the Booking Page (the canonical `booking` destination). */
export interface BookingButton {
  label: string;
  style: BookingButtonStyle;
  align: BookingAlign;
}

export interface BookingBlockProps {
  /** Booking Page slug in the page's own workspace; "" = not connected. */
  bookingPageSlug: string;
  /** "embed" = the full booking flow on the page; "button" = a button to the Booking Page. */
  displayMode: BookingDisplayMode;
  display: BookingDisplay;
  button: BookingButton;
}

export const BOOKING_DISPLAY_MODES: BookingDisplayMode[] = ["embed", "button"];
export const BOOKING_BUTTON_STYLES: BookingButtonStyle[] = ["primary", "secondary", "outline"];
export const BOOKING_ALIGNS: BookingAlign[] = ["left", "center", "right"];
export const BOOKING_BUTTON_LABEL_MAX = 40;
export const BOOKING_DEFAULT_BUTTON_LABEL = "Book a time";

/** Same rule as the booking engine's own slug validator (lib/booking/validation.ts). */
export const BOOKING_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export const isBookingSlug = (v: unknown): v is string => typeof v === "string" && BOOKING_SLUG_RE.test(v);

export const DEFAULT_BOOKING_DISPLAY: BookingDisplay = { showTitle: true, showDescription: true, showDetails: true, card: true };
export const DEFAULT_BOOKING_BUTTON: BookingButton = { label: BOOKING_DEFAULT_BUTTON_LABEL, style: "primary", align: "left" };
export const DEFAULT_BOOKING_BLOCK: BookingBlockProps = {
  bookingPageSlug: "",
  displayMode: "embed",
  display: DEFAULT_BOOKING_DISPLAY,
  button: DEFAULT_BOOKING_BUTTON,
};

const DISPLAY_KEYS = ["showTitle", "showDescription", "showDetails", "card"] as const;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function normalizeBookingDisplay(raw: unknown): BookingDisplay {
  const d = obj(raw);
  return {
    showTitle: bool(d.showTitle, true),
    showDescription: bool(d.showDescription, true),
    showDetails: bool(d.showDetails, true),
    card: bool(d.card, true),
  };
}

export function normalizeBookingButton(raw: unknown): BookingButton {
  const b = obj(raw);
  const label = typeof b.label === "string" ? b.label.trim().slice(0, BOOKING_BUTTON_LABEL_MAX) : "";
  return {
    label: label || BOOKING_DEFAULT_BUTTON_LABEL,
    style: oneOf(b.style, BOOKING_BUTTON_STYLES, "primary"),
    align: oneOf(b.align, BOOKING_ALIGNS, "left"),
  };
}

/** Lenient render-time reading: any bad value falls back to its default. */
export function normalizeBookingBlock(raw: unknown): BookingBlockProps {
  const p = obj(raw);
  return {
    bookingPageSlug: isBookingSlug(p.bookingPageSlug) ? p.bookingPageSlug : "",
    displayMode: oneOf(p.displayMode, BOOKING_DISPLAY_MODES, "embed"),
    display: normalizeBookingDisplay(p.display),
    button: normalizeBookingButton(p.button),
  };
}

/** Strict save-time check of one block's props; null when valid. Missing keys are fine (defaults apply). */
export function bookingBlockProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Booking block settings couldn't be read.";
  const p = raw as Record<string, unknown>;
  if (p.bookingPageSlug !== undefined && p.bookingPageSlug !== "" && !isBookingSlug(p.bookingPageSlug)) return "Booking: choose a booking page from the list.";
  if (p.displayMode !== undefined && !BOOKING_DISPLAY_MODES.includes(p.displayMode as BookingDisplayMode)) return "Booking: unknown display mode.";
  if (p.display !== undefined) {
    if (!p.display || typeof p.display !== "object" || Array.isArray(p.display)) return "Booking: the display settings couldn't be read.";
    const d = p.display as Record<string, unknown>;
    for (const key of DISPLAY_KEYS) if (d[key] !== undefined && typeof d[key] !== "boolean") return "Booking: a display setting couldn't be read.";
  }
  if (p.button !== undefined) {
    if (!p.button || typeof p.button !== "object" || Array.isArray(p.button)) return "Booking: the button settings couldn't be read.";
    const b = p.button as Record<string, unknown>;
    if (b.label !== undefined && (typeof b.label !== "string" || b.label.length > BOOKING_BUTTON_LABEL_MAX)) return `Booking: the button label can be at most ${BOOKING_BUTTON_LABEL_MAX} characters.`;
    if (b.style !== undefined && !BOOKING_BUTTON_STYLES.includes(b.style as BookingButtonStyle)) return "Booking: unknown button style.";
    if (b.align !== undefined && !BOOKING_ALIGNS.includes(b.align as BookingAlign)) return "Booking: unknown alignment.";
  }
  return null;
}

/** Visits every Booking node in a page's Puck data (content + legacy zones, any depth). */
function visitBookingNodes(data: unknown, fn: (props: Record<string, unknown>) => void) {
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    if (n.type === "Booking" && n.props) fn(n.props);
    for (const value of Object.values(n.props ?? {})) if (Array.isArray(value)) visit(value);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  visit(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(visit);
}

/** First malformed Booking block on the page, as a customer-readable error; null when all are valid. */
export function findBookingProblem(data: unknown): string | null {
  let problem: string | null = null;
  visitBookingNodes(data, (props) => {
    problem ??= bookingBlockProblem(props);
  });
  return problem;
}

/** Every Booking Page slug the page's Booking blocks reference (well-formed only, de-duplicated). */
export function collectBookingSlugs(data: unknown): string[] {
  const slugs = new Set<string>();
  visitBookingNodes(data, (props) => {
    if (isBookingSlug(props.bookingPageSlug)) slugs.add(props.bookingPageSlug);
  });
  return [...slugs].slice(0, 20);
}
