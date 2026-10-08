import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildDefaults, type VariableCategory } from "@/lib/server/energetic-decoder-chart-content-service";
import { DEFAULT_GATE_CONTENT } from "@/lib/energetics/gate-content-defaults";
import {
  CONTENT_CATEGORIES,
  CONTENT_SET_STATUSES,
  DEFAULT_CONTENT_SET_ID,
  DEFAULT_CONTENT_SET_NAME,
  buildContentSetExport,
  categorySchema,
  contentEntryId,
  entryState,
  parseContentEntryId,
  parseContentSetImport,
  validateContentSetMeta,
  validateEntryInput,
  type ContentCatalogEntry,
  type ContentEntryState,
  type ContentEntryValues,
  type ContentSetExport,
  type ContentSetStatus,
  type ContentSystem,
  type ImportPreview,
} from "@/lib/energetic-decoder/content-sets";

/**
 * Content Sets (2026-10-07) — server side of Energetic Decoder → Content.
 *
 * Default is VIRTUAL: it is read live from exactly the places readings use
 * today (shipped defaults + `energeticDecoderChartContent` +
 * `energeticDecoderGateContent` overrides + the platform Variable cache),
 * and editing it writes those same override docs. Nothing is copied or
 * migrated, so existing readings, generated reports, Report Designs and the
 * reading pipeline behave exactly as before.
 *
 * Custom sets are independent copies in `energeticDecoderContentSets/{id}`
 * with one `entries/{entryId}` doc per written entry. Server-only
 * collection (firestore.rules default-deny) — no rules deploy needed.
 */

export const CONTENT_SETS_COLLECTION = "energeticDecoderContentSets";

export class ContentSetError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Db = FirebaseFirestore.Firestore;

export interface ContentSetSummary {
  id: string;
  name: string;
  description: string;
  status: ContentSetStatus;
  isDefault: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  usageCount: number;
}

export interface ContentSetUsage {
  /** Only real references — Report Designs today. */
  reportDesigns: { id: string; title: string; updatedAt: string | null }[];
  /** True for Default: designs that don't pick a set use it. */
  implicit: boolean;
}

export interface ContentSetDetail extends ContentSetSummary {
  catalog: ContentCatalogEntry[];
  values: Record<string, ContentEntryValues>;
  /** The Default set's current text — the editing reference only. */
  defaults: Record<string, ContentEntryValues>;
  states: Record<string, ContentEntryState>;
}

interface SetDoc {
  subAccountId: string;
  agencyId: string | null;
  name: string;
  description: string;
  status: ContentSetStatus;
  scope: "sub_account";
  origin: { kind: "default" | "blank" | "copy" | "import"; sourceSetId: string | null };
  createdAt: unknown;
  updatedAt: unknown;
  createdByUid: string;
  updatedByUid: string;
  updatedByEmail: string | null;
}

function toIso(v: unknown): string | null {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return typeof v === "string" ? v : null;
}

// ── The Default set (virtual) ───────────────────────────────────────────

interface DefaultLibrary {
  catalog: ContentCatalogEntry[];
  /** Current Default text (shipped default merged with the workspace's edits). */
  values: Map<string, ContentEntryValues>;
  /** Entries the workspace has rewritten. */
  customized: Set<string>;
  updatedAt: string | null;
}

const CATEGORY_ORDER = new Map(CONTENT_CATEGORIES.map((c, i) => [c.id, i]));

