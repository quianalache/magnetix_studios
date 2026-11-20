"use client";

import { useEffect, useRef, useState } from "react";
import { CodeXml } from "lucide-react";
import type { CustomHtmlArtifact, StyleConfig } from "@/types/pages-funnels-puck";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import {
  SITE_FORM_MESSAGE,
  SITE_FORM_RESULT_MESSAGE,
  importedContentOrigin,
  siteFileUrl,
  siteSandbox,
  type ImportedSiteRef,
} from "@/lib/pages-funnels/imported-site/policy";
import {
  CUSTOM_HTML_INITIAL_AUTO_HEIGHT,
  CUSTOM_HTML_LIMITS,
  HEIGHT_MESSAGE_TYPE,
  MEASURE_REQUEST_TYPE,
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
  site,
}: {
  id: string;
  srcDoc: string;
  isEmpty: boolean;
  display: CustomHtmlArtifact["display"];
  style?: StyleConfig;
  editing: boolean;
  /** Imported website: served from the separate content origin when it's configured. */
  site?: ImportedSiteRef;
}) {
  const responsiveCss = resolveResponsiveCss(id, style);
  const siteOrigin = site ? importedContentOrigin() : null;
  if (site && siteOrigin) {
    return (
      <>
        {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
        <div id={id} data-custom-html="" data-imported-site="" className="relative w-full max-w-full min-w-0" style={resolveBaseStyleProps(style)}>
          <ImportedSiteFrame origin={siteOrigin} site={site} editing={editing} />
        </div>
      </>
    );
  }
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
    // The frame may have loaded (and reported) before this listener existed.
    requestMeasure();
    return () => host.removeEventListener("message", onMessage);
  }, [auto]);

  function requestMeasure() {
    ref.current?.contentWindow?.postMessage({ type: MEASURE_REQUEST_TYPE }, "*");
  }

  const height = auto ? (measured ?? CUSTOM_HTML_INITIAL_AUTO_HEIGHT) : display.fixedHeight;
  return (
    <div className="relative w-full">
      <iframe
        ref={ref}
        title="Embedded design"
        srcDoc={srcDoc}
        sandbox={customHtmlSandbox(editing ? "editing" : "visitor")}
        referrerPolicy="no-referrer"
        onLoad={auto ? requestMeasure : undefined}
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


const MAX_FORM_FIELDS = 50;
const MAX_FIELD_CHARS = 5000;

/**
 * An imported website, isolated on the separate content origin (opaque
 * sandbox, no allow-same-origin). One screen tall; the site scrolls inside
 * it like a normal website. Visitors only: the narrow form bridge — the
 * ONLY thing this page accepts from the frame — forwards a submission for a
 * form CONNECTED to this block (validated server-side at import) to the
 * existing public Forms endpoint. Nothing else crosses the boundary.
 */
function ImportedSiteFrame({ origin, site, editing }: { origin: string; site: ImportedSiteRef; editing: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (editing) return;
    async function onMessage(event: MessageEvent) {
      const frame = ref.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown; formId?: unknown; values?: unknown } | null;
      if (!data || data.type !== SITE_FORM_MESSAGE) return;
      const formId = typeof data.formId === "string" ? data.formId : "";
      const reply = (ok: boolean, message: string) => frame.contentWindow?.postMessage({ type: SITE_FORM_RESULT_MESSAGE, formId, ok, message }, "*");
      if (!site.forms.includes(formId)) return reply(false, "This form isn't connected to Magnetix.");
      if (busy.current) return;
      const raw = data.values && typeof data.values === "object" ? (data.values as Record<string, unknown>) : {};
      const namedValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw).slice(0, MAX_FORM_FIELDS)) {
        if (typeof v === "string" && /^[A-Za-z0-9_.\[\] -]{1,80}$/.test(k)) namedValues[k] = v.slice(0, MAX_FIELD_CHARS);
      }
      busy.current = true;
      try {
        const res = await fetch(`/api/forms/${encodeURIComponent(formId)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: {}, namedValues, attribution: { landingPage: window.location.href, referrer: document.referrer || null } }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; successMessage?: string };
        reply(res.ok, res.ok ? json.successMessage || "" : json.error || "Something went wrong. Please try again.");
      } catch {
        reply(false, "Couldn't send. Check your connection and try again.");
      } finally {
        busy.current = false;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editing, site.forms]);
  return (
    <div className="relative">
      <iframe
        ref={ref}
        src={siteFileUrl(origin, site.bundleId, site.entry)}
        sandbox={siteSandbox(editing ? "editing" : "visitor")}
        referrerPolicy="no-referrer"
        loading={editing ? "lazy" : "eager"}
        title="Imported website"
        className="block w-full border-0 bg-white"
        style={{ height: "100dvh", minHeight: 480 }}
        data-imported-site-frame=""
      />
      {editing ? <div className="absolute inset-0" aria-hidden="true" /> : null}
    </div>
  );
}
