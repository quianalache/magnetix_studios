"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { SettingsSection } from "@/components/system/settings-section";
import { StatusPill, Tag } from "@/components/system/status-pill";

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
  const [submitted, setSubmitted] = useState(false);

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
    setSubmitted(true);
    if (missing.length > 0) {
      toast.error("Fill in the highlighted fields to save the address.");
      return;
    }
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

  const fields = { line1, city, region, postalCode, country };
  const missing = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => !fields[k].trim());
  const showErr = (k: keyof typeof fields) => submitted && missing.includes(k);

  function field(
    id: keyof typeof fields | "line2",
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
    optional = false,
  ) {
    const err = id !== "line2" && showErr(id);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`mailing-${id}`}>{label}</Label>
        <Input
          id={`mailing-${id}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          required={!optional}
          aria-invalid={err || undefined}
          aria-describedby={err ? `mailing-${id}-err` : undefined}
        />
        {err ? (
          <p id={`mailing-${id}-err`} className="text-caption text-destructive">
            Required.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} noValidate>
      <SettingsSection
        title="Broadcast compliance"
        description="CAN-SPAM requires a real postal address on every marketing email. We add it (plus the unsubscribe link) to every broadcast's footer automatically — you never have to remember it."
        action={hasAddress ? <StatusPill tone="success">Saved</StatusPill> : <Tag color="gray">Required for broadcasts</Tag>}
        footer={
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save mailing address"
            )}
          </Button>
        }
      >
        {!hasAddress ? (
          <Alert tone="warning" title="Broadcasts are paused until this is saved">
            Anti-spam law requires a physical address in every bulk email footer. It&apos;s added automatically.
          </Alert>
        ) : null}
        {field("line1", "Street address", line1, setLine1, "123 Main St")}
        {field("line2", "Suite / unit (optional)", line2, setLine2, "Suite 200", true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("city", "City", city, setCity, "Atlanta")}
          {field("region", "State / region", region, setRegion, "GA")}
          {field("postalCode", "Postal code", postalCode, setPostalCode, "30301")}
          {field("country", "Country", country, setCountry, "United States")}
        </div>
      </SettingsSection>
    </form>
  );
}
