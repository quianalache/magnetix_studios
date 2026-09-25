"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * Contacts table column preferences (Contacts redesign, 2026-09-25).
 *
 * Persisted per user, per sub-account, using the app's existing
 * user-preference convention: `users/{uid}/settings/{doc}` (self-scoped
 * read/write rule already deployed — same place the push-notification
 * prefs live), doc `contactsTable` → `{ columnsBySubAccount: { [saId]:
 * string[] } }`. localStorage mirrors it so the table renders with the
 * right columns instantly on the next visit, before Firestore answers.
 */

export const DEFAULT_CONTACT_COLUMNS = [
  "email",
  "phone",
  "company",
  "tags",
  "source",
  "createdAt",
];

const LOCAL_KEY = (saId: string) => `ls:contacts-columns:${saId}`;

export function useContactTableColumns(
  uid: string | null | undefined,
  subAccountId: string,
): {
  columns: string[];
  setColumns: (next: string[]) => void;
  resetColumns: () => void;
} {
  const [columns, setColumnsState] = useState<string[]>(DEFAULT_CONTACT_COLUMNS);

  useEffect(() => {
    if (!subAccountId) return;
    try {
      const cached = window.localStorage.getItem(LOCAL_KEY(subAccountId));
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (Array.isArray(parsed)) setColumnsState(parsed.filter((c) => typeof c === "string"));
      }
    } catch {
      // storage unavailable — defaults
    }
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(getFirebaseDb(), "users", uid, "settings", "contactsTable"))
      .then((snap) => {
        const saved = snap.data()?.columnsBySubAccount?.[subAccountId];
        if (!cancelled && Array.isArray(saved)) {
          const clean = saved.filter((c: unknown): c is string => typeof c === "string");
          setColumnsState(clean);
          try {
            window.localStorage.setItem(LOCAL_KEY(subAccountId), JSON.stringify(clean));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Offline / rules hiccup — keep the cached or default columns.
      });
    return () => {
      cancelled = true;
    };
  }, [uid, subAccountId]);

  const persist = useCallback(
    (next: string[]) => {
      setColumnsState(next);
      try {
        window.localStorage.setItem(LOCAL_KEY(subAccountId), JSON.stringify(next));
      } catch {
        // ignore
      }
      if (!uid) return;
      void setDoc(
        doc(getFirebaseDb(), "users", uid, "settings", "contactsTable"),
        { columnsBySubAccount: { [subAccountId]: next } },
        { merge: true },
      ).catch(() => {
        // Non-fatal: the local copy still applies on this device.
      });
    },
    [uid, subAccountId],
  );

  return {
    columns,
    setColumns: persist,
    resetColumns: () => persist(DEFAULT_CONTACT_COLUMNS),
  };
}