export async function loadDefaultLibrary(subAccountId: string, db: Db = getAdminDb()): Promise<DefaultLibrary> {
  const [varSnap, chartSnap, gateSnap] = await Promise.all([
    db.collection("bodygraphVariableDefaults").get(),
    db.collection(`subAccounts/${subAccountId}/energeticDecoderChartContent`).get(),
    db.collection(`subAccounts/${subAccountId}/energeticDecoderGateContent`).get(),
  ]);
  const varDefaults = new Map<string, { value: string; category: VariableCategory; description: string }>();
  for (const d of varSnap.docs) varDefaults.set(d.id, d.data() as { value: string; category: VariableCategory; description: string });

  let latest: string | null = null;
  const bump = (v: unknown) => {
    const t = toIso(v);
    if (t && (!latest || t > latest)) latest = t;
  };

  const chartOverrides = new Map<string, Record<string, string>>();
  for (const d of chartSnap.docs) {
    const { updatedAt, ...fields } = d.data();
    bump(updatedAt);
    chartOverrides.set(d.id, fields as Record<string, string>);
  }
  const gateOverrides = new Map<string, Record<string, string>>();
  for (const d of gateSnap.docs) {
    const data = d.data();
    bump(data.updatedAt);
    gateOverrides.set(contentEntryId("freq", "gate", d.id), { showsUp: data.showsUp ?? "", giftText: data.giftText ?? "" });
  }

  const catalog: ContentCatalogEntry[] = [];
  const values = new Map<string, ContentEntryValues>();
  const customized = new Set<string>();

  for (const d of buildDefaults(varDefaults)) {
    const id = contentEntryId(d.system as ContentSystem, d.category, d.key);
    const schema = categorySchema(`${d.system}:${d.category}`);
    if (!schema) continue; // e.g. the retired "skill" category — left untouched, just not offered
    catalog.push({ id, system: d.system as ContentSystem, category: d.category, key: d.key, canonicalLabel: d.label });
    const override = chartOverrides.get(id);
    if (override) customized.add(id);
    values.set(id, { fields: pick(schema.fields.map((f) => f.key), { ...d.fields, ...(override ?? {}) }) });
  }
  for (const g of DEFAULT_GATE_CONTENT) {
    const id = contentEntryId("freq", "gate", String(g.gate));
    catalog.push({ id, system: "freq", category: "gate", key: String(g.gate), canonicalLabel: `Gate ${g.gate}` });
    const override = gateOverrides.get(id);
    if (override) customized.add(id);
    values.set(id, { fields: override ?? { showsUp: g.showsUp, giftText: g.giftText } });
  }

  catalog.sort((a, b) => {
    const ca = CATEGORY_ORDER.get(`${a.system}:${a.category}`)! - CATEGORY_ORDER.get(`${b.system}:${b.category}`)!;
    if (ca) return ca;
    const na = Number(a.key), nb = Number(b.key);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return 0; // keep shipped order (Types, Authorities, Centers…) — it's the canonical order
  });
  return { catalog, values, customized, updatedAt: latest };
}

function pick(keys: string[], obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = obj[k] ?? "";
  return out;
}

// ── Usage (real references only) ────────────────────────────────────────

async function designsBySet(subAccountId: string, db: Db): Promise<Map<string, ContentSetUsage["reportDesigns"]>> {
  const snap = await db.collection("reportDesigns").where("subAccountId", "==", subAccountId).select("title", "contentSetId", "updatedAt").get();
  const map = new Map<string, ContentSetUsage["reportDesigns"]>();
  for (const d of snap.docs) {
    const raw = d.get("contentSetId");
    const setId = typeof raw === "string" && raw ? raw : DEFAULT_CONTENT_SET_ID;
    const list = map.get(setId) ?? [];
    list.push({ id: d.id, title: (d.get("title") as string) || "Untitled report design", updatedAt: toIso(d.get("updatedAt")) });
    map.set(setId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title));
  return map;
}

export async function getContentSetUsage(subAccountId: string, setId: string, db: Db = getAdminDb()): Promise<ContentSetUsage> {
  if (setId !== DEFAULT_CONTENT_SET_ID) await requireSet(subAccountId, setId, db);
  const map = await designsBySet(subAccountId, db);
  return { reportDesigns: map.get(setId) ?? [], implicit: setId === DEFAULT_CONTENT_SET_ID };
}

// ── Sets ────────────────────────────────────────────────────────────────

async function requireSet(subAccountId: string, setId: string, db: Db): Promise<{ ref: FirebaseFirestore.DocumentReference; data: SetDoc }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(setId)) throw new ContentSetError("Content set not found.", 404);
  const ref = db.collection(CONTENT_SETS_COLLECTION).doc(setId);
  const snap = await ref.get();
  // A foreign or missing id reads as 404 — never reveal another workspace's set.
  if (!snap.exists || snap.get("subAccountId") !== subAccountId) throw new ContentSetError("Content set not found.", 404);
  return { ref, data: snap.data() as SetDoc };
}

function summarize(id: string, data: SetDoc, usageCount: number): ContentSetSummary {
  return {
    id,
    name: data.name,
    description: data.description ?? "",
    status: data.status === "draft" ? "draft" : "active",
    isDefault: false,
    updatedAt: toIso(data.updatedAt),
    updatedByEmail: data.updatedByEmail ?? null,
    usageCount,
  };
}

