import type {
  BroadcastContent,
  EmailBlock as BroadcastBlock,
  EmailBlockNonColumn as BroadcastBlockNonColumn,
} from "@/types/broadcast-content";
import type { MessageTemplateDoc } from "@/types/automations";
import type {
  EmailBlock,
  EmailBlockLeaf,
  EmailDocument,
} from "@/types/email-document";
import { plainTextToEmailHtml } from "@/lib/automations/workflow-email";

export interface WorkflowEmailInput {
  subject: string;
  body: string;
  bodyHtml?: string;
}

export function emailDocumentFromWorkflowEmail(
  input: WorkflowEmailInput
): EmailDocument {
  const body = input.bodyHtml?.trim() || plainTextToEmailHtml(input.body);
  return {
    version: 1,
    mode: "quick_compose",
    subject: input.subject,
    blocks: [{ id: "workflow-body", type: "text", html: body }],
  };
}

export function workflowEmailFromDocument(
  document: EmailDocument
): WorkflowEmailInput {
  const bodyHtml = document.blocks
    .map((block) => blockToSimpleHtml(block))
    .join("");
  return { subject: document.subject, body: stripHtml(bodyHtml), bodyHtml };
}

export function emailDocumentFromBroadcastContent(
  content: BroadcastContent,
  subject = "",
  preheader?: string | null
): EmailDocument {
  return {
    version: 1,
    mode: "visual",
    subject,
    preheader,
    blocks: content.blocks.map(broadcastBlockToEmailBlock),
  };
}

export function broadcastContentFromEmailDocument(
  document: EmailDocument
): BroadcastContent {
  return {
    version: 1,
    blocks: document.blocks.map(emailBlockToBroadcastBlock),
  };
}

export function emailDocumentFromMessageTemplate(
  template: Pick<MessageTemplateDoc, "subject" | "body">
): EmailDocument {
  return emailDocumentFromWorkflowEmail({
    subject: template.subject ?? "",
    body: template.body,
  });
}

function broadcastBlockToEmailBlock(block: BroadcastBlock): EmailBlock {
  if (block.type === "columns")
    return {
      id: block.id,
      type: "columns",
      columns: block.columns.map((column) =>
        column.map(broadcastLeafToEmailLeaf)
      ),
    };
  return broadcastLeafToEmailLeaf(block);
}

function broadcastLeafToEmailLeaf(
  block: BroadcastBlockNonColumn
): EmailBlockLeaf {
  switch (block.type) {
    case "text":
      return { ...block };
    case "image":
      return { ...block, mediaAssetId: null };
    case "video":
      return { ...block };
    case "button":
      return { ...block };
    case "divider":
      return { ...block };
  }
}

function emailBlockToBroadcastBlock(block: EmailBlock): BroadcastBlock {
  if (block.type === "columns")
    return {
      id: block.id,
      type: "columns",
      columns: block.columns.map((column) =>
        column.map(emailLeafToBroadcastLeaf)
      ),
    };
  if (block.type === "section")
    throw new Error(
      `Broadcast adapter cannot represent section block ${block.id}.`
    );
  return emailLeafToBroadcastLeaf(block);
}

function emailLeafToBroadcastLeaf(
  block: EmailBlockLeaf
): BroadcastBlockNonColumn {
  switch (block.type) {
    case "text":
      return {
        id: block.id,
        type: "text",
        html: block.html,
        align: block.align,
      };
    case "image":
      return {
        id: block.id,
        type: "image",
        src: block.src,
        alt: block.alt,
        href: block.href,
        widthPx: block.widthPx,
        align: block.align,
      };
    case "video":
      return {
        id: block.id,
        type: "video",
        videoUrl: block.videoUrl,
        thumbnailSrc: block.thumbnailSrc,
        alt: block.alt,
      };
    case "button":
      return {
        id: block.id,
        type: "button",
        label: block.label,
        href: block.href,
        align: block.align,
        bgColor: block.bgColor,
        textColor: block.textColor,
      };
    case "divider":
      return { id: block.id, type: "divider" };
    case "heading":
      throw new Error(
        `Broadcast adapter cannot represent heading block ${block.id}.`
      );
    case "spacer":
      throw new Error(
        `Broadcast adapter cannot represent spacer block ${block.id}.`
      );
  }
}

function blockToSimpleHtml(block: EmailBlock): string {
  if (block.type === "text") return block.html;
  if (block.type === "heading")
    return `<h${block.level ?? 2}>${escape(block.text)}</h${block.level ?? 2}>`;
  if (block.type === "section")
    return block.blocks.map(blockToSimpleHtml).join("");
  if (block.type === "columns")
    return block.columns
      .map((column) => column.map(blockToSimpleHtml).join(" "))
      .join("\n");
  if (block.type === "image")
    return `<p><img src="${escape(block.src)}" alt="${escape(block.alt)}"></p>`;
  if (block.type === "button")
    return `<p><a href="${escape(block.href)}">${escape(block.label)}</a></p>`;
  if (block.type === "video")
    return `<p><a href="${escape(block.videoUrl)}">${escape(block.alt)}</a></p>`;
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
