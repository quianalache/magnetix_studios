import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Goal, MoneyEntry, PagePerformance, SocialPlatform } from "@/types/growth";
import type { TenantScope } from "@/types";

/** Live reads only, same convention as lib/firestore/projects.ts — every write goes through /api/sub-accounts/[id]/growth/*. */

export function subscribeToSocialPlatforms(
  scope: TenantScope,
  callback: (platforms: SocialPlatform[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "socialPlatforms"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SocialPlatform, "id">) }))),
    (err) => onError?.(err),
  );
}

export function subscribeToMoneyEntries(
  scope: TenantScope,
  callback: (entries: MoneyEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "moneyEntries"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MoneyEntry, "id">) }));
      entries.sort((a, b) => toMillis(b.date) - toMillis(a.date));
      callback(entries);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToGoals(
  scope: TenantScope,
  callback: (goals: Goal[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "goals"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Goal, "id">) }))),
    (err) => onError?.(err),
  );
}

export function subscribeToPagePerformance(
  scope: TenantScope,
  callback: (pages: PagePerformance[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "pagePerformance"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PagePerformance, "id">) }))),
    (err) => onError?.(err),
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
