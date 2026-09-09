import type { EmailBlock, EmailDocument } from "@/types/email-document";

export const DEFAULT_EMAIL_MERGE_TAGS = [
  "contact.firstName",
  "contact.lastName",
  "contact.email",
  "contact.phone",
  "owner.firstName",
  "owner.email",
  "workspace.name",
  "bookingLink",
  "unsubscribeLink",
] as const;

const TAG_RE = /\{\{\s*([a-zA-Z0-9_.:-]+)\s*\}\}/g;
const URL_RE = /^(https?:)\/\//i;
const LINK_RE = /^(https?:|mailto:)/i;

export interface EmailDocumentValidationOptions {
  allowedMergeTags?: readonly string[];
  requireSubject?: boolean;
}

export function validateEmailDocument(
  document: EmailDocument,
  options: EmailDocumentValidationOptions = {}
): string[] {
  const errors: string[] = [];
  if (document.version !== 1)
    errors.push("Unsupported email document version.");
  if (!Array.isArray(document.blocks))
    errors.push("Email document blocks must be an array.");
  if (options.requireSubject !== false && !document.subject.trim()) {
    errors.push("Email subject is required.");
  }

  const allowed = new Set(options.allowedMergeTags ?? DEFAULT_EMAIL_MERGE_TAGS);
  for (const tag of collectMergeTags(document)) {
    if (!allowed.has(tag)) errors.push(`Unsupported merge tag: {{${tag}}}`);
  }
  for (const block of document.blocks ?? []) validateBlock(block, errors);
  return errors;
}

export function collectMergeTags(document: EmailDocument): string[] {
  const found = new Set<string>();
  const visit = (value: string) => {
    for (const match of value.matchAll(TAG_RE)) found.add(match[1]);
  };
  visit(document.subject);
  if (document.preheader) visit(document.preheader);
  const visitBlock = (block: EmailBlock): void => {
    switch (block.type) {
      case "text":
      case "heading":
        visit(block.type === "text" ? block.html : block.text);
        break;
      case "image":
        visit(block.alt);
        break;
      case "button":
        visit(block.label);
        visit(block.href);
        break;
      case "video":
        visit(block.alt);
        visit(block.videoUrl);
        break;
      case "columns":
        block.columns.flatMap((c) => c.blocks).forEach(visitBlock);
        break;
      case "section":
        block.blocks.forEach(visitBlock);
        break;
      case "divider":
      case "spacer":
        break;
    }
  };
  document.blocks.forEach(visitBlock);
  return [...found].sort();
}

function validateBlock(block: EmailBlock, errors: string[]): void {
  if (!block.id.trim())
    errors.push(`Email ${block.type} block requires an id.`);
  switch (block.type) {
    case "image":
      if (!URL_RE.test(block.src))
        errors.push(`Image block ${block.id} requires an HTTPS source URL.`);
      if (!block.alt.trim())
        errors.push(`Image block ${block.id} requires alt text.`);
      if (block.href && !LINK_RE.test(block.href))
        errors.push(`Image block ${block.id} has an unsafe link URL.`);
      break;
    case "button":
      if (!block.label.trim())
        errors.push(`Button block ${block.id} requires a label.`);
      if (!LINK_RE.test(block.href))
        errors.push(`Button block ${block.id} has an unsafe link URL.`);
      break;
    case "video":
      if (!URL_RE.test(block.videoUrl) || !URL_RE.test(block.thumbnailSrc)) {
        errors.push(
          `Video block ${block.id} requires HTTPS video and thumbnail URLs.`
        );
      }
      if (!block.alt.trim())
        errors.push(`Video block ${block.id} requires alt text.`);
      break;
    case "columns":
      if (block.columns.length === 0)
        errors.push(`Columns block ${block.id} requires a column.`);
      block.columns
        .flatMap((c) => c.blocks)
        .forEach((child) => validateBlock(child, errors));
      break;
    case "section":
      block.blocks.forEach((child) => validateBlock(child, errors));
      break;
    case "spacer":
      if ((block.heightPx ?? 16) < 0 || (block.heightPx ?? 16) > 600) {
        errors.push(`Spacer block ${block.id} has an invalid height.`);
      }
      break;
    case "text":
    case "heading":
    case "divider":
      break;
  }
}
