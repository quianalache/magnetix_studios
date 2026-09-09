import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * Canonical authored email document. This is intentionally a structured
 * document rather than arbitrary HTML so every consumer can share validation
 * and an email-client-safe renderer.
 */
export interface EmailDocument {
  version: 1;
  mode: "quick_compose" | "visual";
  subject: string;
  preheader?: string | null;
  blocks: EmailBlock[];
}

export type EmailBlockAlign = "left" | "center" | "right";

export interface EmailTextBlock {
  id: string;
  type: "text";
  html: string;
  align?: EmailBlockAlign;
}

export interface EmailHeadingBlock {
  id: string;
  type: "heading";
  text: string;
  level?: 1 | 2 | 3;
  align?: EmailBlockAlign;
}

export interface EmailImageBlock {
  id: string;
  type: "image";
  src: string;
  alt: string;
  href?: string;
  widthPx?: number;
  align?: EmailBlockAlign;
  /** Future MediaAsset reference; `src` remains the delivery URL for now. */
  mediaAssetId?: string | null;
}

export interface EmailButtonBlock {
  id: string;
  type: "button";
  label: string;
  href: string;
  align?: EmailBlockAlign;
  bgColor?: string;
  textColor?: string;
}

export interface EmailDividerBlock {
  id: string;
  type: "divider";
}

export interface EmailSpacerBlock {
  id: string;
  type: "spacer";
  heightPx?: number;
}

export interface EmailVideoBlock {
  id: string;
  type: "video";
  videoUrl: string;
  thumbnailSrc: string;
  alt: string;
}

export type EmailBlockLeaf =
  | EmailTextBlock
  | EmailHeadingBlock
  | EmailImageBlock
  | EmailButtonBlock
  | EmailDividerBlock
  | EmailSpacerBlock
  | EmailVideoBlock;

export interface EmailColumnsBlock {
  id: string;
  type: "columns";
  /**
   * Wrapped (not a bare array) because Firestore rejects a nested array
   * — an array whose elements are themselves arrays — at write time. See
   * the matching note on broadcast-content.ts's ColumnsBlock.
   */
  columns: { blocks: EmailBlockLeaf[] }[];
}

export interface EmailSectionBlock {
  id: string;
  type: "section";
  blocks: EmailBlock[];
  backgroundColor?: string;
}

export type EmailBlock = EmailBlockLeaf | EmailColumnsBlock | EmailSectionBlock;

/** Future System Email registry boundary; no registry or UI is introduced here. */
export interface SystemEmailDefinition {
  key: string;
  classification: "transactional" | "operational" | "marketing";
  defaultDocument: EmailDocument;
  requiredVariables: string[];
  protectedVariables?: string[];
  tenantOverrideAllowed: boolean;
}

/** Minimal future reference for a tenant-owned immutable content snapshot. */
export interface EmailDocumentRef {
  id: string;
  agencyId: string;
  subAccountId: string;
  document: EmailDocument;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
