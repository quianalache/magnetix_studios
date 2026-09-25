"use client";

import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";

/**
 * Cheap "something new arrived" signal for the Contact profile's Activity /
 * Notes tabs (Contacts redesign, 2026-09-25): ONE listener per collection
 * on just the newest document (limit 1), instead of the old timeline's
 * listeners on the entire notes + activities history. The returned counter
 * bumps whenever the newest doc changes after the first snapshot, and the
 * tab refetches its first page from the server.
 *
 * Registration goes through `safeSubscribe` (firebase-js-sdk#9267 guard);
 * if the listener fails or stays silent, the tabs still work — they just
 * don't auto-refresh.
 */
export function useContactFeedHead(
  contactId: string,
  subcollections: ("activities" | "notes")[],
): number {
  const [version, setVersion] = useState(0);
  const seen = useRef<Map<string, string>>(new Map());
  const key = subcollections.join(",");

  useEffect(() => {
    if (!contactId) return;
    seen.current = new Map();
    const unsubs = key.split(",").map((sub) =>
      safeSubscribe(
        () =>
          onSnapshot(
            query(
              collection(getFirebaseDb(), `contacts/${contactId}/${sub}`),
              orderBy("createdAt", "desc"),
              limit(1),
            ),
            (snap) => {
              const top = snap.docs[0];
              const marker = top
                ? `${top.id}:${top.get("updatedAt")?.seconds ?? ""}`
                : "none";
              const prev = seen.current.get(sub);
              seen.current.set(sub, marker);
              if (prev !== undefined && prev !== marker) setVersion((v) => v + 1);
            },
            () => {
              // Permission / transient errors just disable auto-refresh.
            },
          ),
        () => {},
      ),
    );
    return () => unsubs.forEach((u) => u?.());
  }, [contactId, key]);

  return version;
}
