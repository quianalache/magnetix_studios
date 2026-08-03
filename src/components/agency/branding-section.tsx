"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Globe, Loader2, Mail, Palette, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
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

  async function handleSave(e: FormEvent) {
    e.preventDefault();
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
      return;
    }
    if (trimmedLogo && !URL_RE.test(trimmedLogo)) {
      toast.error("Logo URL must start with http:// or https://.");
      return;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      toast.error("Support email must be a valid email address.");
      return;
    }
    if (trimmedDomain && !DOMAIN_RE.test(trimmedDomain)) {
      toast.error("Primary domain must be a bare domain like example.com.");
      return;
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
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

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Branding</h2>
          <p className="text-xs text-muted-foreground">
            What clients see in the sidebar, browser tab, AND the public
            landing page when LANDING_VARIANT is &ldquo;custom&rdquo;. Blank
            fields fall back to the defaults in src/config/landing.ts.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agency-name">Agency name</Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Marketing Co."
          maxLength={80}
          required
        />
        <p className="text-[11px] text-muted-foreground">
          Sidebar wordmark, browser tab title, and the brand name across the
          public landing page.
        </p>
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
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
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
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          PNG, JPG, WebP, or SVG — transparent background works best.
          Renders in the sidebar at 24px tall. Leave empty to fall back to
          the default mark.
        </p>
        <details className="text-[11px] text-muted-foreground">
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
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Used for &ldquo;Talk to us&rdquo; CTAs, the FAQ contact line, and
          the footer on the public landing page.
        </p>
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
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Bare domain only — no https://, no trailing slash. Surfaced in the
          landing footer.
        </p>
      </div>

      {/* Live preview of the sidebar lockup. Mirrors what the dashboard
          chrome will render after save. */}
      <div className="rounded-xl border bg-background p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !hydrated}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
