"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, FileCode2, Info, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomHtmlBlock } from "@/components/pages-funnels/puck/custom-html-frame";
import { buildSafeCustomHtmlDocument } from "@/lib/pages-funnels/custom-html/sanitize";
import { HTML_IMPORT_MAX_FILE_BYTES, analyzeHtmlImport, type HtmlImportAnalysis } from "@/lib/pages-funnels/custom-html/import";

export interface ImportHtmlState {
  html: string;
  analysis: HtmlImportAnalysis | null;
  /** Owner confirmed they understand which files won't load. */
  acknowledged: boolean;
}

/** True when the import can go ahead (no blocking problem; missing files acknowledged). */
export function importHtmlReady(s: ImportHtmlState): boolean {
  if (!s.analysis || s.analysis.problems.length) return false;
  const needsAck = s.analysis.missingFiles.length > 0 || s.analysis.siteLinks.length > 0;
  return !needsAck || s.acknowledged;
}

/**
 * Create Page → Import HTML (2026-11-20). Paste a full page (e.g. made with
 * Claude) or choose an .html file. The page becomes ONE Custom HTML block —
 * same sanitizer, sandboxed frame and CSP as that block — so the preview
 * here is exactly what visitors get.
 */
export function ImportHtmlPanel({ value, onChange }: { value: ImportHtmlState; onChange: (next: ImportHtmlState) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const analysis = value.analysis;
  const preview = useMemo(() => (analysis && !analysis.problems.length ? buildSafeCustomHtmlDocument(analysis.artifact) : null), [analysis]);

  function setHtml(html: string) {
    onChange({ html, analysis: html.trim() ? analyzeHtmlImport(html) : null, acknowledged: false });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setFileError(null);
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") return setFileError("Choose an .html file.");
    if (file.size > HTML_IMPORT_MAX_FILE_BYTES) return setFileError(`That file is too large (${Math.round(file.size / 1000)} KB). The limit is ${HTML_IMPORT_MAX_FILE_BYTES / 1000} KB.`);
    setHtml(await file.text());
  }

  const needsAck = !!analysis && (analysis.missingFiles.length > 0 || analysis.siteLinks.length > 0);

  return (
    <section aria-labelledby="import-html-heading" className="flex flex-col gap-4" data-import-html-panel>
      <div className="flex flex-col gap-1">
        <h2 id="import-html-heading" className="text-body font-semibold">Import an HTML page</h2>
        <p className="text-body-sm text-muted-foreground">
          Paste the full HTML of a page made with Claude or another AI tool, or choose an .html file. HTML and CSS are kept as designed; scripts and form submissions are switched off for security.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="import-html-source">HTML</Label>
          <input ref={fileInput} type="file" accept=".html,.htm,text/html" className="sr-only" onChange={onFile} data-import-html-file aria-label="Choose an HTML file" />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" /> Choose .html file
          </Button>
        </div>
        <Textarea
          id="import-html-source"
          value={value.html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder={"<!doctype html>\n<html>\n  <head>…</head>\n  <body>…</body>\n</html>"}
          spellCheck={false}
          className="min-h-56 font-mono text-caption"
          data-import-html-source
        />
        {fileError ? <p role="alert" className="text-caption text-destructive">{fileError}</p> : null}
      </div>

      {analysis?.problems.length ? (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body-sm" data-import-html-problems>
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>{analysis.problems.map((p) => <p key={p}>{p}</p>)}</div>
        </div>
      ) : null}

      {analysis && needsAck ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-body-sm text-amber-950" data-import-html-missing>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> Some parts of this page weren&apos;t included
          </p>
          {analysis.missingFiles.length ? (
            <div>
              <p>These files are referenced by a relative path or over insecure http, so they won&apos;t load here. Use full https:// links (for example, upload images to the Media Library and paste their links):</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-caption">{analysis.missingFiles.slice(0, 8).map((f) => <li key={f} className="break-all">{f}</li>)}</ul>
              {analysis.missingFiles.length > 8 ? <p className="text-caption">…and {analysis.missingFiles.length - 8} more.</p> : null}
            </div>
          ) : null}
          {analysis.siteLinks.length ? (
            <div>
              <p>These links point to other files of the original site and won&apos;t open here. Change them to full links or to your Magnetix pages:</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-caption">{analysis.siteLinks.slice(0, 6).map((f) => <li key={f} className="break-all">{f}</li>)}</ul>
            </div>
          ) : null}
          <label className="flex items-start gap-2 pt-1">
            <Checkbox checked={value.acknowledged} onCheckedChange={(c) => onChange({ ...value, acknowledged: c === true })} data-import-html-ack />
            <span>I understand these won&apos;t work until I fix them. Import anyway — I can edit the HTML later.</span>
          </label>
        </div>
      ) : null}

      {analysis && !analysis.problems.length && analysis.notes.length ? (
        <div className="flex gap-2 rounded-lg bg-tint-violet p-3 text-caption text-muted-foreground" data-import-html-notes>
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>{analysis.notes.map((n) => <p key={n}>{n}</p>)}</div>
        </div>
      ) : null}

      {preview && !preview.isEmpty ? (
        <div className="flex flex-col gap-1.5" data-import-html-preview>
          <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
            <FileCode2 className="size-3.5" aria-hidden="true" /> Preview — the same isolated frame visitors get (links are inactive here)
          </p>
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-white">
            <CustomHtmlBlock id="import-html-preview" srcDoc={preview.srcDoc} isEmpty={false} display={preview.display} editing />
          </div>
        </div>
      ) : null}
    </section>
  );
}
