import {
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { FormSubmission } from "@/types/forms";

/**
 * Every form submission tied to ONE contact, across every form — powers the
 * "Submitted Forms" section on the contact profile. A `contactId` is a
 * globally unique Firestore-generated id (never reused across sub-accounts),
 * so filtering on it alone can't leak another tenant's data even though this
 * is a collection-group query spanning all forms; the security rule on
 * `forms/{formId}/submissions/{submissionId}` still re-checks tenancy on
 * every matched document regardless.
 */
export function subscribeToFormSubmissionsForContact(
  contactId: string,
  callback: (submissions: FormSubmission[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collectionGroup(getFirebaseDb(), "submissions"),
    where("contactId", "==", contactId),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const submissions = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<FormSubmission, "id">) }),
      );
      callback(submissions);
    },
    (err) => onError?.(err),
  );
}
