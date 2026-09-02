"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BrainCircuit, Loader2, Save } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SCRIPT_OUTPUT_TYPES } from "@/components/ytcs/script-prompt-builder-step";
import type { YtcsSettings } from "@/types/ytcs";

/**
 * YTCS Settings (final completion phase). Business Brain stays a link
 * out to its own shared Settings location — never duplicated here.
 * Default Script Settings (migration spec §16) is the one real
 * YTCS-specific setting: `defaultScriptOutputType` (all 4 real values
 * selectable) and `defaultDepthPreference` (only "Detailed" is
 * real-confirmed — see the migration spec's Phase 2/Final Completion
 * notes — so this stays a single, honestly-labeled fixed value rather
 * than a dead dropdown implying Balanced/Concise are real options).
 * Sub-account-wide, not per-user — see `YtcsSettings`'s doc comment.
 * Data Management (Export/Clear All Data) and PDF-Enhanced Prompt are
 * deliberately not rebuilt — see this page's own note below.
 */
export default function YtcsSettingsPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [settings, setSettings] = useState<YtcsSettings | null>(null);
  const [scriptOutputType, setScriptOutputType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/ytcs/settings`)
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings ?? {});
        setScriptOutputType(d.settings?.defaultScriptOutputType ?? "");
      })
      .catch(() => setSettings({}));
  }, [subAccountId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultScriptOutputType: scriptOutputType,
          defaultDepthPreference: "Detailed",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save");
      setSettings(data.settings);
      toast.success("Default script settings saved. New projects will use these — existing projects keep their own values.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <a
        href={saPath("/dashboard/settings")}
        className="flex items-center gap-3 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Business Brain</h3>
          <p className="text-sm text-muted-foreground">
            Shared context powering your YouTube strategy — Creator Vision, Audience,
            Offers, Frameworks, Stories + Proof, Brand Voice, Topics + Subtopics, and
            Positioning. Edited in one place, used everywhere.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>

      <div className="rounded-2xl border bg-card p-5">
        <h3 className="text-base font-semibold">Default Script Settings</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Applied to new video projects only — changing this never rewrites the Script
          Output Type already saved on an existing project.
        </p>

        {settings === null ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-1.5">
              <Label>Default Script Output Type</Label>
              <div className="flex flex-wrap gap-2">
                {SCRIPT_OUTPUT_TYPES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={scriptOutputType === t ? "default" : "outline"}
                    onClick={() => setScriptOutputType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label>Default Depth Preference</Label>
              <Button type="button" size="sm" variant="default" disabled>
                Detailed
              </Button>
              <p className="text-xs text-muted-foreground">
                &ldquo;Detailed&rdquo; is the only Depth Preference confirmed by real historical
                usage — Balanced/Concise stay unavailable rather than being turned on
                without real evidence they ever worked.
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Defaults
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Data export/import isn&apos;t offered here — your projects and ideas already
        live in your authenticated Magnetix account, not local browser storage, so
        there&apos;s nothing to back up or restore separately.
      </p>
    </div>
  );
}
