"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, FolderUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IMPORTED_SITE_LIMITS, importedContentOrigin, siteFileUrl } from "@/lib/pages-funnels/imported-site/policy";
import { SiteImportError, prepareSite, readZip, uploadSite, type UploadedSite } from "@/lib/pages-funnels/imported-site/client";

export interface ImportSiteState {
  uploaded: UploadedSite | null;
  skipped: string[];
  acknowledged: boolean;
}

export function importSiteReady(s: ImportSiteState): boolean {
  if (!s.uploaded) return false;
  const needsAck = s.uploaded.missing.length > 0 || s.uploaded.invalidForms.length > 0 || s.skipped.length > 0;
  return !needsAck || s.acknowledged;
}

/**
 * Create Page → Import HTML → Upload website files (2026-11-20): a .zip
 * export or a folder (index.html + CSS, JS, images, fonts). Files are checked
 * in the browser, checked again on the server, stored for this workspace and
 * previewed running in the isolated content origin — exactly what visitors get.
 */
export function ImportSitePanel({ subAccountId, value, onChange }: { subAccountId: string; value: ImportSiteState; onChange: (v: ImportSiteState) => void }) {
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = importedContentOrigin();

  async function run(read: () => Promise<{ name: string; bytes: Uint8Array }[]>) {
    setError(null);
    onChange({ uploaded: null, skipped: [], acknowledged: false });
    try {
      setBusy("Reading files…");
      const prepared = prepareSite(await read());
      if (!prepared.entry) throw new SiteImportError("No index.html found. Include the page's index.html at the top level of the upload.");
      const uploaded = await uploadSite(subAccountId, prepared, (d, t) => setBusy(`Uploading ${d} of ${t} files…`));
      onChange({ uploaded, skipped: prepared.skipped, acknowledged: false });
    } catch (err) {
      setError(err instanceof SiteImportError || err instanceof Error ? err.message : "Couldn't import those files.");
    } finally {
      setBusy(null);
    }
  }

  function onZip(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return setError("Choose a .zip file.");
    if (file.size > IMPORTED_SITE_LIMITS.zipBytes) return setError(`That archive is larger than ${IMPORTED_SITE_LIMITS.zipBytes / 1_000_000} MB.`);
    void run(async () => readZip(await file.arrayBuffer()).map((f) => ({ name: f.name, bytes: f.bytes })));
  }

  function onFolder(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    void run(async () => Promise.all(files.map(async (f) => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
  }

  const up = value.uploaded;
  const needsAck = !!up && (up.missing.length > 0 || up.invalidForms.length > 0 || value.skipped.length > 0);
  return (
    <section aria-labelledby="import-site-heading" className="flex flex-col gap-4" data-import-site-panel>
      <div className="flex flex-col gap-1">
        <h2 id="import-site-heading" className="text-body font-semibold">Upload website files</h2>
        <p className="text-body-sm text-muted-foreground">
          Upload a .zip export or a folder with index.html and its CSS, JavaScript, images and fonts (up to {IMPORTED_SITE_LIMITS.files} files, {IMPORTED_SITE_LIMITS.totalBytes / 1_000_000} MB). Scripts run in an isolated frame that can&apos;t reach your Magnetix account.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={zipInput} type="file" accept=".zip,application/zip" className="sr-only" onChange={onZip} data-import-site-zip aria-label="Choose a .zip file" />
        <input ref={folderInput} type="file" multiple className="sr-only" onChange={onFolder} data-import-site-folder aria-label="Choose a website folder" {...({ webkitdirectory: "" } as Record<string, string>)} />
        <Button type="button" variant="secondary" onClick={() => zipInput.current?.click()} disabled={!!busy}>
          <Upload aria-hidden="true" /> Choose .zip
        </Button>
        <Button type="button" variant="secondary" onClick={() => folderInput.current?.click()} disabled={!!busy}>
          <FolderUp aria-hidden="true" /> Choose folder
        </Button>
      </div>
      {busy ? (
        <p role="status" className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {busy}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body-sm" data-import-site-error>
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> {error}
        </p>
      ) : null}
      {up ? (
        <p className="flex items-center gap-2 text-body-sm" data-import-site-summary>
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          {up.site.fileCount} files · {Math.max(1, Math.round(up.site.totalBytes / 1000))} KB · entry {up.site.entry} · {up.site.scripts ? `interactive (${up.site.scripts} script${up.site.scripts === 1 ? "" : "s"})` : "no scripts"}
          {up.site.forms.length ? ` · ${up.site.forms.length} Magnetix form${up.site.forms.length === 1 ? "" : "s"} connected` : ""}
        </p>
      ) : null}
      {up && needsAck ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-body-sm text-amber-950" data-import-site-missing>
          {up.missing.length ? (
            <div>
              <p className="font-semibold">Files the page refers to that weren&apos;t in the upload (or use insecure http):</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-caption">{up.missing.slice(0, 10).map((m) => <li key={m} className="break-all">{m}</li>)}</ul>
            </div>
          ) : null}
          {value.skipped.length ? (
            <div>
              <p className="font-semibold">Skipped:</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-caption">{value.skipped.slice(0, 10).map((m) => <li key={m} className="break-all">{m}</li>)}</ul>
            </div>
          ) : null}
          {up.invalidForms.length ? <p>These form ids aren&apos;t Magnetix forms in this workspace, so those forms won&apos;t submit: {up.invalidForms.join(", ")}</p> : null}
          <label className="flex items-start gap-2 pt-1">
            <Checkbox checked={value.acknowledged} onCheckedChange={(c) => onChange({ ...value, acknowledged: c === true })} data-import-site-ack />
            <span>I understand. Import anyway — I can fix these later.</span>
          </label>
        </div>
      ) : null}
      {up && origin ? (
        <div className="flex flex-col gap-1.5" data-import-site-preview>
          <p className="text-caption font-medium text-muted-foreground">Preview — running in the same isolated frame visitors get (links and form sending are inactive here)</p>
          <iframe
            src={siteFileUrl(origin, up.site.bundleId, up.site.entry)}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            title="Imported website preview"
            className="h-[32rem] w-full rounded-lg border border-border bg-white"
          />
        </div>
      ) : null}
    </section>
  );
}
