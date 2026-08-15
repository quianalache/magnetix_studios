"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import type { Contact } from "@/types/contacts";
import type { EnergeticProfile } from "@/types/energetic-profile";

/**
 * Decision Brief Decision 9 (approved 2026-08-11, behavior/IA only — exact
 * UI still open) — the Contact page does NOT rebuild the Energetic
 * Decoder experience; it stays a relationship hub with a contextual quick
 * link into the real source record. "Contacts reference Energetic
 * Decoder records; they do not duplicate the Energetic Decoder
 * experience."
 *
 * Replaces `ContactEnergeticReadings` (removed this pass) — that card
 * queried `energeticDecoderReadings` directly from the client via
 * `onSnapshot`, was correctly wired in and querying the right
 * `contactId`, and still rendered nothing; root cause was never
 * diagnosed, and per Decision 2's redirect it was never going to be
 * patched in place. This is the actual replacement Decision 2 pointed to,
 * not a repair of the old component.
 *
 * Deliberately thin, per the approved behavior: lists each Energetic
 * Profile tied to this Contact (Decision 7 — a Contact may have more than
 * one, e.g. a parent Contact booking for their kids) with a "View Chart"
 * link. That link deep-links straight into that Profile's own row on the
 * Readings tab (`?tab=readings&profileId=`) — never the generic Energetic
 * Decoder landing page, the one explicit requirement in Decision 9.
 * Report quick-links are explicitly out of scope here (Decision 9 calls
 * them "secondary... not approved to build") — chart-only, on purpose.
 *
 * Reuses the exact `GET .../profiles?contactId=` endpoint the New Reading
 * dialog (Task 4) and the Readings tab (Task 8) already call — no new
 * server logic. Doesn't also fetch each Profile's Readings for a count —
 * the readings endpoint has no `contactId` filter, so that would mean
 * pulling the whole sub-account's reading list on every Contact page
 * load; Decision 9's approved behavior only calls for a name and a View
 * Chart link, not a reading count here.
 */
export function ContactEnergeticDecoding({ contact }: { contact: Contact }) {
  const { subAccountId, saPath } = useSubAccount();
  const [profiles, setProfiles] = useState<EnergeticProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subAccountId) return;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles?contactId=${contact.id}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; profiles?: EnergeticProfile[] }) => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [contact.id, subAccountId]);

  // No Profiles and we're done loading — skip the card entirely, same
  // convention as Submitted Forms (and the component this replaces)
  // rather than an empty-state box on every contact. Decision 9 leaves
  // the zero-Profile case genuinely open; not showing the section is the
  // established default elsewhere on this page.
  if (!loading && profiles.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Energetic Decoding
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          {loading ? "…" : `${profiles.length} profile${profiles.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className="divide-y">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{p.name}</span>
                {p.relationshipLabel && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {p.relationshipLabel}
                  </span>
                )}
              </span>
              <p className="truncate text-xs text-muted-foreground">
                {p.birthPlace} · born {p.birthDate}
              </p>
            </div>
            <Link
              href={saPath(`/energetic-decoder?tab=readings&profileId=${p.id}`)}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View Chart
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
