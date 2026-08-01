import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  emptyContentTemplate,
  SYSTEM_CONTENT_TEMPLATES,
  type ContentTemplateDoc,
} from "@/types/content-library";
import type { TenantScope } from "@/types";

const CONTENT_TEMPLATES = "contentTemplates";

export function subscribeToContentTemplates(
  scope: TenantScope,
  callback: (templates: ContentTemplateDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), CONTENT_TEMPLATES),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const templates = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<ContentTemplateDoc, "id">) }),
      );
      templates.sort((a, b) => {
        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      callback(templates);
    },
    (err) => onError?.(err),
  );
}

/** Seeds the 5 real MomentumOS system templates into a sub-account the
 *  first time its Templates tab is visited. Checks for an existing system
 *  template first so re-visiting never duplicates the seed. */
export async function ensureSystemTemplatesSeeded(scope: TenantScope): Promise<void> {
  const db = getFirebaseDb();
  const existing = await getDocs(
    query(
      collection(db, CONTENT_TEMPLATES),
      where("subAccountId", "==", scope.subAccountId),
      where("isSystem", "==", true),
    ),
  );
  if (!existing.empty) return;

  const batch = writeBatch(db);
  for (const tpl of SYSTEM_CONTENT_TEMPLATES) {
    const ref = doc(collection(db, CONTENT_TEMPLATES));
    batch.set(ref, {
      ...tpl,
      isSystem: true,
      useCount: 0,
      agencyId: scope.agencyId,
      subAccountId: scope.subAccountId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function createContentTemplate(
  scope: TenantScope,
  input: Partial<ReturnType<typeof emptyContentTemplate>> & { name: string },
): Promise<string> {
  const defaults = emptyContentTemplate();
  const ref = await addDoc(collection(getFirebaseDb(), CONTENT_TEMPLATES), {
    ...defaults,
    ...input,
    isSystem: false,
    useCount: 0,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateContentTemplate(
  id: string,
  data: Partial<
    Omit<ContentTemplateDoc, "id" | "agencyId" | "subAccountId" | "isSystem" | "createdAt">
  >,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), CONTENT_TEMPLATES, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function bumpTemplateUseCount(id: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), CONTENT_TEMPLATES, id), {
    useCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteContentTemplate(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), CONTENT_TEMPLATES, id));
}
