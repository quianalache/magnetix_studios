import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import { mediaBucketName } from "@/lib/server/assets/media-library-service";
import {
  IMPORTED_SITE_LIMITS,
  IMPORTED_SITE_TYPES,
  connectedFormIds,
  fileExtension,
  findUnresolvedSiteRefs,
  isAllowedSiteFile,
  isHtmlPath,
  normalizeSitePath,
  pickEntry,
  type ImportedSiteRef,
} from "@/lib/pages-funnels/imported-site/policy";

/**
 * Imported website bundles (2026-11-20). A bundle = the files of ONE imported
 * website, owned by one workspace, immutable once finished (an edit makes a
 * new bundle), so Version History, Duplicate and Templates can keep pointing
 * at it safely. Record: `importedSiteBundles/{bundleId}` (server-only —
 * default-deny rules, no rules change). Files: Storage
 * `imported-sites/{subAccountId}/{bundleId}/{path}` written with the Admin
 * SDK only (no browser access, no download tokens). Served ONLY by the
 * content-origin route (`/imported/...`).
 */

export class ImportedSiteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

interface BundleFile {
  path: string;
  size: number;
}

interface BundleDoc {
  subAccountId: string;
  agencyId: string | null;
  createdByUid: string;
  status: "uploading" | "complete";
  files: BundleFile[];
  totalBytes: number;
  entry: string | null;
  scripts: number;
  forms: string[];
  createdAt: unknown;
  completedAt?: number;
}

const bundles = () => getAdminDb().collection("importedSiteBundles");
const objectKey = (sa: string, bundleId: string, path: string) => `imported-sites/${sa}/${bundleId}/${path}`;
const bucket = () => getStorage().bucket(mediaBucketName());
const newBundleId = () => randomBytes(18).toString("base64url");

async function loadOwned(subAccountId: string, bundleId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; doc: BundleDoc }> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(bundleId)) throw new ImportedSiteError("Upload not found.", 404);
  const ref = bundles().doc(bundleId);
  const snap = await ref.get();
  const doc = snap.data() as BundleDoc | undefined;
  if (!doc || doc.subAccountId !== subAccountId) throw new ImportedSiteError("Upload not found.", 404);
  return { ref, doc };
}

export async function startSiteBundle(input: { subAccountId: string; uid: string }): Promise<{ bundleId: string }> {
  const sa = await getAdminDb().doc(`subAccounts/${input.subAccountId}`).get();
  if (!sa.exists) throw new ImportedSiteError("Workspace not found", 404);
  const bundleId = newBundleId();
  const doc: BundleDoc = {
    subAccountId: input.subAccountId,
    agencyId: (sa.get("agencyId") as string | undefined) ?? null,
    createdByUid: input.uid,
    status: "uploading",
    files: [],
    totalBytes: 0,
    entry: null,
    scripts: 0,
    forms: [],
    createdAt: FieldValue.serverTimestamp(),
  };
  await bundles().doc(bundleId).create(doc);
  return { bundleId };
}

