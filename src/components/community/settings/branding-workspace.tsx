"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { BrandingLivePreview } from "@/components/community/settings/branding-live-preview";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ColorInput } from "@/components/ui/color-input";
import {
  COMMUNITY_THEME_PRESETS,
  defaultCommunityTheme,
  normalizeCommunityTheme,
} from "@/lib/community/community-theme-presets";
import type { CommunityTheme, CommunityThemeColors } from "@/types/community";

/** Human labels for the 6 color roles, in the order the mock-up lists them. */
const COLOR_ROLES: { key: keyof CommunityThemeColors; label: string; hint: string }[] = [
  { key: "primary", label: "Primary / Brand", hint: "Your community's main identity color." },
  { key: "primaryAction", label: "Primary Actions / Buttons", hint: "Post, Save, and other primary buttons." },
  { key: "accent", label: "Accent / Highlights", hint: "Likes, links, badges, and small highlights." },
  { key: "background", label: "Background", hint: "The page background behind everything." },
  { key: "surface", label: "Surface / Cards", hint: "Post cards, panels, and the header bar." },
  { key: "text", label: "Text / Links", hint: "Body text and link color." },
];

/**
 * Community Settings → Branding. Companion to `SettingsWorkspace`
 * (General) — same page shell/save-discard shape, different content, per
 * Part 4's "reuse existing... unsaved-change infrastructure" instruction:
 * this doesn't reuse SettingsWorkspace's COMPONENT (its content is General-
 * specific), but it deliberately mirrors its exact pattern (local draft
 * state, dirty-check via JSON.stringify diff, Save/Discard in the same
 * header position) rather than inventing a different one.
 *
 * IMPORTANT — what's real vs. preview-only (Part 9), stated once here since
 * every color role's own UI below links back to this comment:
 *  - `theme.light.primary` is the ONE value that reaches the real,
 *    production Community today. Saving a theme also writes it into
 *    `CommunityGroup.brandColor` (see updateGroupServerSide) — the SAME
 *    field every existing Community surface already reads via its own
 *    `brand`/`brandColor` prop. That's what makes Primary/Brand real
 *    without touching dozens of existing components.
 *  - Every other role (Primary Actions, Accent, Background, Surface, Text)
 *    and the ENTIRE Dark Mode set are configurable and fully reflected in
 *    the Live Theme Preview below, but do not yet reach any real Community
 *    page — no real Community surface currently reads per-role theme
 *    tokens or has a light/dark mode concept at all. Wiring those up for
 *    real would mean threading new CSS custom properties through a large
 *    number of existing components (and, for Dark Mode, building an actual
 *    dark-mode rendering path for the member-facing Community UI) — real,
 *    substantial follow-up work, deliberately NOT done in this pass per
 *    the explicit "don't build a huge, difficult-to-reverse theming
 *    framework unnecessarily" instruction. The data model here (full
 *    6-role light+dark sets, already persisted) is shaped so that
 *    follow-up can happen incrementally without another migration.
 */
