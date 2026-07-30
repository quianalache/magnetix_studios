import "server-only";

import sanitizeHtml from "sanitize-html";
import type {
  BroadcastContent,
  EmailBlock,
  EmailBlockNonColumn,
  EmailBlockAlign,
} from "@/types/broadcast-content";

/**
 * Renders a BroadcastContent block schema to actual email-safe HTML/text.
 * This is the single source of truth for both the composer's live preview
 * (via POST /api/broadcasts/render) and the real send (step/route.ts) — the
 * preview iframe renders this exact function's output, so what an operator
 * sees while composing is byte-for-byte what a recipient gets.
 *
 * Hard rules, because real inboxes (especially Outlook, which uses Word's
 * rendering engine) do NOT support modern CSS:
 *   - Single <table> layout, no flexbox/grid, no <div> for structure.
 *   - Every style inline — no <style> block (many clients strip <head>).
 *   - max-width 600px, the universal safe email width.
 *   - Video never plays inline — always a linked thumbnail image (see
 *     VideoBlock's doc comment in types/broadcast-content.ts).
 *
 * The compliance footer (unsubscribe + mailing address) is appended HERE,
 * not stored as a block — it must be present on every send regardless of
 * what the author built, and must never be editable/removable per-send.
 */

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function alignStyle(align?: EmailBlockAlign): string {
  return `text-align:${align ?? "left"};`;
}

/** Email-specific allowlist — deliberately narrower than sanitizeLessonHtml
 *  (src/lib/community/lesson-html.ts): no headings/images/iframes inside a
 *  text block (images are their own block type), and `style` limited to the
 *  handful of inline properties an email client actually renders. */
function sanitizeTextBlockHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li", "span"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      p: ["style"],
      span: ["style"],
      li: ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
        "font-weight": [/^\d+$/, /^(normal|bold|bolder|lighter)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
        "text-align": [/^(left|center|right|justify)$/],
        "font-size": [/^\d+(px|pt|em|%)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
}

/** Renders ONE block's inner content — no <tr>/<td> wrapper — so the same
 *  fragment can sit either directly inside a top-level row's <td> or inside
 *  a column's <td> (see renderColumnsBlock). */
function renderBlockFragment(block: EmailBlockNonColumn): string {
  switch (block.type) {
    case "text": {
      const html = sanitizeTextBlockHtml(block.html);
      return `<div style="${alignStyle(block.align)}font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#1a1a1a;">${html}</div>`;
    }
    case "image": {
      const width = block.widthPx ?? 560;
      const img = `<img src="${esc(block.src)}" alt="${esc(block.alt)}" width="${width}" style="max-width:100%;height:auto;display:block;border:0;${block.align === "center" ? "margin:0 auto;" : ""}">`;
      const inner = block.href
        ? `<a href="${esc(block.href)}" target="_blank" rel="noopener noreferrer nofollow">${img}</a>`
        : img;
      return `<div style="${alignStyle(block.align)}">${inner}</div>`;
    }
    case "video": {
      const img = `<img src="${esc(block.thumbnailSrc)}" alt="${esc(block.alt)}" width="560" style="max-width:100%;height:auto;display:block;border:0;margin:0 auto;">`;
      return (
        `<div style="text-align:center;">` +
        `<a href="${esc(block.videoUrl)}" target="_blank" rel="noopener noreferrer nofollow" style="text-decoration:none;">` +
        img +
        `<div style="margin-top:8px;font-family:${FONT_STACK};font-size:13px;color:#4f46e5;">▶ Watch video</div>` +
        `</a></div>`
      );
    }
    case "button": {
      const bg = block.bgColor ?? "#4f46e5";
      const color = block.textColor ?? "#ffffff";
      return (
        `<div style="${alignStyle(block.align)}">` +
        `<a href="${esc(block.href)}" target="_blank" rel="noopener noreferrer nofollow" style="display:inline-block;padding:12px 28px;border-radius:6px;background:${bg};color:${color};text-decoration:none;font-family:${FONT_STACK};font-weight:600;font-size:14px;">${esc(block.label)}</a>` +
        `</div>`
      );
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:0;">`;
  }
}

function renderColumnsRow(block: Extract<EmailBlock, { type: "columns" }>): string {
  const widthPct = Math.floor(100 / Math.max(block.columns.length, 1));
  const cells = block.columns
    .map(
      (col) =>
        `<td valign="top" style="width:${widthPct}%;padding:0 8px;">` +
        col.map((b) => `<div style="padding:8px 0;">${renderBlockFragment(b)}</div>`).join("") +
        `</td>`,
    )
    .join("");
  return `<tr><td style="padding:12px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`;
}

function renderTopLevelRow(block: EmailBlock): string {
  if (block.type === "columns") return renderColumnsRow(block);
  const padding = block.type === "divider" ? "8px 24px" : "12px 24px";
  return `<tr><td style="padding:${padding};">${renderBlockFragment(block)}</td></tr>`;
}

function renderFooterRow(opts: RenderOpts): string {
  return (
    `<tr><td style="padding:24px;border-top:1px solid #e5e5e5;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#767676;">` +
    `${esc(opts.businessName)}<br>${esc(opts.mailingAddress)}<br>` +
    `<a href="${esc(opts.unsubscribeUrl)}" style="color:#767676;">Unsubscribe</a>` +
    `</td></tr>`
  );
}

interface RenderOpts {
  unsubscribeUrl: string;
  mailingAddress: string;
  businessName: string;
}

export function renderBroadcastEmailHtml(
  content: BroadcastContent,
  opts: RenderOpts,
): string {
  const rows = content.blocks.map(renderTopLevelRow).join("") + renderFooterRow(opts);
  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">${rows}</table>` +
    `</td></tr></table></body></html>`
  );
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function blockToText(block: EmailBlockNonColumn): string {
  switch (block.type) {
    case "text":
      return stripHtmlToText(sanitizeTextBlockHtml(block.html));
    case "image":
      return block.alt ? `[Image: ${block.alt}]` : "[Image]";
    case "video":
      return `${block.alt || "Video"}: ${block.videoUrl}`;
    case "button":
      return `${block.label}: ${block.href}`;
    case "divider":
      return "---";
  }
}

export function renderBroadcastEmailText(
  content: BroadcastContent,
  opts: RenderOpts,
): string {
  const parts = content.blocks.map((block) => {
    if (block.type === "columns") {
      return block.columns.map((col) => col.map(blockToText).join("\n")).join("\n\n");
    }
    return blockToText(block);
  });
  const footer = `---\n${opts.businessName}\n${opts.mailingAddress}\nUnsubscribe: ${opts.unsubscribeUrl}`;
  return `${parts.filter(Boolean).join("\n\n")}\n\n${footer}`;
}
