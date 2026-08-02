import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { ExternalCalendarEvent } from "@/types/google-calendar";
import type { TenantScope } from "@/types";

const EXTERNAL_CALENDAR_EVENTS = "externalCalendarEvents";

/**
 * Subscribe to the CURRENT user's own pulled-in Google Calendar events for
 * this sub-account. Scoped by `uid` in addition to `subAccountId` — each
 * member only ever sees their own connected calendar's events, matching the
 * per-member connection model (see `types/google-calendar.ts`). Server-only
 * writes (the sync cron job via Admin SDK); this is read-only from the client.
 */
export function subscribeToExternalCalendarEvents(
  scope: TenantScope,
  uid: string,
  callback: (events: ExternalCalendarEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), EXTERNAL_CALENDAR_EVENTS),
    where("subAccountId", "==", scope.subAccountId),
    where("uid", "==", uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs
        .map(
          (d) =>
            ({ id: d.id, ...(d.data() as Omit<ExternalCalendarEvent, "id">) }) as ExternalCalendarEvent,
        )
        .filter((e) => e.status !== "cancelled");
      callback(events);
    },
    (err) => onError?.(err),
  );
}
