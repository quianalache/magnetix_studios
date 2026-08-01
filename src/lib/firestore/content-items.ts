import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { emptyContentItem, type ContentItemDoc } from "@/types/content-library";
import type { TenantScope } from "@/types";

const CONTENT_ITEMS = "contentItems";

export function subscribeToContentItems(
  scope: TenantScope,
  callback: (items: ContentItemDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), CONTENT_ITEMS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<ContentItemDoc, "id">) }),
      );
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (err) => onError?.(err),
  );
}

export async function createContentItem(
  scope: TenantScope,
  createdByUid: string,
  input: Partial<ReturnType<typeof emptyContentItem>> & {
    title: string;
    publishDate?: Date | null;
    deadline?: Date | null;
  },
): Promise<string> {
  const defaults = emptyContentItem();
  const { publishDate, deadline, ...rest } = input;
  const ref = await addDoc(collection(getFirebaseDb(), CONTENT_ITEMS), {
    ...defaults,
    ...rest,
    publishDate: publishDate ?? null,
    deadline: deadline ?? null,
    linkedProjectId: null,
    linkedSocialPostId: null,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateContentItem(
  id: string,
  data: Partial<
    Omit<
      ContentItemDoc,
      "id" | "agencyId" | "subAccountId" | "createdByUid" | "createdAt" | "publishDate" | "deadline"
    >
  > & { publishDate?: Date | null; deadline?: Date | null },
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), CONTENT_ITEMS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteContentItem(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), CONTENT_ITEMS, id));
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
