"use client";

import { useEffect, useState } from "react";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { fetchPipelines } from "@/lib/pipelines/client";
import type { Contact } from "@/types/contacts";
import type { Pipeline } from "@/types/pipelines";

/**
 * Data the New/Edit deal forms need, loaded only while a form is open
 * (Multiple Pipelines, 2026-09-25): the sub-account's active pipelines,
 * and — unless the caller already has them — the contact list for the
 * contact picker. Keeps the Pipeline board from holding every contact in
 * memory just in case a form opens.
 */
export function useDealFormOptions(opts: {
  open: boolean;
  contacts?: Contact[];
}): { pipelines: Pipeline[] | null; contacts: Contact[] } {
  const { subAccountId, agencyId } = useSubAccount();
  const { ready, filter } = useEffectiveTerritoryFilter();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [loaded, setLoaded] = useState<Contact[]>([]);
  const needContacts = opts.open && !opts.contacts;

  useEffect(() => {
    if (!opts.open) return;
    let cancelled = false;
    fetchPipelines(subAccountId)
      .then((r) => !cancelled && setPipelines(r.pipelines))
      .catch(() => !cancelled && setPipelines([]));
    return () => {
      cancelled = true;
    };
  }, [opts.open, subAccountId]);

  useEffect(() => {
    if (!needContacts || !ready || !agencyId) return;
    const unsub = safeSubscribe(
      () =>
        subscribeToContacts(
          { agencyId, subAccountId },
          { territoryFilter: filter },
          setLoaded,
          (err) => console.error("[deal-form] contacts listener error", err),
        ),
      (err) => console.error("[deal-form] contacts listener error", err),
    );
    return () => unsub?.();
  }, [needContacts, ready, filter, agencyId, subAccountId]);

  return { pipelines, contacts: opts.contacts ?? loaded };
}
