"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Rocket, Save, Trash2 } from "lucide-react";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const URL_RE = /^https?:\/\/.+/i;

/**
 * Agency → Settings → Sales page (Agency Acquisition Foundation,
 * 2026-08-31). The no-code counterpart to `AgencyDoc.primarySalesPageUrl` —
 * mirrors `BrandingSection`'s form pattern exactly (PATCH /api/agency,
 * hydrate-once-then-trust-local-edits).
 *
 * Deliberately just a URL: works today pointing at a GitPage page, and
 * nothing here assumes GitPage specifically — see the field's own doc
 * comment on `AgencyDoc`. The tracking snippet lives in the same card
 * because the two are used together (set the URL, then paste the snippet
 * onto that same page) — see `TrackingSnippetCard` below.
 */
export function SalesPageSection() {
  const agency = useAgency();
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!agency.loading && !hydrated) {
      setUrl(agency.primarySalesPageUrl ?? "");
      setHydrated(true);
    }
  }, [agency.loading, agency.primarySalesPageUrl, hydrated]);

  async function save(next: string | null) {
    const res = await fetch("/api/agency", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primarySalesPageUrl: next }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Could not save.");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !URL_RE.test(trimmed)) {
      toast.error("Sales page URL must start with http:// or https://.");
      return;
    }
    setSaving(true);
    try {
      await save(trimmed || null);
      toast.success(trimmed ? "Sales page saved." : "Sales page cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await save(null);
      setUrl("");
      toast.success("Sales page cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear.");
    } finally {
      setClearing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(agency.primarySalesPageUrl ?? url);
      toast.success("Sales page URL copied.");
    } catch {
      toast.error("Couldn't copy — select the URL manually.");
    }
  }

  const savedUrl = agency.primarySalesPageUrl;

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Rocket className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Sales page</h2>
          <p className="text-xs text-muted-foreground">
            Where new customers land before signing up for Magnetix. Hosted
            wherever you like — GitPage, another builder, or a plain HTML
            page — Magnetix just needs to know the URL.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-1.5">
        <Label htmlFor="sales-page-url">Sales page URL</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="sales-page-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.gitpage.site"
            className="min-w-0 flex-1"
            disabled={!hydrated}
          />
          <Button type="submit" size="sm" disabled={saving || !hydrated}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
          {savedUrl && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={<a href={savedUrl} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={clearing}
                onClick={handleClear}
                className="text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                {clearing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                )}
                Clear
              </Button>
            </>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          This doesn&apos;t change or rebuild anything at that URL — it just
          tells Magnetix which page is your storefront, so it shows up here
          and in Agency → Acquisition.
        </p>
      </form>

      <TrackingSnippetCard />
    </div>
  );
}

function TrackingSnippetCard() {
  const snippetSrc =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/track/acquisition/snippet.js`
      : "/api/track/acquisition/snippet.js";
  const tag = `<script src="${snippetSrc}"></script>`;

  async function handleCopySnippet() {
    try {
      await navigator.clipboard.writeText(tag);
      toast.success("Tracking snippet copied.");
    } catch {
      toast.error("Couldn't copy — select the code manually.");
    }
  }

  return (
    <div className="rounded-xl border border-dashed bg-background p-4">
      <p className="text-xs font-medium text-foreground">Tracking snippet</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Paste this once into your sales page&apos;s HTML (right before{" "}
        <code>&lt;/body&gt;</code>) to see visits, checkout starts, and
        conversions in Agency → Acquisition. It also automatically carries
        UTM/referral params through to your &ldquo;Get started&rdquo;
        button&apos;s link — no extra code needed on the button itself.
      </p>
      <div className="mt-2.5 flex items-start gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg bg-muted px-3 py-2 text-[11px]">
          {tag}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={handleCopySnippet}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}
