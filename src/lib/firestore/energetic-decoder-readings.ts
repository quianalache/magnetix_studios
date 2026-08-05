import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/**
 * Every Energetic Decoder reading tied to ONE contact — powers the
 * "Energetic Readings" section on the contact profile. Same pattern as
 * `subscribeToFormSubmissionsForContact`, but a flat query (not
 * collectionGroup) since readings live in one top-level collection, not
 * nested under a parent doc.
 */
export function subscribeToEnergeticReadingsForContact(
  contactId: string,
  callback: (readings: EnergeticDecoderReading[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "energeticDecoderReadings"),
    where("contactId", "==", contactId),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const readings = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<EnergeticDecoderReading, "id">) }),
      );
      callback(readings);
    },
    (err) => onError?.(err),
  );
}
