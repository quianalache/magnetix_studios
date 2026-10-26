"use client";

import { useMemo } from "react";
import { buildSafeCustomHtmlDocument } from "@/lib/pages-funnels/custom-html/sanitize";
import { CustomHtmlBlock } from "@/components/pages-funnels/puck/custom-html-frame";
import type { CustomHtmlComponentProps } from "@/components/pages-funnels/puck/custom-html-server";

/** Builder canvas variant: sanitizes in the browser as the owner edits (same sanitizer as the server). */
export function CustomHtmlElementClientRender({ id, content, style, editing }: CustomHtmlComponentProps) {
  const doc = useMemo(() => buildSafeCustomHtmlDocument(content), [content]);
  return <CustomHtmlBlock id={id} srcDoc={doc.srcDoc} isEmpty={doc.isEmpty} display={doc.display} style={style} editing={editing} />;
}