/** Adds one file. Validates path, type and the size / count budgets; never overwrites. */
export async function addSiteFile(input: { subAccountId: string; uid: string; bundleId: string; path: unknown; base64: unknown }): Promise<{ path: string; size: number }> {
  const { ref, doc } = await loadOwned(input.subAccountId, input.bundleId);
  if (doc.status !== "uploading" || doc.createdByUid !== input.uid) throw new ImportedSiteError("This upload is already finished.", 409);
  const path = typeof input.path === "string" ? normalizeSitePath(input.path) : null;
  if (!path) throw new ImportedSiteError("That file name or folder isn't allowed.");
  if (!isAllowedSiteFile(path)) throw new ImportedSiteError(`“${path}” isn't a supported website file type.`);
  if (typeof input.base64 !== "string" || input.base64.length > Math.ceil((IMPORTED_SITE_LIMITS.fileBytes * 4) / 3) + 8) throw new ImportedSiteError(`“${path}” is larger than ${IMPORTED_SITE_LIMITS.fileBytes / 1_000_000} MB.`);
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > IMPORTED_SITE_LIMITS.fileBytes) throw new ImportedSiteError(`“${path}” is larger than ${IMPORTED_SITE_LIMITS.fileBytes / 1_000_000} MB.`);
  await getAdminDb().runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as BundleDoc;
    if (cur.status !== "uploading") throw new ImportedSiteError("This upload is already finished.", 409);
    if (cur.files.some((f) => f.path.toLowerCase() === path.toLowerCase())) throw new ImportedSiteError(`“${path}” was already added.`, 409);
    if (cur.files.length + 1 > IMPORTED_SITE_LIMITS.files) throw new ImportedSiteError(`A website can have up to ${IMPORTED_SITE_LIMITS.files} files.`);
    if (cur.totalBytes + bytes.length > IMPORTED_SITE_LIMITS.totalBytes) throw new ImportedSiteError(`A website can be up to ${IMPORTED_SITE_LIMITS.totalBytes / 1_000_000} MB in total.`);
    tx.update(ref, { files: [...cur.files, { path, size: bytes.length }], totalBytes: cur.totalBytes + bytes.length });
  });
  await bucket().file(objectKey(input.subAccountId, input.bundleId, path)).save(bytes, {
    resumable: false,
    contentType: IMPORTED_SITE_TYPES[fileExtension(path)],
    metadata: { cacheControl: "private, max-age=0", metadata: { subAccountId: input.subAccountId, bundleId: input.bundleId } },
  });
  return { path, size: bytes.length };
}

async function readText(subAccountId: string, bundleId: string, path: string): Promise<string> {
  const [buf] = await bucket().file(objectKey(subAccountId, bundleId, path)).download();
  return buf.toString("utf8");
}

export interface FinishedSite {
  ref: ImportedSiteRef;
  /** Relative / http references that don't resolve to an uploaded file. */
  missing: string[];
  /** `data-magnetix-form` ids that aren't Magnetix forms of this workspace (not connected). */
  invalidForms: string[];
  entryHtml: string;
}

/** Finishes an upload: finds the entry page, checks references, connected forms. Idempotent. */
export async function finishSiteBundle(input: { subAccountId: string; uid: string; bundleId: string }): Promise<FinishedSite> {
  const { ref, doc } = await loadOwned(input.subAccountId, input.bundleId);
  if (doc.createdByUid !== input.uid && doc.status === "uploading") throw new ImportedSiteError("Upload not found.", 404);
  const paths = doc.files.map((f) => f.path);
  const entry = doc.entry ?? pickEntry(paths);
  if (!entry) throw new ImportedSiteError("No index.html found. Include the page's index.html at the top level of the upload.");
  const texts: Record<string, string> = {};
  let budget = 6_000_000;
  for (const f of doc.files) {
    if (!(isHtmlPath(f.path) || fileExtension(f.path) === "css") || f.size > budget) continue;
    budget -= f.size;
    texts[f.path] = await readText(input.subAccountId, input.bundleId, f.path);
  }
  const entryHtml = texts[entry] ?? (await readText(input.subAccountId, input.bundleId, entry));
  const htmlAll = Object.entries(texts).filter(([p]) => isHtmlPath(p)).map(([, t]) => t).join("\n");
  const scripts = (htmlAll.match(/<script\b/gi) ?? []).length + doc.files.filter((f) => /\.(m?js)$/i.test(f.path)).length;
  const requested = connectedFormIds(htmlAll);
  const forms: string[] = [];
  const invalidForms: string[] = [];
  for (const id of requested) {
    const form = await getAdminDb().doc(`forms/${id}`).get();
    if (form.exists && form.get("subAccountId") === input.subAccountId) forms.push(id);
    else invalidForms.push(id);
  }
  const missing = findUnresolvedSiteRefs(texts, paths);
  if (doc.status !== "complete") await ref.update({ status: "complete", entry, scripts, forms, completedAt: Date.now() });
  return {
    ref: { bundleId: input.bundleId, entry, fileCount: doc.files.length, totalBytes: doc.totalBytes, scripts, forms },
    missing,
    invalidForms,
    entryHtml,
  };
}

