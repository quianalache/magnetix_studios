import sanitizeHtml from "sanitize-html";
import type {
  EmailBlock,
  EmailBlockLeaf,
  EmailDocument,
} from "@/types/email-document";
import { validateEmailDocument } from "./validate";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailRenderOptions {
  businessName?: string;
  mailingAddress?: string;
  unsubscribeUrl?: string;
  resolveMergeTags?: (value: string) => string;
  includeComplianceFooter?: boolean;
}

export function renderEmailHtml(
  document: EmailDocument,
  options: EmailRenderOptions = {}
): string {
  assertRenderable(document);
  const resolve = options.resolveMergeTags ?? ((value: string) => value);
  const rows = document.blocks
    .map((block) => renderBlockRow(block, resolve))
    .join("");
  const footer = options.includeComplianceFooter
    ? renderFooter(options, resolve)
    : "";
  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">${rows}${footer}</table>` +
    `</td></tr></table></body></html>`
  );
}

export function renderEmailText(
  document: EmailDocument,
  options: EmailRenderOptions = {}
): string {
  assertRenderable(document);
  const resolve = options.resolveMergeTags ?? ((value: string) => value);
  const parts = document.blocks
    .map((block) => blockToText(block, resolve))
    .filter(Boolean);
  if (options.includeComplianceFooter) {
    parts.push(
      [
        options.businessName ?? "",
        options.mailingAddress ?? "",
        options.unsubscribeUrl ? `Unsubscribe: ${options.unsubscribeUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return parts.join("\n\n");
}

function assertRenderable(document: EmailDocument): void {
  const errors = validateEmailDocument(document);
  if (errors.length)
    throw new Error(`Invalid email document: ${errors.join(" ")}`);
}

function renderBlockRow(
  block: EmailBlock,
  resolve: (value: string) => string
): string {
  if (block.type === "section") {
    const inner = block.blocks
      .map((child) => renderBlockRow(child, resolve))
      .join("");
    const bg = block.backgroundColor
      ? `background:${safeColor(block.backgroundColor)};`
      : "";
    return `<tr><td style="${bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr>`;
  }
  if (block.type === "columns") {
    const width = Math.floor(100 / Math.max(block.columns.length, 1));
    const cells = block.columns
      .map(
        (column) =>
          `<td valign="top" style="width:${width}%;padding:0 8px;">${column.map((child) => renderLeaf(child, resolve)).join("")}</td>`
      )
      .join("");
    return `<tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`;
  }
  const padding =
    block.type === "divider" || block.type === "spacer"
      ? "8px 24px"
      : "12px 24px";
  return `<tr><td style="padding:${padding};">${renderLeaf(block, resolve)}</td></tr>`;
}

function renderLeaf(
  block: EmailBlockLeaf,
  resolve: (value: string) => string
): string {
  switch (block.type) {
    case "text":
      return `<div style="${align(block.align)}font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#1a1a1a;">${sanitizeText(resolve(block.html))}</div>`;
    case "heading": {
      const size = block.level === 1 ? 26 : block.level === 3 ? 18 : 22;
      return `<h${block.level ?? 2} style="${align(block.align)}font-family:${FONT_STACK};font-size:${size}px;line-height:1.3;color:#1a1a1a;margin:0;">${esc(resolve(block.text))}</h${block.level ?? 2}>`;
    }
    case "image": {
      const width = block.widthPx ?? 560;
      const image = `<img src="${esc(block.src)}" alt="${esc(resolve(block.alt))}" width="${width}" style="max-width:100%;height:auto;display:block;border:0;${block.align === "center" ? "margin:0 auto;" : ""}">`;
      return `<div style="${align(block.align)}">${block.href ? `<a href="${esc(block.href)}" target="_blank" rel="noopener noreferrer nofollow">${image}</a>` : image}</div>`;
    }
    case "button":
      return `<div style="${align(block.align)}"><a href="${esc(block.href)}" target="_blank" rel="noopener noreferrer nofollow" style="display:inline-block;padding:12px 28px;border-radius:6px;background:${safeColor(block.bgColor ?? "#4f46e5")};color:${safeColor(block.textColor ?? "#ffffff")};text-decoration:none;font-family:${FONT_STACK};font-weight:600;font-size:14px;">${esc(resolve(block.label))}</a></div>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:0;">`;
    case "spacer":
      return `<div style="height:${Math.round(block.heightPx ?? 16)}px;line-height:${Math.round(block.heightPx ?? 16)}px;font-size:1px;">&nbsp;</div>`;
    case "video":
      return `<div style="text-align:center;"><a href="${esc(block.videoUrl)}" target="_blank" rel="noopener noreferrer nofollow"><img src="${esc(block.thumbnailSrc)}" alt="${esc(resolve(block.alt))}" width="560" style="max-width:100%;height:auto;display:block;border:0;margin:0 auto;"><div style="margin-top:8px;font-family:${FONT_STACK};font-size:13px;color:#4f46e5;">▶ Watch video</div></a></div>`;
  }
}

function blockToText(
  block: EmailBlock,
  resolve: (value: string) => string
): string {
  if (block.type === "columns")
    return block.columns
      .map((column) =>
        column
          .map((child) => leafToText(child, resolve))
          .filter(Boolean)
          .join("\n")
      )
      .filter(Boolean)
      .join("\n\n");
  if (block.type === "section")
    return block.blocks
      .map((child) => blockToText(child, resolve))
      .filter(Boolean)
      .join("\n\n");
  return leafToText(block, resolve);
}

function leafToText(
  block: EmailBlockLeaf,
  resolve: (value: string) => string
): string {
  switch (block.type) {
    case "text":
      return stripHtml(sanitizeText(resolve(block.html)));
    case "heading":
      return resolve(block.text);
    case "image":
      return block.alt ? `[Image: ${resolve(block.alt)}]` : "[Image]";
    case "button":
      return `${resolve(block.label)}: ${block.href}`;
    case "video":
      return `${resolve(block.alt || "Video")}: ${block.videoUrl}`;
    case "divider":
      return "---";
    case "spacer":
      return "";
  }
}

function renderFooter(
  options: EmailRenderOptions,
  resolve: (value: string) => string
): string {
  const lines = [options.businessName, options.mailingAddress]
    .filter(Boolean)
    .map((value) => esc(resolve(value!)))
    .join("<br>");
  const unsubscribe = options.unsubscribeUrl
    ? `<br><a href="${esc(options.unsubscribeUrl)}" style="color:#767676;">Unsubscribe</a>`
    : "";
  return `<tr><td style="padding:24px;border-top:1px solid #e5e5e5;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#767676;">${lines}${unsubscribe}</td></tr>`;
}

function sanitizeText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      p: ["style"],
      span: ["style"],
      li: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}
function align(value?: string): string {
  return `text-align:${value ?? "left"};`;
}
function safeColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#4f46e5";
}
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
