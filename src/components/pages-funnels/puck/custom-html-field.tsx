"use client";

import { useMemo, useState, type ClipboardEvent } from "react";
import { AlertTriangle, Info, Maximize2, Minimize2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { CustomHtmlArtifact } from "@/types/pages-funnels-puck";
import {
  CUSTOM_HTML_LIMITS,
  customHtmlLimitProblems,
  normalizeCustomHtmlArtifact,
  normalizePastedHtml,
} from "@/lib/pages-funnels/custom-html/policy";
import {
  describeCustomHtmlReport,
  sanitizeCustomCss,
  sanitizeCustomHtml,
} from "@/lib/pages-funnels/custom-html/sanitize";

/**
 * Notes from the most recent paste. Puck re-mounts custom fields when their
 * value changes, so component state would vanish the moment the cleaned code
 * is applied; this survives that and is shown only while the HTML is still
 * exactly what the paste produced (any edit retires it).
 */
let lastPaste: { html: string; notes: string[] } | null = null;

/**
 * Settings editor for Advanced → Custom HTML (2026-10-26). Written for
 * someone pasting code an AI gave them, not for developers:
 *   - pasting a whole page (doctype/head/<style>) is split automatically —
 *     styles move to CSS, the wrapper is dropped, scripts are removed;
 *   - anything that won't run (scripts, onclick, unsafe links, frames) is
 *     listed in plain words under the fields;
 *   - Display offers Auto or Fixed height (plus overflow for Fixed).
 */
export function CustomHtmlFieldEditor({
  value,
  onChange,
}: {
  value: CustomHtmlArtifact | undefined;
  onChange: (value: CustomHtmlArtifact) => void;
}) {
  const artifact = normalizeCustomHtmlArtifact(value);
  const [large, setLarge] = useState(false);
  const [, setPasteTick] = useState(0);
  const pasteNotes = lastPaste && lastPaste.html === artifact.html ? lastPaste.notes : [];
  const dismissPaste = () => {
    lastPaste = null;
    setPasteTick((n) => n + 1);
  };

  const update = (patch: Partial<CustomHtmlArtifact>) => onChange({ ...artifact, ...patch });

  // What WILL be removed when this renders — recomputed as the owner edits.
  const warnings = useMemo(() => {
    const report = sanitizeCustomHtml(artifact.html).report;
    sanitizeCustomCss(artifact.css, report);
    return describeCustomHtmlReport(report);
  }, [artifact.html, artifact.css]);
  const limitProblems = customHtmlLimitProblems(artifact);

  function onPasteHtml(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const isDocument = /<!doctype\s|<html[\s>]|<head[\s>]|<body[\s>]/i.test(text);
    const hasStyles = /<style\b|<link\b[^>]*stylesheet/i.test(text);
    const hasActiveContent = /<script\b|\son[a-z]+\s*=|javascript\s*:/i.test(text);
    if (!isDocument && !hasStyles && !hasActiveContent) return; // ordinary fragment — let the browser paste it as typed
    event.preventDefault();
    const normalized = normalizePastedHtml(text);
    const { html: cleanHtml, report } = sanitizeCustomHtml(normalized.html);
    const cleanCss = sanitizeCustomCss(normalized.css, report).css;
    const el = event.currentTarget;
    const replaceAll = isDocument || !artifact.html.trim() || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
    const html = replaceAll
      ? cleanHtml
      : artifact.html.slice(0, el.selectionStart) + cleanHtml + artifact.html.slice(el.selectionEnd);
    const css = cleanCss ? (artifact.css.trim() ? `${artifact.css.trim()}\n\n${cleanCss}` : cleanCss) : artifact.css;
    lastPaste = { html, notes: [...normalized.notes, ...describeCustomHtmlReport(report)] };
    update({ html, css, source: { kind: normalized.kind } });
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Paste HTML and CSS made elsewhere — for example by Claude. It shows on your page in its own isolated frame, so it
        can&apos;t affect the rest of the page. Scripts don&apos;t run.
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="custom-html-html" className="text-xs font-semibold">
            HTML
          </Label>
          <button
            type="button"
            onClick={() => setLarge((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            {large ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            {large ? "Smaller" : "Larger"}
          </button>
        </div>
        <Textarea
          id="custom-html-html"
          value={artifact.html}
          onChange={(e) => update({ html: e.target.value, source: artifact.source ?? { kind: "typed" } })}
          onPaste={onPasteHtml}
          placeholder={'<section class="hero">…</section>\n\nYou can paste a whole page here.'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={large ? 22 : 9}
          className="field-sizing-fixed resize-y font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="custom-html-css" className="text-xs font-semibold">
          CSS
        </Label>
        <Textarea
          id="custom-html-css"
          value={artifact.css}
          onChange={(e) => update({ css: e.target.value })}
          placeholder=".hero { padding: 64px 24px; }"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={large ? 16 : 6}
          className="field-sizing-fixed resize-y font-mono text-xs leading-relaxed"
        />
        <p className="text-muted-foreground text-xs">Styles here apply only to this block.</p>
      </div>

      {pasteNotes.length > 0 && (
        <Notice tone="info" items={pasteNotes} onDismiss={dismissPaste} title="Cleaned up your paste" />
      )}
      {limitProblems.length > 0 && <Notice tone="danger" items={limitProblems} title="Too large to save" />}
      {warnings.length > 0 && <Notice tone="warning" items={warnings} title="Some code won't run here" />}

      <div className="border-border space-y-3 border-t pt-3">
        <p className="text-xs font-semibold">Display</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-muted-foreground text-caption font-medium">Height</Label>
          <SegmentedControl
            value={artifact.display.height}
            onChange={(height) => update({ display: { ...artifact.display, height } })}
            options={[
              { value: "auto", label: "Fit content" },
              { value: "fixed", label: "Fixed" },
            ]}
          />
        </div>
        {artifact.display.height === "fixed" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="custom-html-height" className="text-muted-foreground text-caption font-medium">
                Height (px)
              </Label>
              <Input
                id="custom-html-height"
                type="number"
                min={CUSTOM_HTML_LIMITS.fixedHeightMin}
                max={CUSTOM_HTML_LIMITS.fixedHeightMax}
                value={artifact.display.fixedHeight}
                onChange={(e) =>
                  onChange(normalizeCustomHtmlArtifact({ ...artifact, display: { ...artifact.display, fixedHeight: Number(e.target.value) } }))
                }
                className="h-8 w-24 text-caption"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-muted-foreground text-caption font-medium">If the design is taller</Label>
              <SegmentedControl
                value={artifact.display.overflow}
                onChange={(overflow) => update({ display: { ...artifact.display, overflow } })}
                options={[
                  { value: "scroll", label: "Scroll inside" },
                  { value: "clip", label: "Cut off" },
                ]}
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">The block grows to fit your design.</p>
        )}
      </div>

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        Links open on your page. Forms inside Custom HTML can&apos;t submit — use the Form block to collect leads.
      </p>
    </div>
  );
}

function Notice({
  tone,
  title,
  items,
  onDismiss,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  items: string[];
  onDismiss?: () => void;
}) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "relative rounded-lg border px-3 py-2.5 text-xs",
        tone === "info" && "border-border bg-surface-sunken text-foreground",
        tone === "warning" && "border-status-warning-fg/20 bg-status-warning-bg text-status-warning-fg",
        tone === "danger" && "border-status-danger-fg/20 bg-status-danger-bg text-status-danger-fg",
      )}
    >
      <p className="flex items-center gap-1.5 pr-5 font-semibold">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="absolute top-2 right-2 opacity-70 hover:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
