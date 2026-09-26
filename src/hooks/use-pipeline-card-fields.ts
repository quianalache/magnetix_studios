"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  cleanCardFields,
  DEFAULT_CARD_FIELDS,
  type CardFieldKey,
} from "@/types/pipeline-cards";

/**
 * Customize Cards preferences — per user, per pipeline. Same convention as
 * the Contacts table columns (`use-contact-table-columns.ts`): the
 * self-scoped `users/{uid}/settings/{doc}` rule, doc `pipelineCards` →
 * `{ fieldsByPipeline: { ["{saId}:{pipelineId}"]: CardFieldKey[] } }`,
 * mirrored to localStorage so cards render right on the next visit before
 * Firestore answers.
 */
export function usePipelineCardFields(
  uid: string | null | undefined,
  subAccountId: string,
  pipelineId: string,
): { fields: CardFieldKey[]; setFields: (next: CardFieldKey[]) => void; reset: () => void } {
  const key = `${subAccountId}:${pipelineId}`;
  const localKey = `ls:pipeline-cards:${key}`;
  const [fields, setFieldsState] = useState<CardFieldKey[]>(DEFAULT_CARD_FIELDS);

  useEffect(() => {
    setFieldsState(DEFAULT_CARD_FIELDS);
    try {
      const cached = cleanCardFields(JSON.parse(window.localStorage.getItem(localKey) ?? "null"));
      if (cached) setFieldsState(cached);
    } catch {
      // storage unavailable — defaults
    }
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(getFirebaseDb(), "users", uid, "settings", "pipelineCards"))
      .then((snap) => {
        const saved = cleanCardFields(snap.data()?.fieldsByPipeline?.[key]);
        if (!cancelled && saved) {
          setFieldsState(saved);
          try {
            window.localStorage.setItem(localKey, JSON.stringify(saved));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Offline / rules hiccup — keep the cached or default fields.
      });
    return () => {
      cancelled = true;
    };
  }, [uid, key, localKey]);

  const persist = useCallback(
    (next: CardFieldKey[]) => {
      setFieldsState(next);
      try {
        window.localStorage.setItem(localKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      if (!uid) return;
      void setDoc(
        doc(getFirebaseDb(), "users", uid, "settings", "pipelineCards"),
        { fieldsByPipeline: { [key]: next } },
        { merge: true },
      ).catch(() => {
        // Non-fatal: the local copy still applies on this device.
      });
    },
    [uid, key, localKey],
  );

  return { fields, setFields: persist, reset: () => persist(DEFAULT_CARD_FIELDS) };
}
