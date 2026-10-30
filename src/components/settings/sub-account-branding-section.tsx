"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/system/settings-section";

/**
 * Sub-account logo — Settings → Workspace → Branding (moved from Business
 * profile 2026-10-30; same `subAccounts.logoUrl` field and `/branding`
 * route). Renders on quote/invoice emails, public /q/[token] pages, booking
 * emails and PDFs (the surfaces this client's customers see).
 *
 * Distinct from agency-level branding (which controls the CRM sidebar +
 * landing page). Agency owners and sub-account admins can both edit.
 */

const URL_RE = /^https?:\/\/.+/i;

export function SubAccountBrandingSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once when the snapshot resolves. Don't reset on subsequent
  // ticks so the operator's in-flight edits aren't blown away by their
  // own save echo.
  useEffect(() => {
    if (!hydrated && subAccount) {
      setLogoUrl(subAccount.logoUrl ?? "");
      setHydrated(true);
    }
  }, [hydrated, subAccount]);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = logoUrl.trim();
    if (trimmed && !URL_RE.test(trimmed)) {
      toast.error("Logo URL must start with http:// or https://.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: trimmed || null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't save branding.");
      }
      toast.success(trimmed ? "Logo saved." : "Logo cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const previewValid = logoUrl.trim() && URL_RE.test(logoUrl.trim());
  const businessName = subAccount?.name ?? "Your client";

  return (
    <form onSubmit={handleSave}>
      <SettingsSection
        title="Logo"
        description={
          <>
            Appears on <strong className="text-foreground">{businessName}</strong>&apos;s quote and invoice emails,
            public link pages and PDFs. Doesn&apos;t affect the CRM sidebar (that&apos;s agency-level).
          </>
        }
        footer={
          <Button type="submit" disabled={saving || !hydrated}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save logo"
            )}
          </Button>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-logo-url">Logo URL</Label>
          <Input
            id="sa-logo-url"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder={`https://yourcdn.com/${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "logo"}.png`}
          />
          <p className="text-caption text-muted-foreground">
            Public https URL pointing at {businessName}&apos;s logo (PNG with transparent background works best).
            Renders at 32&ndash;40px tall. Leave blank to fall back to &ldquo;{businessName}&rdquo; in text.
          </p>
        </div>

        {/* Live preview — what the recipient sees on a quote/invoice header. */}
        <div className="rounded-control border border-border bg-background p-4">
          <p className="text-micro mb-3 font-medium tracking-wider text-muted-foreground uppercase">Invoice header preview</p>
          <div className="flex items-center gap-3">
            {previewValid ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl.trim()} alt={businessName} className="h-9 w-auto max-w-40 object-contain" />
            ) : (
              <span className="text-caption flex size-9 items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground">
                {businessName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-micro tracking-wider text-muted-foreground uppercase">Invoice from</p>
              <p className="text-title-md font-semibold tracking-tight">{businessName}</p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </form>
  );
}
