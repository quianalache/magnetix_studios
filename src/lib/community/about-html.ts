import sanitizeHtml from "sanitize-html";
import {
  isHtml,
  plainTextToHtml,
} from "@/lib/community/lesson-html-shared";

export function aboutPlainTextLength(htmlOrText: string): number {
  return (htmlOrText ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function normalizeAboutHtml(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const html = isHtml(raw) ? raw : plainTextToHtml(raw);
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          href: attribs.href ?? "",
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}

export function aboutHtmlToPlainText(htmlOrText: string | null | undefined): string {
  return sanitizeHtml(htmlOrText ?? "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
