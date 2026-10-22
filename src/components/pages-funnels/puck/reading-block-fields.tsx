"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOptionalSubAccount } from "@/context/sub-account-context";

/**
 * Builder fields for Reading blocks (2026-10-21): a checkbox list (which
 * facts / which Skills layers) and the Featured Offer picker. Values are
 * stored as plain comma-joined strings / an Offer id, so published pages
 * never depend on these editor components.
 */

export function CheckboxListField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const selected = new Set((value ?? "").split(",").filter(Boolean));
  const toggle = (v: string, on: boolean) => {
    const next = options.map((o) => o.value).filter((o) => (o === v ? on : selected.has(o)));
    onChange(next.join(","));
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="space-y-1.5 rounded-md border p-2.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.has(o.value)} onCheckedChange={(on) => toggle(o.value, on === true)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

interface OfferOption {
  id: string;
  title: string;
  published: boolean;
}

export function FeaturedOfferPickerField({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
  const sub = useOptionalSubAccount();
  const [offers, setOffers] = useState<OfferOption[] | null>(null);
  useEffect(() => {
    if (!sub?.subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${sub.subAccountId}/energetic-decoder/featured-offers`)
      .then((r) => r.json())
      .then((d) => !cancelled && setOffers(d.offers ?? []))
      .catch(() => !cancelled && setOffers([]));
    return () => {
      cancelled = true;
    };
  }, [sub?.subAccountId]);
  const offersHref = sub ? sub.saPath("/courses") : "#";
  const label = (o: OfferOption) => (o.published ? o.title : `${o.title} (Draft)`);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Offer</Label>
      {!sub ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">Offers aren’t available in this preview.</p>
      ) : offers === null ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Offers…
        </div>
      ) : offers.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">No Offers yet. Create one in Offers first.</p>
      ) : (
        <Select value={value || null} onValueChange={(v) => onChange(v ?? "")} items={Object.fromEntries(offers.map((o) => [o.id, label(o)]))}>
          <SelectTrigger aria-label="Offer">
            <SelectValue placeholder="Choose an Offer…" />
          </SelectTrigger>
          <SelectContent>
            {offers.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {label(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-muted-foreground text-[11px] leading-snug">
        Price, billing terms and what it includes always come from the Offer itself — this block can’t change them.
      </p>
      {sub && (
        <a href={offersHref} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
          <ExternalLink className="h-3 w-3" /> Manage Offers
        </a>
      )}
    </div>
  );
}
