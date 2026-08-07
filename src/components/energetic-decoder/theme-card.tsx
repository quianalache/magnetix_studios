"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Palette, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultEnergeticDecoderTheme,
  type EnergeticDecoderTheme,
} from "@/types/energetic-decoder";

/**
 * Chart/report branding — her explicit "chart design tool" ask, modeled on
 * bodygraph.com's Chart Design Tool. V1 is accent color + logo, applied to
 * the public embeddable tool and (once built) the PDF. Visual chart
 * elements (planet icons, center colors) only make sense once the actual
 * Human Design bodygraph exists — Gene Keys today is a text/card layout,
 * so accent + logo covers what's brandable right now.
 */
export function EnergeticDecoderThemeCard() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const saved = subAccount?.energeticDecoderTheme ?? defaultEnergeticDecoderTheme();
  const [accent, setAccent] = useState(saved.accent);
  const [logoUrl, setLogoUrl] = useState(saved.logoUrl ?? "");
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    // Used to render nothing at all here — a genuinely blank tab with zero
    // explanation, indistinguishable from a bug. Same admin-only rule as
    // every other settings screen, just no longer silent about why.
    return (
      <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        You need admin access on this sub-account to edit chart branding.
      </p>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent, logoUrl } satisfies EnergeticDecoderTheme),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save.");
      toast.success("Chart branding saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Chart design</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your brand on the public reading tool and reports — your
            clients see your business, not ours.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ed-theme-accent">Accent color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-md border"
              aria-label="Accent color"
            />
            <Input
              id="ed-theme-accent"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#7c3aed"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-theme-logo">Logo URL</Label>
          <Input
            id="ed-theme-logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save branding
        </Button>
      </div>
    </section>
  );
}
