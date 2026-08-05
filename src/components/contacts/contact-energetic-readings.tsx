"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { subscribeToEnergeticReadingsForContact } from "@/lib/firestore/energetic-decoder-readings";
import type { Contact } from "@/types/contacts";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/** Every Gene Keys / Human Design / astrology reading generated for this contact. */
export function ContactEnergeticReadings({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeToEnergeticReadingsForContact(contact.id, (list) => {
      setReadings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [contact.id, user]);

  // Nothing saved and we're done loading — skip the card, same as
  // Submitted Forms, rather than an empty-state box on every contact.
  if (!loading && readings.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Energetic Readings
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          {loading ? "…" : `${readings.length} reading${readings.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className="divide-y">
        {readings.map((r) => {
          const lifesWork = r.spheres.find((s) => s.sphere === "Life's Work");
          return (
            <div key={r.id} className="py-2 text-sm">
              <p className="font-medium">
                {r.system === "geneKeys" ? "Gene Keys" : r.system}
                {lifesWork && ` — ${lifesWork.sphere} ${lifesWork.gate}.${lifesWork.line}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.birthPlace} · born {r.birthDate}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
