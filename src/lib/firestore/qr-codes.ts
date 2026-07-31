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
import {
  defaultQrStyle,
  type QrCodeDoc,
  type QrCodeKind,
  type QrCodeStyle,
  type QrCodeVcard,
} from "@/types/qr-codes";
import type { TenantScope } from "@/types";

const QR_CODES = "qrCodes";

export function subscribeToQrCodes(
  scope: TenantScope,
  callback: (codes: QrCodeDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), QR_CODES),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const codes = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<QrCodeDoc, "id">) }),
      );
      codes.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(codes);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToQrCode(
  id: string,
  callback: (code: QrCodeDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), QR_CODES, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<QrCodeDoc, "id">) });
    },
    (err) => onError?.(err),
  );
}

export async function createQrCode(
  scope: TenantScope,
  createdByUid: string,
  input: {
    name: string;
    kind: QrCodeKind;
    destinationUrl?: string | null;
    vcard?: QrCodeVcard | null;
    style?: QrCodeStyle;
  },
): Promise<string> {
  const ref = await addDoc(collection(getFirebaseDb(), QR_CODES), {
    name: input.name,
    kind: input.kind,
    destinationUrl: input.destinationUrl ?? null,
    scanCount: 0,
    vcard: input.vcard ?? null,
    style: input.style ?? defaultQrStyle(),
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateQrCode(
  id: string,
  data: Partial<
    Omit<
      QrCodeDoc,
      | "id"
      | "agencyId"
      | "subAccountId"
      | "createdByUid"
      | "createdAt"
      | "scanCount"
    >
  >,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), QR_CODES, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteQrCode(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), QR_CODES, id));
}

export async function getQrCode(id: string): Promise<QrCodeDoc | null> {
  const snap = await getDoc(doc(getFirebaseDb(), QR_CODES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<QrCodeDoc, "id">) };
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
