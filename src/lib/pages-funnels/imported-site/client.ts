"use client";

import { unzipSync } from "fflate";
import { IMPORTED_SITE_LIMITS, isAllowedSiteFile, normalizeSitePath, pickEntry, stripCommonRoot, type ImportedSiteRef } from "@/lib/pages-funnels/imported-site/policy";

/**
 * Browser side of website imports (2026-11-20): read a .zip export or a
 * folder / multi-file selection, apply the same path / type / size rules the
 * server enforces again, then upload file by file (each request stays well
 * under the hosting request-size limit).
 */

export interface PreparedSite {
  files: { path: string; bytes: Uint8Array }[];
  entry: string | null;
  /** Skipped entries and why (unsafe path, unsupported type, too large…). */
  skipped: string[];
  totalBytes: number;
}

export class SiteImportError extends Error {}

/** Zip → files. Guards: claimed AND actual uncompressed size, file count, unsafe paths. */
export function readZip(buf: ArrayBuffer): { name: string; bytes: Uint8Array }[] {
  const data = new Uint8Array(buf);
  let claimed = 0;
  let count = 0;
  let tooBig: string | null = null;
  const out = unzipSync(data, {
    filter: (f) => {
      if (f.name.endsWith("/")) return false;
      count += 1;
      claimed += f.originalSize;
      if (f.originalSize > IMPORTED_SITE_LIMITS.fileBytes) {
        tooBig = f.name;
        return false;
      }
      if (claimed > IMPORTED_SITE_LIMITS.zipBytes || count > IMPORTED_SITE_LIMITS.files * 2) throw new SiteImportError(`This archive is too large to import (limit ${IMPORTED_SITE_LIMITS.zipBytes / 1_000_000} MB uncompressed).`);
      return true;
    },
  });
  let actual = 0;
  const files = Object.entries(out).map(([name, bytes]) => {
    actual += bytes.length;
    return { name, bytes };
  });
  if (actual > IMPORTED_SITE_LIMITS.zipBytes) throw new SiteImportError("This archive expands to more than the size limit.");
  if (tooBig) files.push({ name: `__too_big__/${tooBig}`, bytes: new Uint8Array() });
  return files;
}

export function prepareSite(raw: { name: string; bytes: Uint8Array }[]): PreparedSite {
  const skipped: string[] = [];
  const kept: { path: string; bytes: Uint8Array }[] = [];
  for (const f of raw) {
    if (f.name.startsWith("__too_big__/")) {
      skipped.push(`${f.name.slice(12)} — larger than ${IMPORTED_SITE_LIMITS.fileBytes / 1_000_000} MB`);
      continue;
    }
    const path = normalizeSitePath(f.name);
    if (!path) {
      if (!/(^|\/)(\.|__MACOSX)/.test(f.name)) skipped.push(`${f.name} — unsafe or unsupported file name`);
      continue;
    }
    if (!isAllowedSiteFile(path)) {
      skipped.push(`${path} — file type not supported`);
      continue;
    }
    if (f.bytes.length > IMPORTED_SITE_LIMITS.fileBytes) {
      skipped.push(`${path} — larger than ${IMPORTED_SITE_LIMITS.fileBytes / 1_000_000} MB`);
      continue;
    }
    kept.push({ path, bytes: f.bytes });
  }
  const strip = stripCommonRoot(kept.map((k) => k.path));
  const files = kept.map((k) => ({ path: strip(k.path), bytes: k.bytes }));
  const seen = new Set<string>();
  const unique = files.filter((f) => (seen.has(f.path.toLowerCase()) ? false : (seen.add(f.path.toLowerCase()), true)));
  if (unique.length > IMPORTED_SITE_LIMITS.files) throw new SiteImportError(`A website can have up to ${IMPORTED_SITE_LIMITS.files} files.`);
  const totalBytes = unique.reduce((n, f) => n + f.bytes.length, 0);
  if (totalBytes > IMPORTED_SITE_LIMITS.totalBytes) throw new SiteImportError(`A website can be up to ${IMPORTED_SITE_LIMITS.totalBytes / 1_000_000} MB in total.`);
  return { files: unique, entry: pickEntry(unique.map((f) => f.path)), skipped, totalBytes };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/pages-funnels/imported-site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SiteImportError(json.error ?? "Couldn't upload the website.");
  return json;
}

export interface UploadedSite {
  site: ImportedSiteRef;
  missing: string[];
  invalidForms: string[];
}

export async function uploadSite(subAccountId: string, prepared: PreparedSite, onProgress?: (done: number, total: number) => void): Promise<UploadedSite> {
  if (!prepared.entry) throw new SiteImportError("No index.html found. Include the page's index.html at the top level.");
  const { bundleId } = await call<{ bundleId: string }>({ action: "start", subAccountId });
  let done = 0;
  for (const f of prepared.files) {
    await call({ action: "file", subAccountId, bundleId, path: f.path, base64: toBase64(f.bytes) });
    onProgress?.(++done, prepared.files.length);
  }
  return call<UploadedSite>({ action: "finish", subAccountId, bundleId });
}

export const uploadPastedSite = (subAccountId: string, html: string) => call<UploadedSite>({ action: "html", subAccountId, html });
export const editSiteHtml = (subAccountId: string, bundleId: string, html: string) => call<UploadedSite>({ action: "edit", subAccountId, bundleId, html });
