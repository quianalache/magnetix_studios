"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Calendar,
  FileSignature,
  MessagesSquare,
  Orbit,
  Upload,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { resolvePortalBranding, type PortalBranding } from "@/types/portal-branding";

const SWATCHES = ["#5E2574", "#C6699A", "#9EDBDD", "#3D1652", "#2B7A78", "#B4485E"];

type SettingsTab = "branding" | "modules";

export default function ClientPortalSettingsPage() {
  const { subAccountId, subAccount } = useSubAccount();
  const [tab, setTab] = useState<SettingsTab>("branding");
  const [branding, setBranding] = useState<PortalBranding>(resolvePortalBranding(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/portal-branding`)
      .then((r) => r.json())
      .then((d: { branding: PortalBranding }) => setBranding(resolvePortalBranding(d.branding)))
      .finally(() => setLoading(false));
  }, [subAccountId]);

  async function save(patch: Partial<PortalBranding>) {
    const next = { ...branding, ...patch };
    setBranding(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/portal-branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't save that change. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/sub-accounts/${subAccountId}/portal-branding/logo`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error);
      setBranding((prev) => ({ ...prev, logoUrl: data.url! }));
      toast.success("Logo updated");
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="mx-auto h-64 w-full max-w-3xl animate-pulse rounded-xl border bg-muted/30" />;
  }

  const portalDisplayName = branding.portalName || subAccount?.name || "Your Portal";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Memberships &middot; Client Portal
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Client Portal settings</h1>
        <p className="text-sm text-muted-foreground">
          What clients see when they sign in — separate from your own account name.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border bg-muted/30 p-1">
        {([
          ["branding", "Branding"],
          ["modules", "Modules"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              tab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "branding" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Identity</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
              Shows on the sign-in screen and portal header — decoupled from your internal account name.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="portal-name">Portal name</Label>
                <Input
                  id="portal-name"
                  defaultValue={branding.portalName ?? ""}
                  placeholder={subAccount?.name ?? "Your Portal"}
                  onBlur={(e) => save({ portalName: e.target.value.trim() || null })}
                />
                <p className="text-[11px] text-muted-foreground">Leave blank to use your account name.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-welcome">Welcome message</Label>
                <Textarea
                  id="portal-welcome"
                  defaultValue={branding.welcomeMessage}
                  rows={2}
                  onBlur={(e) => save({ welcomeMessage: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={branding.logoUrl} alt="Portal logo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">
                        {portalDisplayName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoUpload(f);
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {uploading ? "Uploading…" : "Upload image"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Accent colour</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
              Drives the logo fallback, buttons, and highlights across the portal.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={branding.accentColor}
                onChange={(e) => save({ accentColor: e.target.value })}
                className="h-9 w-11 cursor-pointer rounded-lg border"
              />
              <span className="font-mono text-xs text-muted-foreground">{branding.accentColor.toUpperCase()}</span>
            </div>
            <div className="mt-2.5 flex gap-2">
              {SWATCHES.map((hex) => (
                <button
                  key={hex}
                  onClick={() => save({ accentColor: hex })}
                  style={{ background: hex }}
                  className={cn(
                    "h-6 w-6 rounded-full border-2",
                    branding.accentColor.toLowerCase() === hex.toLowerCase()
                      ? "border-foreground"
                      : "border-transparent",
                  )}
                  aria-label={hex}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Support</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
              Where a &quot;Need help?&quot; link on the sign-in screen points.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="portal-support">Support email</Label>
              <Input
                id="portal-support"
                type="email"
                defaultValue={branding.supportEmail ?? ""}
                placeholder="you@yourbusiness.com"
                onBlur={(e) => save({ supportEmail: e.target.value.trim() || null })}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "modules" && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">What shows inside the portal</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
            Turn off anything that doesn&apos;t apply to how you work.
          </p>

          <ModuleRow
            icon={<BookOpen className="h-4 w-4" />}
            title="Courses"
            desc="Enrolled Standalone Courses + progress"
            checked={branding.modules.courses}
            onChange={(v) => save({ modules: { ...branding.modules, courses: v } })}
          />
          <ModuleRow
            icon={<Orbit className="h-4 w-4" />}
            title="Energetic Readings"
            desc="Saved Gene Keys / Human Design charts"
            checked={branding.modules.readings}
            onChange={(v) => save({ modules: { ...branding.modules, readings: v } })}
          />
          <ModuleRow
            icon={<Calendar className="h-4 w-4" />}
            title="Sessions"
            desc="Booked sessions & how many are still available to schedule"
            checked={branding.modules.sessions}
            onChange={(v) => save({ modules: { ...branding.modules, sessions: v } })}
          />
          <ModuleRow
            icon={<FileSignature className="h-4 w-4" />}
            title="Invoices"
            desc="Open + paid quotes and invoices"
            checked={branding.modules.invoices}
            onChange={(v) => save({ modules: { ...branding.modules, invoices: v } })}
          />
          <ModuleRow
            icon={<MessagesSquare className="h-4 w-4" />}
            title="Community"
            desc="Group posts and member directory"
            checked={branding.modules.community}
            onChange={(v) => save({ modules: { ...branding.modules, community: v } })}
            last
          />
        </div>
      )}

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}

function ModuleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", !last && "border-b")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
