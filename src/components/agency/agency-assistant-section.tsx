"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAgency } from "@/hooks/use-agency";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/system/settings-section";
import { Tag } from "@/components/system/status-pill";

/**
 * Agency Settings card: master switch for the Agency Assistant (the
 * owner-level AI at /agency/ai-suite). OFF by default — every reply spends
 * the deployment's OpenRouter credits, so the owner opts in deliberately.
 * The per-sub-account Workspace Assistant is gated separately (per client,
 * from the Manage dialog) and is unaffected by this switch.
 *
 * Writes `agencyAssistantEnabled` via PATCH /api/agency; the sidebar entry
 * and the assistant page react live through the useAgency() snapshot.
 */
export function AgencyAssistantSection() {
  const agency = useAgency();
  const [saving, setSaving] = useState(false);
  // Optimistic local override while the PATCH is in flight; null = follow
  // the live doc.
  const [pending, setPending] = useState<boolean | null>(null);
  const [pendingModel, setPendingModel] = useState<"opus" | "sonnet" | null>(
    null,
  );

  const enabled = pending ?? agency.agencyAssistantEnabled;
  const model = pendingModel ?? agency.agencyAssistantModel;

  async function handleToggle(next: boolean) {
    setPending(next);
    setSaving(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyAssistantEnabled: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not save.");
      toast.success(
        next
          ? "Agency Assistant enabled — it now appears in your sidebar."
          : "Agency Assistant disabled.",
      );
    } catch (err) {
      setPending(null);
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
      // Let the live snapshot take over once it reflects the new value.
      setTimeout(() => setPending(null), 2000);
    }
  }

  async function handleModelChange(next: "opus" | "sonnet") {
    setPendingModel(next);
    setSaving(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyAssistantModel: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not save.");
      toast.success(
        next === "opus"
          ? "Agency Assistant model set to Opus (default — most reliable)."
          : "Agency Assistant model set to Sonnet (lower cost).",
      );
    } catch (err) {
      setPendingModel(null);
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
      // Let the live snapshot take over once it reflects the new value.
      setTimeout(() => setPendingModel(null), 2000);
    }
  }

  const MODEL_ITEMS = { opus: "Opus — default (most reliable)", sonnet: "Sonnet — lower cost" };

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          Agency Assistant <Tag color="pink">Beta</Tag>
        </span>
      }
      description="Your owner-level AI: answers questions about running the agency and performs a few confirm-first actions (create sub-accounts, flip feature gates, act inside a client workspace)."
    >
      <div className="flex items-start justify-between gap-4 rounded-control border border-border p-4">
        <div className="min-w-0">
          <Label htmlFor="agency-assistant-enabled">Enable the Agency Assistant</Label>
          <p className="mt-0.5 text-caption text-muted-foreground">
            Off by default. Every reply uses your OpenRouter credits
            (<code>OPENROUTER_API_KEY</code>). When off, the sidebar entry is
            hidden and the assistant refuses requests. Each client&apos;s{" "}
            <span className="font-medium">Workspace Assistant</span> is
            separate — enable it per sub-account under{" "}
            <Link href="/agency/sub-accounts" className="text-link underline-offset-2 hover:underline">
              Sub-accounts → Manage
            </Link>
            .
          </p>
        </div>
        <Switch
          id="agency-assistant-enabled"
          checked={enabled}
          onCheckedChange={(next) => handleToggle(next)}
          disabled={saving || agency.loading}
        />
      </div>

      {enabled && (
        <div className="flex flex-col gap-3 rounded-control border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p id="agency-assistant-model-label" className="text-body-sm font-medium text-foreground">AI model</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Opus is the most reliable at complex multi-step actions; Sonnet
              costs roughly half per reply but can be less sure-footed.
            </p>
          </div>
          <Select
            value={model}
            onValueChange={(v) => v && handleModelChange(v as "opus" | "sonnet")}
            items={MODEL_ITEMS}
            disabled={saving || agency.loading}
          >
            <SelectTrigger aria-labelledby="agency-assistant-model-label" className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="opus">{MODEL_ITEMS.opus}</SelectItem>
              <SelectItem value="sonnet">{MODEL_ITEMS.sonnet}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </SettingsSection>
  );
}