export function BrandingWorkspace({
  saId,
  pretty = false,
  staffGroupId,
  groupId,
  groupSlug,
  theme: initialTheme,
  brand,
}: {
  saId: string;
  pretty?: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  theme: CommunityTheme | undefined;
  brand: string;
}) {
  const [savedTheme, setSavedTheme] = useState(() => normalizeCommunityTheme(initialTheme));
  const [draft, setDraft] = useState(savedTheme);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [colorTab, setColorTab] = useState<"presets" | "custom">("presets");
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedTheme);

  function selectPreset(key: (typeof COMMUNITY_THEME_PRESETS)[number]["key"]) {
    const preset = COMMUNITY_THEME_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setDraft({ preset: key, light: { ...preset.light }, dark: { ...preset.dark } });
  }

  function selectCustom() {
    setDraft((d) => ({ ...d, preset: "custom" }));
    setColorTab("custom");
  }

  function setColor(role: keyof CommunityThemeColors, value: string) {
    setDraft((d) => ({ ...d, preset: "custom", [mode]: { ...d[mode], [role]: value } }));
  }

  function resetToDefault() {
    setDraft(defaultCommunityTheme());
  }

  function discard() {
    setDraft(savedTheme);
    toast.success("Reverted to the last saved values.");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: { theme?: CommunityTheme };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.group) {
        throw new Error(data.error ?? "Couldn't save changes");
      }
      const saved = normalizeCommunityTheme(data.group.theme);
      setSavedTheme(saved);
      setDraft(saved);
      toast.success("Branding saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  const activeColors = draft[mode];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202124]">Community Settings</h1>
          <Link
            href={communityHomeHref({ saId, pretty, staffGroupId }, groupSlug)}
            className="mt-1 flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={discard}
            disabled={!dirty || saving}
            className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr_340px]">
        <SettingsNav brand={brand} active="branding" link={{ saId, pretty, staffGroupId }} groupSlug={groupSlug} />

        <div className="space-y-5">
          <section className="rounded-xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#202124]">Branding</h2>
            <p className="mt-0.5 text-sm text-[#909090]">
              Customize your community&apos;s colors and visual appearance.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                value={colorTab}
                onChange={setColorTab}
                options={[
                  { value: "presets", label: "Theme Presets" },
                  { value: "custom", label: "Custom Colors" },
                ]}
                className="rounded-lg bg-[#F5F4F2] p-1"
              />
              <SegmentedControl
                value={mode}
                onChange={setMode}
                options={[
                  { value: "light", label: "Light Mode" },
                  { value: "dark", label: "Dark Mode" },
                ]}
                className="rounded-lg bg-[#F5F4F2] p-1"
              />
            </div>

            {colorTab === "presets" ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-[#202124]">Theme Presets</p>
                <p className="mb-3 text-xs text-[#909090]">Choose a preset theme to get started quickly.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {COMMUNITY_THEME_PRESETS.map((preset) => {
                    const selected = draft.preset === preset.key;
                    const swatches = preset[mode];
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => selectPreset(preset.key)}
                        className={cn(
                          "relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                          selected ? "border-2" : "border-[#E4E4E4] hover:border-[#d4d4d4]",
                        )}
                        style={selected ? { borderColor: brand } : undefined}
                      >
                        {selected && (
                          <span
                            className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: brand }}
                          >
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        <div className="flex gap-1">
                          {[swatches.primary, swatches.primaryAction, swatches.accent, swatches.surface].map((c, i) => (
                            <span
                              key={i}
                              className="h-4 w-4 rounded-full border border-black/5"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-medium text-[#202124]">{preset.label}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={selectCustom}
                    className={cn(
                      "relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                      draft.preset === "custom" ? "border-2" : "border-[#E4E4E4] hover:border-[#d4d4d4]",
                    )}
                    style={draft.preset === "custom" ? { borderColor: brand } : undefined}
                  >
                    {draft.preset === "custom" && (
                      <span
                        className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: brand }}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{
                        background: "conic-gradient(from 0deg, #EF4444, #F59E0B, #22C55E, #3B82F6, #8B5CF6, #EF4444)",
                      }}
                    />
                    <span className="text-xs font-medium text-[#202124]">Custom</span>
                    <span className="text-[11px] text-[#909090]">Create your own unique color theme</span>
                  </button>
                </div>

                <div className="mt-5 border-t border-[#f0f0f0] pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#909090]">
                    Quick Actions
                  </p>
                  <button
                    type="button"
                    onClick={resetToDefault}
                    className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] hover:bg-[#F5F4F2]"
                  >
                    Reset to Default
                  </button>
                  <p className="mt-1.5 text-xs text-[#909090]">This will restore the Magnetix Purple theme.</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-[#909090]">
                  Editing <span className="font-medium text-[#202124]">{mode === "light" ? "Light Mode" : "Dark Mode"}</span> colors.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {COLOR_ROLES.map((role) => (
                    <div key={role.key} className="flex items-start gap-3">
                      <ColorInput value={activeColors[role.key]} onChange={(hex) => setColor(role.key, hex)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#202124]">{role.label}</p>
                        <p className="text-xs text-[#909090]">{role.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="md:sticky md:top-6 md:self-start">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#202124]">Live Theme Preview</h2>
              <p className="text-xs text-[#909090]">See how your community will look with this theme.</p>
            </div>
            <BrandingLivePreview colors={activeColors} />
          </div>
        </div>
      </div>
    </div>
  );
}
