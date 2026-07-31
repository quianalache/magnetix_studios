import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { QrFolder } from "@/types/qr-codes";
import type { TenantScope } from "@/types";

const QR_FOLDERS = "qrFolders";

export function subscribeToQrFolders(
  scope: TenantScope,
  callback: (folders: QrFolder[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), QR_FOLDERS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const folders = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<QrFolder, "id">) }),
      );
      folders.sort((a, b) => a.name.localeCompare(b.name));
      callback(folders);
    },
    (err) => onError?.(err),
  );
}

export async function createQrFolder(
  scope: TenantScope,
  name: string,
): Promise<string> {
  const ref = await addDoc(collection(getFirebaseDb(), QR_FOLDERS), {
    name,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteQrFolder(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), QR_FOLDERS, id));
}