export async function listContentSets(subAccountId: string, db: Db = getAdminDb()): Promise<ContentSetSummary[]> {
  const [snap, usage, def] = await Promise.all([
    db.collection(CONTENT_SETS_COLLECTION).where("subAccountId", "==", subAccountId).get(),
    designsBySet(subAccountId, db),
    loadDefaultLibrary(subAccountId, db),
  ]);
  const custom = snap.docs
    .map((d) => summarize(d.id, d.data() as SetDoc, usage.get(d.id)?.length ?? 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    {
      id: DEFAULT_CONTENT_SET_ID,
      name: DEFAULT_CONTENT_SET_NAME,
      description: "The built-in Magnetix content, including your workspace’s edits.",
      status: "active",
      isDefault: true,
      updatedAt: def.updatedAt,
      updatedByEmail: null,
      usageCount: usage.get(DEFAULT_CONTENT_SET_ID)?.length ?? 0,
    },
    ...custom,
  ];
}

async function readEntries(ref: FirebaseFirestore.DocumentReference): Promise<Map<string, ContentEntryValues>> {
  const snap = await ref.collection("entries").get();
  const map = new Map<string, ContentEntryValues>();
  for (const d of snap.docs) {
    const data = d.data();
    map.set(d.id, { label: typeof data.label === "string" ? data.label : null, fields: (data.fields ?? {}) as Record<string, string> });
  }
  return map;
}

export async function getContentSet(subAccountId: string, setId: string, db: Db = getAdminDb()): Promise<ContentSetDetail> {
  const def = await loadDefaultLibrary(subAccountId, db);
  const defaults = Object.fromEntries(def.values);
  const usage = await designsBySet(subAccountId, db);
  const isDefault = setId === DEFAULT_CONTENT_SET_ID;

  let summary: ContentSetSummary;
  let values: Map<string, ContentEntryValues>;
  if (isDefault) {
    summary = (await listContentSets(subAccountId, db))[0];
    values = def.values;
  } else {
    const { ref, data } = await requireSet(subAccountId, setId, db);
    summary = summarize(setId, data, usage.get(setId)?.length ?? 0);
    values = await readEntries(ref);
  }

  const states: Record<string, ContentEntryState> = {};
  for (const e of def.catalog) {
    const schema = categorySchema(`${e.system}:${e.category}`)!;
    states[e.id] = entryState(schema, values.get(e.id), def.values.get(e.id), { isDefaultSet: isDefault, defaultCustomized: def.customized.has(e.id) });
  }
  return { ...summary, catalog: def.catalog, values: Object.fromEntries(values), defaults, states };
}

async function assertNameFree(subAccountId: string, name: string, db: Db, exceptId?: string) {
  const snap = await db.collection(CONTENT_SETS_COLLECTION).where("subAccountId", "==", subAccountId).select("name").get();
  const taken = snap.docs.some((d) => d.id !== exceptId && String(d.get("name") ?? "").trim().toLowerCase() === name.toLowerCase());
  if (taken) throw new ContentSetError(`A content set named “${name}” already exists.`, 409);
}

async function uniqueCopyName(subAccountId: string, base: string, db: Db): Promise<string> {
  const snap = await db.collection(CONTENT_SETS_COLLECTION).where("subAccountId", "==", subAccountId).select("name").get();
  const names = new Set(snap.docs.map((d) => String(d.get("name") ?? "").toLowerCase()));
  for (let i = 1; i < 100; i++) {
    const candidate = (i === 1 ? `${base} (copy)` : `${base} (copy ${i})`).slice(0, 80);
    if (!names.has(candidate.toLowerCase()) && candidate.toLowerCase() !== "default") return candidate;
  }
  throw new ContentSetError("Couldn’t find a free name for the copy.", 409);
}

async function writeEntries(ref: FirebaseFirestore.DocumentReference, entries: Map<string, ContentEntryValues>, db: Db) {
  const list = [...entries.entries()].filter(([, v]) => Object.values(v.fields ?? {}).some((t) => t?.trim()) || v.label?.trim());
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const [id, v] of list.slice(i, i + 400)) {
      batch.set(ref.collection("entries").doc(id), { label: v.label?.trim() || null, fields: v.fields, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
}

export interface Caller {
  uid: string;
  email: string;
  agencyId: string | null;
}

/**
 * Creates a NEW Draft set. `startFrom` = "default" (independent copy of the
 * Default text), "blank" (nothing written), or another set's id (independent
 * copy). Copies never stay linked: later Default edits don't change them.
 */
export async function createContentSet(
  subAccountId: string,
  caller: Caller,
  input: { name?: unknown; description?: unknown; startFrom?: unknown },
  db: Db = getAdminDb(),
  seed?: { entries: Map<string, ContentEntryValues>; kind: "import" },
): Promise<ContentSetSummary> {
  const meta = validateContentSetMeta(input);
  if (!meta.ok) throw new ContentSetError(meta.error, 400);
  await assertNameFree(subAccountId, meta.name, db);

  let entries: Map<string, ContentEntryValues>;
  let origin: SetDoc["origin"];
  const startFrom = typeof input.startFrom === "string" ? input.startFrom : "default";
  if (seed) {
    entries = seed.entries;
    origin = { kind: "import", sourceSetId: null };
  } else if (startFrom === "blank") {
    entries = new Map();
    origin = { kind: "blank", sourceSetId: null };
  } else if (startFrom === DEFAULT_CONTENT_SET_ID) {
    entries = new Map([...(await loadDefaultLibrary(subAccountId, db)).values].map(([k, v]) => [k, { label: null, fields: { ...v.fields } }]));
    origin = { kind: "default", sourceSetId: null };
  } else {
    const src = await requireSet(subAccountId, startFrom, db);
    entries = await readEntries(src.ref);
    origin = { kind: "copy", sourceSetId: startFrom };
  }

  const ref = db.collection(CONTENT_SETS_COLLECTION).doc();
  const doc: SetDoc = {
    subAccountId,
    agencyId: caller.agencyId,
    name: meta.name,
    description: meta.description,
    status: "draft",
    scope: "sub_account",
    origin,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUid: caller.uid,
    updatedByUid: caller.uid,
    updatedByEmail: caller.email || null,
  };
  await ref.set(doc);
  await writeEntries(ref, entries, db);
  return { id: ref.id, name: meta.name, description: meta.description, status: "draft", isDefault: false, updatedAt: new Date().toISOString(), updatedByEmail: caller.email || null, usageCount: 0 };
}

export async function duplicateContentSet(subAccountId: string, caller: Caller, setId: string, db: Db = getAdminDb()): Promise<ContentSetSummary> {
  const base = setId === DEFAULT_CONTENT_SET_ID ? DEFAULT_CONTENT_SET_NAME : (await requireSet(subAccountId, setId, db)).data.name;
  const name = await uniqueCopyName(subAccountId, base, db);
  const src = setId === DEFAULT_CONTENT_SET_ID ? null : await requireSet(subAccountId, setId, db);
  return createContentSet(subAccountId, caller, { name, description: src?.data.description ?? "", startFrom: setId }, db);
}

export async function updateContentSetMeta(
  subAccountId: string,
  caller: Caller,
  setId: string,
  input: { name?: unknown; description?: unknown; status?: unknown },
  db: Db = getAdminDb(),
): Promise<void> {
  if (setId === DEFAULT_CONTENT_SET_ID) throw new ContentSetError("The Default set can’t be renamed or set to Draft.", 400);
  const { ref, data } = await requireSet(subAccountId, setId, db);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined || input.description !== undefined) {
    const meta = validateContentSetMeta({ name: input.name ?? data.name, description: input.description ?? data.description });
    if (!meta.ok) throw new ContentSetError(meta.error, 400);
    if (meta.name.toLowerCase() !== data.name.toLowerCase()) await assertNameFree(subAccountId, meta.name, db, setId);
    patch.name = meta.name;
    patch.description = meta.description;
  }
  if (input.status !== undefined) {
    if (!CONTENT_SET_STATUSES.includes(input.status as ContentSetStatus)) throw new ContentSetError("Status must be Active or Draft.", 400);
    patch.status = input.status;
  }
  if (Object.keys(patch).length === 0) throw new ContentSetError("Nothing to update.", 400);
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedByUid: caller.uid, updatedByEmail: caller.email || null });
}

