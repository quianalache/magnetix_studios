"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Orbit } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/system/status-pill";
import { Motif } from "@/components/brand/motif";
import type { Contact } from "@/types/contacts";

/** One linked person, as returned by GET …/energetic-decoder/contact-summary. */
interface DecoderPerson {
  kind: "profile" | "reading";
  id: string;
  name: string;
  relationshipLabel: string | null;
  latestReadingId: string | null;
  energyType: string | null;
  authority: string | null;
  hdProfile: string | null;
  sunSign: string | null;
}

/**
 * Contact profile → Energetic Decoding (Decision 9: the Contact page links
 * into the Decoder, it never rebuilds it). Wave 2 follow-up (2026-10-15):
 * the approved card now shows each linked person's real chart facts from
 * their latest reading — Type, Authority, Profile, Sun sign — and only the
 * ones that reading actually calculated (nothing derived or guessed), with a
 * "View reading" deep link. A contact with no Decoder data shows no card.
 */
export function ContactEnergeticDecoding({ contact }: { contact: Contact }) {
  const { subAccountId, saPath } = useSubAccount();
  const [people, setPeople] = useState<DecoderPerson[] | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    let cancelled = false;
    setPeople(null);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/contact-summary?contactId=${encodeURIComponent(contact.id)}`)
      .then((r) => r.json())
      .then((d: { people?: DecoderPerson[] }) => {
        if (!cancelled) setPeople(d.people ?? []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contact.id, subAccountId]);

  if (people !== null && people.length === 0) return null;

  return (
    <section
      aria-label="Energetic Decoding"
      // The profile's ONE warm-tinted card (Visual Direction 2, §4.3 contact
      // detail): the system's cream gold tint (same surface as <Card
      // variant="tint" tint="gold">) with a restrained gold accent.
      className="relative overflow-hidden rounded-card border border-gold-300/45 bg-tint-gold p-4 shadow-card"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-gold-300/70" aria-hidden="true" />
      <Motif kind="constellation" size="corner" placement="top-right" hideBelow="sm" className="top-2 right-2 opacity-70" />
      <div className="mb-3 flex items-center gap-2.5 pr-10">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-gold-bg text-tag-gold-fg" aria-hidden="true">
          <Orbit className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-section font-semibold">Energetic Decoding</h2>
          {people && people.length > 1 ? (
            <p className="text-caption text-muted-foreground">{people.length} people on this contact</p>
          ) : null}
        </div>
      </div>

      {people === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading Energetic Decoding">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-14 w-full rounded-control bg-gold-50" />
        </div>
      ) : (
        <div className="divide-y divide-gold-300/35">
          {people.map((p) => {
            const facts = [
              ["Type", p.energyType],
              ["Authority", p.authority],
              ["Profile", p.hdProfile],
              ["Sun", p.sunSign],
            ].filter((f): f is [string, string] => !!f[1]);
            const href = saPath(
              p.kind === "profile"
                ? `/energetic-decoder?tab=readings&profileId=${p.id}`
                : `/energetic-decoder?tab=readings&readingId=${p.id}`,
            );
            return (
              <div key={`${p.kind}-${p.id}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-body-sm font-semibold text-foreground">{p.name}</span>
                  {p.relationshipLabel ? (
                    <Tag color="gold" className="shrink-0 px-1.5 text-micro">
                      {p.relationshipLabel}
                    </Tag>
                  ) : null}
                </div>
                {facts.length > 0 ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {facts.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-overline font-semibold tracking-[0.12em] text-ink-tertiary uppercase">{label}</dt>
                        <dd className="truncate text-caption font-medium text-foreground" title={value}>
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1 text-caption text-muted-foreground">
                    {p.latestReadingId ? "Chart details aren't available for this reading." : "No reading yet."}
                  </p>
                )}
                {p.latestReadingId || p.kind === "profile" ? (
                  <Link
                    href={href}
                    className="mt-2 inline-flex items-center gap-1 text-caption font-semibold text-tag-gold-fg hover:underline"
                  >
                    {p.latestReadingId ? "View reading" : "Open in Energetic Decoder"}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
