import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { TenantScope } from "@/types";
import type {
  CreatePageInput,
  PageBlock,
  PageDoc,
  PageSeo,
} from "@/types/pages-funnels";
import { DEFAULT_PAGE_SEO } from "@/types/pages-funnels";

const PAGES = "pages";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "page"
  );
}

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
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PAGES),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const pages = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<PageDoc, "id">) }),
      );
      pages.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(pages);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToPage(
  id: string,
  callback: (page: PageDoc | null) => void,
  onError?: (err: Error) => void,
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
    (err) => onError?.(err),
  );
}

export async function getPage(id: string): Promise<PageDoc | null> {
  const snap = await getDoc(doc(getFirebaseDb(), PAGES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PageDoc, "id">) };
}

export async function createPage(
  scope: TenantScope,
  createdByUid: string,
  input: CreatePageInput,
): Promise<string> {
  const ref = await addDoc(collection(getFirebaseDb(), PAGES), {
    name: input.name,
    slug: slugify(input.name),
    pageType: input.pageType,
    goal: input.goal,
    status: "draft",
    origin: input.origin,
    funnelId: null,
    blocks: input.blocks ?? [],
    seo: { ...DEFAULT_PAGE_SEO, title: input.name },
    templateId: input.templateId ?? null,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: null,
  });
  return ref.id;
}

/** Persists the full block array — the editor calls this (debounced by the
 *  caller) on every content/reorder edit while in "draft" review, and again
 *  explicitly for "Save Draft". */
export async function updatePageBlocks(
  id: string,
  blocks: PageBlock[],
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), PAGES, id), {
    blocks,
    updatedAt: serverTimestamp(),
  });
}

export async function updatePageMeta(
  id: string,
  data: Partial<Pick<PageDoc, "name" | "seo" | "funnelId">>,
): Promise<void> {
  const patch: Record<string, string | PageSeo | null> = { ...data };
  if (data.name) patch.slug = slugify(data.name);
  await updateDoc(doc(getFirebaseDb(), PAGES, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function publishPage(id: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), PAGES, id), {
    status: "published",
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function unpublishPage(id: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), PAGES, id), {
    status: "draft",
    updatedAt: serverTimestamp(),
  });
}

export async function duplicatePage(
  scope: TenantScope,
  createdByUid: string,
  source: PageDoc,
): Promise<string> {
  const ref = await addDoc(collection(getFirebaseDb(), PAGES), {
    name: `${source.name} (Copy)`,
    slug: slugify(`${source.name}-copy`),
    pageType: source.pageType,
    goal: source.goal,
    status: "draft",
    origin: source.origin,
    funnelId: null,
    blocks: source.blocks,
    seo: source.seo,
    templateId: source.templateId,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: null,
  });
  return ref.id;
}

export async function deletePage(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), PAGES, id));
}
