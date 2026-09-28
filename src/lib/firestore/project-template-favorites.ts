import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * Per-user template favorites (Projects redesign, Phase 1).
 *
 * Momentum OS kept `is_favorite` per user. Magnetix templates are shared by
 * the whole sub-account team, so a favorite must not be written onto the
 * template itself (that would change it for everyone and would touch the
 * existing `projectTemplates` records). Instead each user keeps their own
 * list in `users/{uid}/settings/projectTemplateFavorites`, keyed by
 * sub-account. The existing self-scoped `users/{uid}/settings/{id}` rule
 * already covers this doc — no rules change. It only ever holds template
 * keys (`sys_*` or `ws:<id>`), never tenant data.
 */

const SETTING_ID = "projectTemplateFavorites";

function favoritesRef(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "settings", SETTING_ID);
}

export function subscribeToTemplateFavorites(
  uid: string,
  subAccountId: string,
  callback: (keys: Set<string>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    favoritesRef(uid),
    (snap) => {
      const bySub = (snap.data()?.bySubAccount ?? {}) as Record<
        string,
        unknown
      >;
      const list = bySub[subAccountId];
      callback(
        new Set(
          Array.isArray(list)
            ? list.filter((v): v is string => typeof v === "string")
            : []
        )
      );
    },
    (err) => onError?.(err)
  );
}

export async function setTemplateFavorite(
  uid: string,
  subAccountId: string,
  templateKey: string,
  favorite: boolean
): Promise<void> {
  await setDoc(
    favoritesRef(uid),
    {
      bySubAccount: {
        [subAccountId]: favorite
          ? arrayUnion(templateKey)
          : arrayRemove(templateKey),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
