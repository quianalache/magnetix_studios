"use client";

import { useEffect, useRef, useState } from "react";
import { CodeXml } from "lucide-react";
import type { CustomHtmlArtifact, StyleConfig } from "@/types/pages-funnels-puck";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import {
  CUSTOM_HTML_INITIAL_AUTO_HEIGHT,
  CUSTOM_HTML_LIMITS,
  HEIGHT_MESSAGE_TYPE,
  customHtmlSandbox,
} from "@/lib/pages-funnels/custom-html/policy";

/**
 * Renders an ALREADY-SANITIZED Custom HTML document in its isolated frame
 * (see custom-html/policy.ts for the security model). Shared by the builder
 * canvas and by Preview / published pages, so fidelity is identical.
 *
 * Editing: links are inert (no navigation sandbox tokens) and a transparent
 * overlay keeps clicks selecting the block instead of landing in the frame.
 * Visitors never see the editor label or overlay.
 */
export function CustomHtmlBlock({
  id,
  srcDoc,
  isEmpty,
  display,
  style,
  editing,
}: {
  id: string;
  srcDoc: string;
  isEmpty: boolean;
  display: CustomHtmlArtifact["display"];
  style?: StyleConfig;
  editing: boolean;
}) {
  const responsiveCss = resolveResponsiveCss(id, style);
  if (isEmpty && !editing) return null;
  return (
    <>
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      <div id={id} data-custom-html="" className="relative w-full max-w-full min-w-0" style={resolveBaseStyleProps(style)}>
        {isEmpty ? (
          <div className="border-border bg-card text-muted-foreground flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center">
            <CodeXml className="size-5" aria-hidden="true" />
            <p className="text-foreground text-sm font-medium">Custom HTML</p>
            <p className="max-w-xs text-xs">Paste your HTML and CSS in the block settings. It shows here in its own isolated frame.</p>
          </div>
        ) : (
          <CustomHtmlFrame srcDoc={srcDoc} display={display} editing={editing} />
        )}
      </div>
    </>
  );
}

function CustomHtmlFrame({
  srcDoc,
  display,
  editing,
}: {
  srcDoc: string;
  display: CustomHtmlArtifact["display"];
  editing: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const auto = display.height === "auto";

  useEffect(() => {
    if (!auto) return;
    const onMessage = (event: MessageEvent) => {
      // Only our own frame's measuring script; the payload is a number, nothing else is read.
      if (!ref.current || event.source !== ref.current.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== HEIGHT_MESSAGE_TYPE || typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      setMeasured(Math.min(CUSTOM_HTML_LIMITS.autoHeightMax, Math.max(1, Math.round(data.height))));
    };
    // The frame's `parent` is the window that OWNS the iframe element — in
    // the builder that's Puck's canvas iframe, not this app's window.
    const host = ref.current?.ownerDocument?.defaultView ?? window;
    host.addEventListener("message", onMessage);
    return () => host.removeEventListener("message", onMessage);
  }, [auto]);

  const height = auto ? (measured ?? CUSTOM_HTML_INITIAL_AUTO_HEIGHT) : display.fixedHeight;
  return (
    <div className="relative w-full">
      <iframe
        ref={ref}
        title="Embedded design"
        srcDoc={srcDoc}
        sandbox={customHtmlSandbox(editing ? "editing" : "visitor")}
        referrerPolicy="no-referrer"
        // Eager, not lazy: a lazy frame below the fold would load (and grow
        // from its placeholder height) while the visitor scrolls past it.
        loading="eager"
        className="block w-full max-w-full border-0 bg-transparent"
        style={{ height }}
      />
      {editing && (
        <div className="group/customhtml absolute inset-0 cursor-pointer" aria-hidden="true">
          <span className="border-border bg-card text-muted-foreground absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-micro font-medium opacity-0 shadow-sm transition-opacity group-hover/customhtml:opacity-100">
            <CodeXml className="size-3" /> Custom HTML
          </span>
        </div>
      )}
    </div>
  );
}
