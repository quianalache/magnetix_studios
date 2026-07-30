import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Block-schema content model for the broadcast composer (drag-and-drop
 * builder). Rendered to actual email-safe HTML by
 * src/lib/broadcasts/render-email.ts — that renderer is the single source
 * of truth for what a block "means"; this file only defines the shape.
 *
 * Deliberately NOT reusing the TipTap-based lesson editor's output model
 * (src/components/community/classroom/rich-text-editor.tsx) — that HTML is
 * meant for in-app browser rendering (Tailwind classes, live iframes), which
 * real email clients can't render at all (no external stylesheets, most
 * clients strip/block iframes, Outlook needs table-based layout).
 */

export type EmailBlockAlign = "left" | "center" | "right";

/** Rich text authored via a constrained TipTap instance, sanitized on the
 *  way out by the renderer (email-specific allowlist — see render-email.ts). */
export interface TextBlock {
  id: string;
  type: "text";
  html: string;
  align?: EmailBlockAlign;
}

export interface ImageBlock {
  id: string;
  type: "image";
  src: string;
  alt: string;
  href?: string;
  widthPx?: number;
  align?: EmailBlockAlign;
}

/**
 * Renders as a plain linked image (thumbnail + implied play button, styled
 * by the renderer) that opens `videoUrl` externally — no email client
 * actually plays video inline, so this is the standard ESP approach, not a
 * shortcut. Never rendered as an <iframe> or <video> tag.
 */
export interface VideoBlock {
  id: string;
  type: "video";
  videoUrl: string;
  thumbnailSrc: string;
  alt: string;
}

export interface ButtonBlock {
  id: string;
  type: "button";
  label: string;
  href: string;
  align?: EmailBlockAlign;
  bgColor?: string;
  textColor?: string;
}

export interface DividerBlock {
  id: string;
  type: "divider";
}

/** Non-column blocks only — no nested columns, kept simple for table-safe
 *  rendering (a <table> inside a <td> inside a <table> is exactly the kind
 *  of nesting real-world email clients handle inconsistently). */
export type EmailBlockNonColumn =
  | TextBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock
  | DividerBlock;

export interface ColumnsBlock {
  id: string;
  type: "columns";
  columns: EmailBlockNonColumn[][];
}

export type EmailBlock = EmailBlockNonColumn | ColumnsBlock;

export interface BroadcastContent {
  version: 1;
  blocks: EmailBlock[];
}

/**
 * User-owned, sub-account-scoped, NEVER seeded — `broadcastTemplates/{id}`.
 * Created only via the composer's "Save as template" action. No preset/
 * starter content ships anywhere in this codebase for this collection.
 */
export interface BroadcastTemplateDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