/** A finished bundle of this workspace (for page creation / edits). */
export async function getFinishedSite(subAccountId: string, bundleId: string): Promise<FinishedSite> {
  const { doc } = await loadOwned(subAccountId, bundleId);
  if (doc.status !== "complete" || !doc.entry) throw new ImportedSiteError("That website upload isn't finished.", 409);
  return finishSiteBundle({ subAccountId, uid: doc.createdByUid, bundleId });
}

/** One pasted HTML page → a one-file bundle (so its scripts can run in isolation). */
export async function createSiteFromHtml(input: { subAccountId: string; uid: string; html: string }): Promise<FinishedSite> {
  const { bundleId } = await startSiteBundle(input);
  await addSiteFile({ ...input, bundleId, path: "index.html", base64: Buffer.from(input.html, "utf8").toString("base64") });
  return finishSiteBundle({ ...input, bundleId });
}

/**
 * Edit the entry HTML of an imported website: a NEW bundle with the other
 * files copied server-side and the entry replaced (the old bundle stays, so
 * Version History can restore it).
 */
export async function editSiteEntry(input: { subAccountId: string; uid: string; bundleId: string; html: unknown }): Promise<FinishedSite> {
  if (typeof input.html !== "string" || !input.html.trim()) throw new ImportedSiteError("The page's HTML can't be empty.");
  const html = input.html;
  if (Buffer.byteLength(html) > IMPORTED_SITE_LIMITS.fileBytes) throw new ImportedSiteError("That HTML is too large.");
  const { doc } = await loadOwned(input.subAccountId, input.bundleId);
  if (doc.status !== "complete" || !doc.entry) throw new ImportedSiteError("That website upload isn't finished.", 409);
  const { bundleId: next } = await startSiteBundle(input);
  const nextRef = bundles().doc(next);
  const files: BundleFile[] = [];
  let total = 0;
  for (const f of doc.files) {
    if (f.path === doc.entry) continue;
    await bucket().file(objectKey(input.subAccountId, input.bundleId, f.path)).copy(bucket().file(objectKey(input.subAccountId, next, f.path)));
    files.push(f);
    total += f.size;
  }
  const bytes = Buffer.from(html, "utf8");
  if (total + bytes.length > IMPORTED_SITE_LIMITS.totalBytes) throw new ImportedSiteError("The website is too large.");
  await bucket().file(objectKey(input.subAccountId, next, doc.entry)).save(bytes, { resumable: false, contentType: IMPORTED_SITE_TYPES[fileExtension(doc.entry)] });
  await nextRef.update({ files: [...files, { path: doc.entry, size: bytes.length }], totalBytes: total + bytes.length, entry: doc.entry });
  return finishSiteBundle({ subAccountId: input.subAccountId, uid: input.uid, bundleId: next });
}

/* ------------------------------ Serving ------------------------------ */

const serveCache = new Map<string, { at: number; doc: BundleDoc | null }>();

/** A file of a FINISHED bundle, or null. Only files listed on the record are ever read. */
export async function readServableSiteFile(bundleId: string, path: string): Promise<{ bytes: Buffer; contentType: string; entry: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(bundleId)) return null;
  const norm = normalizeSitePath(path);
  if (!norm) return null;
  let cached = serveCache.get(bundleId);
  if (!cached || Date.now() - cached.at > 60_000) {
    const snap = await bundles().doc(bundleId).get();
    cached = { at: Date.now(), doc: (snap.data() as BundleDoc | undefined) ?? null };
    serveCache.set(bundleId, cached);
    if (serveCache.size > 500) serveCache.delete(serveCache.keys().next().value as string);
  }
  const doc = cached.doc;
  if (!doc || doc.status !== "complete") return null;
  const file = doc.files.find((f) => f.path === norm) ?? doc.files.find((f) => f.path === `${norm}/index.html`);
  if (!file) return null;
  const [bytes] = await bucket().file(objectKey(doc.subAccountId, bundleId, file.path)).download();
  return { bytes, contentType: IMPORTED_SITE_TYPES[fileExtension(file.path)] ?? "application/octet-stream", entry: isHtmlPath(file.path) };
}
