import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { TenantScope } from "@/types/tenancy";

const ATTRIBUTION_VISITS = "attributionVisits";

/** Client-side shape of an `attributionVisits/{id}` rollup doc — mirrors
 *  `AttributionVisitDoc` written server-side by `src/lib/attribution-visits.ts`. */
export interface AttributionVisitRow {
  id: string;
  subAccountId: string;
  agencyId: string;
  pageType: "booking" | "offer";
  pageId: string;
  day: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerSource: string | null;
  visits: number;
  conversions: number;
}

/** Subscribes to every visit/conversion rollup bucket for a sub-account —
 *  simpler than `subscribeToContacts`/`subscribeToDeals`: no territory
 *  filter, since visit rollups aren't rep-owned. Client filters by date
 *  range, same fetch-all convention the Attribution report already uses
 *  for contacts/deals. */
export function subscribeToAttributionVisits(
  scope: TenantScope,
  callback: (rows: AttributionVisitRow[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), ATTRIBUTION_VISITS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<AttributionVisitRow, "id">) }),
      );
      callback(rows);
    },
    (err) => onError?.(err),
  );
}
