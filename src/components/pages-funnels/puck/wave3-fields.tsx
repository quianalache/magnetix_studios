"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OptionSelect } from "@/components/system/option-select";
import { NavColorField } from "@/components/pages-funnels/puck/navigation-fields";
import { SOCIAL_ICONS } from "@/components/pages-funnels/puck/social-icons";
import { EMBED_PROVIDERS, resolveEmbedUrl } from "@/lib/pages-funnels/embed";
import { toIconColorSetting, type IconColorValue } from "@/lib/pages-funnels/icon-color";
import type { NavColorSetting } from "@/lib/pages-funnels/navigation";
import {
  SOCIAL_LIMITS,
  SOCIAL_NETWORKS,
  SOCIAL_NETWORK_LABEL,
  normalizeSocialItems,
  normalizeSocialStyle,
  socialHref,
  type SocialLinkItem,
  type SocialLinksStyle,
  type SocialNetwork,
} from "@/lib/pages-funnels/social-links";

// ── Embed ────────────────────────────────────────────────────────────────

/**
 * Embed link (Wave 3). Commits on blur / Enter so the canvas doesn't reload
 * the embed on every keystroke; shows which provider was recognised, or why
 * a link can't be embedded.
 */
export function EmbedUrlField({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const resolved = resolveEmbedUrl(draft);
  const commit = () => {
    if (draft !== (value ?? "")) onChange(draft.trim());
  };
  return (
    <div className="space-y-1.5" data-embed-url-field="">
      <Label htmlFor="embed-url" className="text-xs font-semibold">Link to embed</Label>
      <Input
        id="embed-url"
        value={draft}
        placeholder="https://www.loom.com/share/…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        aria-invalid={!!draft.trim() && !resolved}
        className="text-xs"
      />
      {draft.trim() ? (
        resolved ? (
          <p className="text-muted-foreground text-caption">Recognised: {EMBED_PROVIDERS[resolved.provider].label}</p>
        ) : (
          <p className="text-destructive text-xs">This link can&apos;t be embedded. Use a link from one of the services below.</p>
        )
      ) : null}
      <p className="text-muted-foreground text-caption">
        Works with {Object.values(EMBED_PROVIDERS).map((p) => p.label).join(", ")}. Paste the normal share link.
      </p>
    </div>
  );
}

// ── Icon color ───────────────────────────────────────────────────────────

/** Icon color / background: Default · Brand color · Custom (Wave 3). */
export function IconColorField({ label, value, onChange, defaultLabel }: { label: string; value: unknown; onChange: (v: NavColorSetting) => void; defaultLabel: string }) {
  return <NavColorField label={label} value={toIconColorSetting(value as IconColorValue)} onChange={onChange} defaultLabel={defaultLabel} />;
}

// ── Social Links ─────────────────────────────────────────────────────────

const newId = () => `social-${Math.random().toString(36).slice(2, 10)}`;

/** Social Links → links: network, address, accessible label; reorder / remove. */
export function SocialLinksItemsField({ value, onChange }: { value: unknown; onChange: (items: SocialLinkItem[]) => void }) {
  const items = normalizeSocialItems(value);
  const set = (next: SocialLinkItem[]) => onChange(next);
  const patch = (id: string, partial: Partial<SocialLinkItem>) => set(items.map((item) => (item.id === id ? { ...item, ...partial } : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    set(next);
  };
  return (
    <div className="space-y-2" data-social-items-field="">
      <Label className="text-xs font-semibold">Links</Label>
      {items.map((item, index) => {
        const Icon = SOCIAL_ICONS[item.network];
        const bad = !!item.url.trim() && !socialHref(item);
        return (
          <div key={item.id} className="border-border space-y-2 rounded-lg border p-2.5" data-social-item={item.network}>
            {/* Header: brand icon + full network name + compact actions
                (Wave 3 mockup review: the name must never be truncated). */}
            <div className="flex items-center gap-2">
              <Icon size={16} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{SOCIAL_NETWORK_LABEL[item.network]}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${SOCIAL_NETWORK_LABEL[item.network]}`} onClick={() => set(items.filter((x) => x.id !== item.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <OptionSelect<SocialNetwork>
              aria-label="Network"
              value={item.network}
              onChange={(network) => network && patch(item.id, { network })}
              options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: SOCIAL_NETWORK_LABEL[n] }))}
              className="w-full"
            />
            <Input
              value={item.url}
              placeholder={item.network === "email" ? "you@example.com" : "https://…"}
              aria-label={`${SOCIAL_NETWORK_LABEL[item.network]} link`}
              aria-invalid={bad}
              onChange={(e) => patch(item.id, { url: e.target.value })}
              className="text-xs"
            />
            {bad ? <p className="text-destructive text-xs">{item.network === "email" ? "Enter an email address." : "Enter a full link, like https://instagram.com/yourname."}</p> : null}
            <Input
              value={item.label}
              placeholder={`Accessible name (default: ${SOCIAL_NETWORK_LABEL[item.network]})`}
              aria-label="Accessible name"
              maxLength={SOCIAL_LIMITS.label}
              onChange={(e) => patch(item.id, { label: e.target.value })}
              className="text-xs"
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={items.length >= SOCIAL_LIMITS.items}
        onClick={() => set([...items, { id: newId(), network: "website", url: "", label: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add link
      </Button>
      <p className="text-muted-foreground text-caption">Links without an address are hidden on the live page.</p>
    </div>
  );
}

/** Social Links → appearance: size, spacing, alignment, shape, colors. */
export function SocialLinksStyleField({ value, onChange }: { value: unknown; onChange: (v: SocialLinksStyle) => void }) {
  const s = normalizeSocialStyle(value);
  const set = (partial: Partial<SocialLinksStyle>) => onChange({ ...s, ...partial });
  return (
    <div className="space-y-3" data-social-style-field="">
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <Label htmlFor="social-size" className="text-xs font-semibold">Icon size</Label>
          <span>{s.size}px</span>
        </div>
        <input id="social-size" type="range" min={SOCIAL_LIMITS.sizeMin} max={SOCIAL_LIMITS.sizeMax} value={s.size} onChange={(e) => set({ size: Number(e.target.value) })} className="accent-primary w-full" />
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <Label htmlFor="social-gap" className="text-xs font-semibold">Spacing</Label>
          <span>{s.gap}px</span>
        </div>
        <input id="social-gap" type="range" min={0} max={SOCIAL_LIMITS.gapMax} value={s.gap} onChange={(e) => set({ gap: Number(e.target.value) })} className="accent-primary w-full" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Alignment</Label>
        <SegmentedControl<SocialLinksStyle["alignment"]>
          value={s.alignment}
          onChange={(alignment) => set({ alignment })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Shape</Label>
        <SegmentedControl<SocialLinksStyle["shape"]>
          value={s.shape}
          onChange={(shape) => set({ shape })}
          options={[
            { value: "plain", label: "Icon only" },
            { value: "circle", label: "Circle" },
            { value: "rounded", label: "Rounded" },
          ]}
        />
      </div>
      <NavColorField label="Icon color" value={s.color} onChange={(color) => set({ color })} defaultLabel="Default (text color)" />
      <NavColorField label="Hover color" value={s.hoverColor} onChange={(hoverColor) => set({ hoverColor })} defaultLabel="Default (no change)" />
    </div>
  );
}
