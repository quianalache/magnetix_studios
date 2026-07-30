"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Business mailing address — CAN-SPAM requires a physical postal address in
 * every bulk marketing email. Required before a broadcast can send (gated
 * server-side by `requireMailingAddress` in src/lib/broadcasts/compliance.ts,
 * checked in POST /api/broadcasts/email/send); appended automatically to
 * every broadcast's footer alongside the unsubscribe link — never a block,
 * never author-editable per-send. Does NOT gate the automations "Send Email"
 * workflow step (a real, deliberate scope gap — see the broadcast rebuild
 * plan).
 */
export function SubAccountBroadcastComplianceSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const addr = subAccount?.mailingAddress ?? null;
    setLine1(addr?.line1 ?? "");
    setLine2(addr?.line2 ?? "");
    setCity(addr?.city ?? "");
    setRegion(addr?.region ?? "");
    setPostalCode(addr?.postalCode ?? "");
    setCountry(addr?.country ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, subAccount?.updatedAt]);

  if (!isAdmin) return null;

  const hasAddress = !!subAccount?.mailingAddress;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailingAddress: {
            line1,
            line2: line2 || null,
            city,
            region,
            postalCode,
            country,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      toast.success("Mailing address saved — broadcasts can now send.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Broadcast compliance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            CAN-SPAM requires a real postal address on every marketing email.
            We add it (plus the unsubscribe link) to every broadcast&apos;s
            footer automatically — you never have to remember it. Required
            before you can send a broadcast.
          </p>
        </div>
        {!hasAddress && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Required
          </span>
        )}
      </header>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Street address
          </label>
          <Input
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder="123 Main St"
            disabled={saving}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Suite / unit (optional)
          </label>
          <Input
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            placeholder="Suite 200"
            disabled={saving}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              City
            </label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Atlanta"
              disabled={saving}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              State / region
            </label>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="GA"
              disabled={saving}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Postal code
            </label>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="30301"
              disabled={saving}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Country
            </label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="United States"
              disabled={saving}
              required
            />
          </div>
        </div>

        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save mailing address"
          )}
        </Button>
      </form>
    </section>
  );
}