/** Default is undeletable; a set used by any Report Design can't be deleted. */
export async function deleteContentSet(subAccountId: string, setId: string, db: Db = getAdminDb()): Promise<void> {
  if (setId === DEFAULT_CONTENT_SET_ID) throw new ContentSetError("The Default set can’t be deleted.", 400);
  const { ref } = await requireSet(subAccountId, setId, db);
  const usage = await getContentSetUsage(subAccountId, setId, db);
  if (usage.reportDesigns.length > 0) {
    throw new ContentSetError(`This set is used in ${usage.reportDesigns.length} report design${usage.reportDesigns.length === 1 ? "" : "s"}. Switch them to another set first.`, 409);
  }
  await db.recursiveDelete(ref);
}

// ── Entries ─────────────────────────────────────────────────────────────

async function knownEntry(subAccountId: string, entryId: string, db: Db) {
  const parsed = parseContentEntryId(entryId);
  const schema = parsed ? categorySchema(parsed.categoryId) : undefined;
  if (!parsed || !schema) throw new ContentSetError("Unknown content entry.", 404);
  const def = await loadDefaultLibrary(subAccountId, db);
  if (!def.catalog.some((e) => e.id === entryId)) throw new ContentSetError("Unknown content entry.", 404);
  return { parsed, schema };
}

