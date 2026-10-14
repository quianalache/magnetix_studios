"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Globe, Loader2, Mail, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
import { SettingsSection } from "@/components/system/settings-section";
import { useSettingsForm } from "@/components/system/settings-workspace";
import { renderLogo } from "@/lib/brand/render-logo-client";

// Accepts a full https:// URL (manually pasted) OR our own served path from
// an in-app upload (POST /api/agency/logo writes a relative
// "/api/agency/logo/image?v=..." — not an absolute URL).
const URL_RE = /^(https?:\/\/.+|\/.+)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export function BrandingSection() {
  const agency = useAgency();
  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [supportEmail, setSupportEmail] = useState<string>("");
  const [primaryDomain, setPrimaryDomain] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState<"upload" | "remove" | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Hydrate the form once the agency doc resolves. We don't reset on every
  // change, so the operator's in-flight edits aren't blown away when the
  // snapshot tick fires from their own save.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!agency.loading && !hydrated) {
      setName(agency.name === "LeadStack" ? "" : agency.name);
      setLogoUrl(agency.logoUrl ?? "");
      setSupportEmail(agency.supportEmail ?? "");
      setPrimaryDomain(agency.primaryDomain ?? "");
      setHydrated(true);
    }
  }, [
    agency.loading,
    agency.name,
    agency.logoUrl,
    agency.supportEmail,
    agency.primaryDomain,
    hydrated,
  ]);

  // Inline validation — same rules the save has always enforced, now shown
  // beside the field (after the first save attempt) as well as in a toast.
  const errors = {
    name: !name.trim() ? "Agency name is required." : null,
    logo: logoUrl.trim() && !URL_RE.test(logoUrl.trim()) ? "Logo URL must start with http:// or https://." : null,
    email:
      supportEmail.trim() && !EMAIL_RE.test(supportEmail.trim().toLowerCase())
        ? "Support email must be a valid email address."
        : null,
    domain: (() => {
      const d = primaryDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      return d && !DOMAIN_RE.test(d) ? "Primary domain must be a bare domain like example.com." : null;
    })(),
  };
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  const savedName = agency.name === "LeadStack" ? "" : agency.name;
  function resetToSaved() {
    setName(savedName);
    setLogoUrl(agency.logoUrl ?? "");
    setSupportEmail(agency.supportEmail ?? "");
    setPrimaryDomain(agency.primaryDomain ?? "");
    setSubmitted(false);
  }
  const dirty =
    hydrated &&
    (name !== savedName ||
      logoUrl !== (agency.logoUrl ?? "") ||
      supportEmail !== (agency.supportEmail ?? "") ||
      primaryDomain !== (agency.primaryDomain ?? ""));

  function handleSave(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  async function save(): Promise<boolean> {
    setSubmitted(true);
    const trimmedName = name.trim();
    const trimmedLogo = logoUrl.trim();
    const trimmedEmail = supportEmail.trim().toLowerCase();
    const trimmedDomain = primaryDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");

    if (!trimmedName) {
      toast.error("Agency name is required.");
      return false;
    }
    if (trimmedLogo && !URL_RE.test(trimmedLogo)) {
      toast.error("Logo URL must start with http:// or https://.");
      return false;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      toast.error("Support email must be a valid email address.");
      return false;
    }
    if (trimmedDomain && !DOMAIN_RE.test(trimmedDomain)) {
      toast.error("Primary domain must be a bare domain like example.com.");
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          logoUrl: trimmedLogo || null,
          supportEmail: trimmedEmail || null,
          primaryDomain: trimmedDomain || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not save.");
      toast.success("Branding updated.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadFile(file: File) {
    setUploadBusy("upload");
    try {
      const image = await renderLogo(file);
      const res = await fetch("/api/agency/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        logoUrl?: string;
      };
      if (!res.ok || !payload.logoUrl) {
        throw new Error(payload.error ?? "Upload failed.");
      }
      setLogoUrl(payload.logoUrl);
      toast.success("Logo uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    setUploadBusy("remove");
    try {
      const res = await fetch("/api/agency/logo", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLogoUrl("");
      toast.success("Logo removed — back to the default mark.");
    } catch {
      toast.error("Couldn't remove the logo. Try again.");
    } finally {
      setUploadBusy(null);
    }
  }

  // Inside the Settings workspace the sticky save bar saves this form.
  const managed = useSettingsForm("agency-branding", { label: "Branding", dirty, save, discard: resetToSaved });

  return (
    <form onSubmit={handleSave} noValidate>
    <SettingsSection
      title="Brand identity"
      description={
        <>
          What clients see in the sidebar, browser tab, AND the public landing
          page when LANDING_VARIANT is &ldquo;custom&rdquo;. Blank fields fall
          back to the defaults in src/config/landing.ts.
        </>
      }
      footer={
        managed ? undefined : (
        <Button type="submit" disabled={saving || !hydrated}>
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Save className="size-3.5" aria-hidden="true" />}
          {saving ? "Saving…" : "Save"}
        </Button>
        )
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="agency-name">Agency name</Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Marketing Co."
          maxLength={80}
          required
          aria-invalid={!!err("name") || undefined}
          aria-describedby="agency-name-help"
        />
        <FieldHelp id="agency-name-help" error={err("name")}>
          Sidebar wordmark, browser tab title, and the brand name across the
          public landing page.
        </FieldHelp>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logo-file">Logo</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="logo-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadBusy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {uploadBusy === "upload" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-3.5" aria-hidden="true" />
            )}
            {uploadBusy === "upload" ? "Uploading…" : "Upload logo"}
          </Button>
          {logoUrl.trim() && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploadBusy !== null}
              onClick={handleRemoveLogo}
              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              {uploadBusy === "remove" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              Remove
            </Button>
          )}
        </div>
        <FieldHelp id="logo-help" error={err("logo")}>
          PNG, JPG, WebP, or SVG — transparent background works best.
          Renders in the sidebar at 24px tall. Leave empty to fall back to
          the default mark.
        </FieldHelp>
        <details className="text-caption text-muted-foreground" open={!!err("logo") || undefined}>
          <summary className="cursor-pointer select-none">
            Or paste a URL instead
          </summary>
          <Input
            id="logo-url"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://yourcdn.com/agency-logo.svg"
            className="mt-2"
            aria-invalid={!!err("logo") || undefined}
            aria-describedby="logo-help"
          />
        </details>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-email">Support email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="support-email"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="hello@yourbrand.com"
            className="pl-8"
            aria-invalid={!!err("email") || undefined}
            aria-describedby="support-email-help"
          />
        </div>
        <FieldHelp id="support-email-help" error={err("email")}>
          Used for &ldquo;Talk to us&rdquo; CTAs, the FAQ contact line, and
          the footer on the public landing page.
        </FieldHelp>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="primary-domain">Primary domain</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="primary-domain"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="yourbrand.com"
            className="pl-8"
            aria-invalid={!!err("domain") || undefined}
            aria-describedby="primary-domain-help"
          />
        </div>
        <FieldHelp id="primary-domain-help" error={err("domain")}>
          Bare domain only — no https://, no trailing slash. Surfaced in the
          landing footer.
        </FieldHelp>
      </div>

      {/* Live preview of the sidebar lockup. Mirrors what the dashboard
          chrome will render after save. */}
      <div className="rounded-control border border-border bg-surface-sunken/60 p-4">
        <p className="mb-3 text-micro font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
          Sidebar preview
        </p>
        <div className="flex items-center gap-2 text-xl font-bold">
          {logoUrl.trim() && URL_RE.test(logoUrl.trim()) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl.trim()}
              alt={name || "Agency logo"}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={20} idSuffix="-branding-preview" />
          )}
          <span className="truncate">{name || "Your agency"}</span>
        </div>
      </div>

    </SettingsSection>
    </form>
  );
}

/** Helper line under a field — turns into the field's error message when invalid. */
function FieldHelp({ id, error, children }: { id: string; error: string | null; children: React.ReactNode }) {
  return (
    <p id={id} className={error ? "text-caption text-destructive" : "text-caption text-muted-foreground"}>
      {error ?? children}
    </p>
  );
}
