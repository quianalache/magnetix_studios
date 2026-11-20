import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { TenantScope } from "@/types";
import type {
  CreatePageInput,
  PageDoc,
} from "@/types/pages-funnels";
import type { ReadingResultPageSettings } from "@/types/reading-blocks";

const PAGES = "pages";

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

/** Live list of every page owned by this sub-account, newest-edited first —
 *  powers the Pages & Funnels dashboard library. */
export function subscribeToPages(
  scope: TenantScope,
  callback: (pages: PageDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PAGES),
    where("subAccountId", "==", scope.subAccountId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const pages = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PageDoc, "id">),
      }));
      pages.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(pages);
    },
    (err) => onError?.(err)
  );
}

function sortPagesByUpdatedAt(pages: PageDoc[]): PageDoc[] {
  return [...pages].sort(
    (a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)
  );
}

/** One-shot equivalent of `subscribeToPages` — used as the resilient
 *  timeout fallback (recurring-CRM-regression fix; see
 *  `safe-subscribe.ts`'s doc comment) when the live listener doesn't
 *  deliver in time. A plain `getDocs()` read is a different, non-listener
 *  Firestore SDK code path than the corrupted watch stream, so it isn't
 *  expected to share that failure mode. */
export async function getPagesOnce(scope: TenantScope): Promise<PageDoc[]> {
  const q = query(
    collection(getFirebaseDb(), PAGES),
    where("subAccountId", "==", scope.subAccountId)
  );
  const snap = await getDocs(q);
  const pages = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PageDoc, "id">),
  }));
  return sortPagesByUpdatedAt(pages);
}

export function subscribeToPage(
  id: string,
  callback: (page: PageDoc | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), PAGES, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) });
    },
    (err) => onError?.(err)
  );
}

export async function getPage(id: string): Promise<PageDoc | null> {
  const snap = await getDoc(doc(getFirebaseDb(), PAGES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) };
}

/**
 * Create Page — done on the server since the 2026-11-16 security hardening
 * (the Firestore rules no longer let the browser create or update pages).
 * Signature kept for existing callers; the workspace's agency, the author and
 * the Reading Result starter layout are set server-side.
 */
export async function createPage(
  scope: TenantScope,
  _createdByUid: string,
  input: CreatePageInput
): Promise<string> {
  const json = await pageSettingsRequest(
    { action: "create", subAccountId: scope.subAccountId, name: input.name, pageType: input.pageType, goal: input.goal, ...(input.importHtml !== undefined ? { importHtml: input.importHtml } : {}), ...(input.importSiteBundleId !== undefined ? { importSiteBundleId: input.importSiteBundleId } : {}) },
    "Couldn't create the page."
  );
  if (!json.pageId) throw new Error("Couldn't create the page.");
  return json.pageId;
}

/** Reading Result Page defaults — Chart Design + builder sample (2026-10-21). Server-side since 2026-11-16. */
export async function updateReadingResultSettings(id: string, settings: ReadingResultPageSettings): Promise<void> {
  await pageSettingsRequest(
    { action: "readingResult", pageId: id, settings: { chartDesignSetId: settings.chartDesignSetId ?? null, sample: settings.sample } },
    "Couldn't save Reading settings."
  );
}

async function pageSettingsRequest(body: Record<string, unknown>, fallback: string): Promise<{ pageId?: string }> {
  const res = await fetch("/api/pages-funnels/puck/page-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { pageId?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? fallback);
  return json;
}

/**
 * Duplicate a page (pre-Funnel safety, 2026-11-05): done on the server, which
 * checks the workspace and copies the current draft, draft Popups and Page
 * Settings into a new Draft page (see `duplicatePuckPage`). Signature kept so
 * existing callers don't change; `scope` / `createdByUid` are re-derived on
 * the server from the session.
 */
export async function duplicatePage(
  _scope: TenantScope,
  _createdByUid: string,
  source: PageDoc
): Promise<string> {
  const res = await fetch("/api/pages-funnels/puck/page-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId: source.id, action: "duplicate" }),
  });
  const json = (await res.json().catch(() => ({}))) as { pageId?: string; error?: string };
  if (!res.ok || !json.pageId) throw new Error(json.error ?? "Couldn't duplicate page.");
  return json.pageId;
}

/**
 * Delete a page through the server (2026-11-17), which also removes the page's
 * own Version History and analytics rollups — a browser delete left those
 * subcollections behind. Workspace admin / agency owner only.
 */
export async function deletePage(id: string): Promise<void> {
  const res = await fetch("/api/pages-funnels/puck/page-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId: id, action: "delete" }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Couldn't delete the page.");
  }
}