export async function saveContentEntry(
  subAccountId: string,
  caller: Caller,
  setId: string,
  entryId: string,
  input: { label?: unknown; fields?: unknown },
  db: Db = getAdminDb(),
): Promise<void> {
  const { parsed, schema } = await knownEntry(subAccountId, entryId, db);
  const isDefault = setId === DEFAULT_CONTENT_SET_ID;
  const v = validateEntryInput(schema, input, {
    requireAll: isDefault,
    allowLabel: !isDefault && schema.allowCustomLabel !== false,
    labelError: !isDefault && schema.allowCustomLabel === false ? "Custom terms aren’t available for this category." : undefined,
  });
  if (!v.ok) throw new ContentSetError(v.error, 400);

  if (isDefault) {
    // Same docs the reading pipeline already reads — so the edit behaves
    // exactly like the previous Content editor's Save.
    if (parsed.system === "freq") {
      await db.doc(`subAccounts/${subAccountId}/energeticDecoderGateContent/${Number(parsed.key)}`).set(
        { showsUp: v.fields.showsUp, giftText: v.fields.giftText, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } else {
      await db.doc(`subAccounts/${subAccountId}/energeticDecoderChartContent/${entryId}`).set({ ...v.fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return;
  }

  const { ref } = await requireSet(subAccountId, setId, db);
  const empty = Object.values(v.fields).every((t) => !t) && !v.label;
  if (empty) await ref.collection("entries").doc(entryId).delete();
  else await ref.collection("entries").doc(entryId).set({ label: v.label, fields: v.fields, updatedAt: FieldValue.serverTimestamp() });
  await ref.update({ updatedAt: FieldValue.serverTimestamp(), updatedByUid: caller.uid, updatedByEmail: caller.email || null });
}

/** Default: back to the shipped Magnetix text. Custom: clears the entry (blank stays blank — no fallback). */
export async function resetContentEntry(subAccountId: string, caller: Caller, setId: string, entryId: string, db: Db = getAdminDb()): Promise<void> {
  const { parsed } = await knownEntry(subAccountId, entryId, db);
  if (setId === DEFAULT_CONTENT_SET_ID) {
    if (parsed.system === "freq") await db.doc(`subAccounts/${subAccountId}/energeticDecoderGateContent/${Number(parsed.key)}`).delete();
    else await db.doc(`subAccounts/${subAccountId}/energeticDecoderChartContent/${entryId}`).delete();
    return;
  }
  const { ref } = await requireSet(subAccountId, setId, db);
  await ref.collection("entries").doc(entryId).delete();
  await ref.update({ updatedAt: FieldValue.serverTimestamp(), updatedByUid: caller.uid, updatedByEmail: caller.email || null });
}

// ── Export / import ─────────────────────────────────────────────────────

export async function exportContentSet(subAccountId: string, setId: string, db: Db = getAdminDb()): Promise<ContentSetExport> {
  const detail = await getContentSet(subAccountId, setId, db);
  return buildContentSetExport({ name: detail.name, description: detail.description }, new Map(Object.entries(detail.values)));
}

/** Validates a file; with `commit`, creates a NEW Draft set from it (never overwrites an existing set). */
export async function importContentSet(
  subAccountId: string,
  caller: Caller,
  json: unknown,
  opts: { commit: boolean; name?: string },
  db: Db = getAdminDb(),
): Promise<{ preview: Omit<ImportPreview, "entries">; created?: ContentSetSummary }> {
  const def = await loadDefaultLibrary(subAccountId, db);
  const preview = parseContentSetImport(json, new Set(def.catalog.map((e) => e.id)));
  const { entries, ...rest } = preview;
  if (!opts.commit) return { preview: rest };
  if (!preview.ok) throw new ContentSetError(preview.errors[0] ?? "This file can’t be imported.", 400);
  const created = await createContentSet(
    subAccountId,
    caller,
    { name: opts.name?.trim() || preview.name, description: preview.description },
    db,
    { entries, kind: "import" },
  );
  return { preview: rest, created };
}
