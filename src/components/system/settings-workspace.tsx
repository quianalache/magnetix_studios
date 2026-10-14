"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronRight, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/system/confirm-dialog";

/**
 * SettingsWorkspace — the ONE Settings page family (Visual Direction 2,
 * Section 4.4; visual-parity pass 2026-10-14). Used by sub-account Settings
 * and Agency Settings alike: different content, same architecture.
 *
 *   main CRM sidebar │ Settings column (title + grouped nav) │ the section
 *
 * - Desktop (≥1024px): the Settings column sits directly on the canvas —
 *   no card, no second tab row — 210px wide from 1280px (176px between
 *   1024 and 1279px so forms keep their width). The selected item is a white
 *   pill with a violet label. Content is left-aligned, capped at 720px.
 * - Tablet/phone (<1024px): no second rail beside the CRM rail — the column
 *   collapses to the title plus one grouped section picker.
 * - The section header (breadcrumb · title · helper) comes from the active
 *   nav item, so every section reads the same.
 * - Sticky save bar: forms that register through `useSettingsForm()` drop
 *   their own Save button; while any of them is edited the bar shows
 *   "You have unsaved changes · N sections edited · Discard · Save changes".
 *   Sections that save per action (connect, invite, toggles) keep their own
 *   controls.
 */

export interface SettingsNavItem {
  key: string;
  label: string;
  /** One line under the section title. */
  description?: ReactNode;
  /** Shows a lock (feature switched off by the agency); the panel explains. */
  locked?: boolean;
}
export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

// ── Save-bar registry ────────────────────────────────────────────────────

interface FormHandle {
  label: string;
  /** Resolve true when saved; false keeps the bar (e.g. validation failed). */
  save: () => Promise<boolean>;
  discard: () => void;
}
interface FormsCtx {
  setHandle: (id: string, handle: { current: FormHandle } | null) => void;
  setDirty: (id: string, dirty: boolean) => void;
}
const SettingsFormsContext = createContext<FormsCtx | null>(null);

/**
 * Register a settings form with the workspace's sticky save bar. Returns
 * `true` when a workspace is present — the form should then hide its own
 * Save button. Outside a workspace it returns `false` and the form keeps
 * working stand-alone.
 */
export function useSettingsForm(id: string, form: FormHandle & { dirty: boolean }): boolean {
  const ctx = useContext(SettingsFormsContext);
  const ref = useRef<FormHandle>(form);
  ref.current = form;
  useEffect(() => {
    if (!ctx) return;
    ctx.setHandle(id, ref);
    return () => {
      ctx.setHandle(id, null);
      ctx.setDirty(id, false);
    };
  }, [ctx, id]);
  useEffect(() => {
    ctx?.setDirty(id, form.dirty);
  }, [ctx, id, form.dirty]);
  return ctx !== null;
}

// ── Workspace ────────────────────────────────────────────────────────────

export function SettingsWorkspace({
  title = "Settings",
  subtitle,
  groups,
  activeKey,
  onNavigate,
  hrefFor,
  footer,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  groups: SettingsNavGroup[];
  activeKey: string;
  onNavigate: (key: string) => void;
  /** Real URL for each item (open-in-new-tab, copy link). */
  hrefFor: (key: string) => string;
  /** Small links under the nav (e.g. "Your account"). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const handles = useRef(new Map<string, { current: FormHandle }>());
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  const ctx = useMemo<FormsCtx>(
    () => ({
      setHandle: (id, handle) => {
        if (handle) handles.current.set(id, handle);
        else handles.current.delete(id);
      },
      setDirty: (id, dirty) =>
        setDirtyIds((prev) => (dirty ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id))),
    }),
    [],
  );

  const dirty = dirtyIds.length > 0;

  // Leaving the page with edits: the browser's own "leave site?" prompt.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      for (const id of dirtyIds) {
        const ok = await handles.current.get(id)?.current.save();
        if (ok === false) break;
      }
    } finally {
      setSaving(false);
    }
  }, [dirtyIds]);

  const discardAll = useCallback(() => {
    for (const id of dirtyIds) handles.current.get(id)?.current.discard();
  }, [dirtyIds]);

  const go = useCallback(
    async (key: string) => {
      if (key === activeKey) return;
      if (dirty) {
        const ok = await confirm({
          title: "Discard unsaved changes?",
          description: "You edited this section but haven't saved. Switching sections discards those edits.",
          confirmLabel: "Discard and switch",
          cancelLabel: "Keep editing",
          tone: "danger",
        });
        if (!ok) return;
        discardAll();
      }
      onNavigate(key);
    },
    [activeKey, dirty, confirm, discardAll, onNavigate],
  );

  const all = groups.flatMap((g) => g.items);
  const active = all.find((i) => i.key === activeKey) ?? all[0];

  // A card whose title just repeats the section title ("Members" › "Members")
  // reads as a stutter. Hide that repeated title visually (screen readers
  // still get it). Sections render asynchronously, so watch the panel.
  const panelRef = useRef<HTMLDivElement>(null);
  const activeLabel = active?.label ?? "";
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const norm = (t: string | null | undefined) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const target = norm(activeLabel);
    const apply = () => {
      panel.querySelectorAll(":scope > * h2[data-settings-dup]").forEach((h) => h.removeAttribute("data-settings-dup"));
      const cards = Array.from(panel.children);
      if (cards.length !== 1) return;
      const h2 = cards[0].querySelector("h2");
      const text = norm(h2?.textContent);
      if (h2 && text && (text === target || target.startsWith(text) || text.startsWith(target))) {
        h2.setAttribute("data-settings-dup", "");
      }
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(panel, { childList: true, subtree: false });
    return () => mo.disconnect();
  }, [activeLabel]);
  const labels = Object.fromEntries(all.map((i) => [i.key, i.label]));

  return (
    <SettingsFormsContext.Provider value={ctx}>
      <div
        data-settings-workspace=""
        className="flex min-w-0 flex-col gap-5 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-7 xl:grid-cols-[13.125rem_minmax(0,45rem)] lg:pl-1"
      >
        {/* ── Settings column ── */}
        <div className="flex min-w-0 flex-col lg:sticky lg:top-0">
          <h1 className="text-title-md font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-caption text-ink-tertiary">{subtitle}</p> : null}

          <nav aria-label={`${title} sections`} className="mt-4 hidden lg:block">
            {groups.map((g, gi) => (
              <div key={g.label} className={gi === 0 ? "" : "mt-4"}>
                <p className="px-2.5 pb-1.5 text-micro font-semibold tracking-[0.16em] text-ink-tertiary uppercase">
                  {g.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const on = item.key === active?.key;
                    return (
                      <li key={item.key}>
                        <a
                          href={hrefFor(item.key)}
                          aria-current={on ? "page" : undefined}
                          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            void go(item.key);
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-control px-2.5 py-[7px] text-body-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                            on
                              ? "bg-card font-semibold text-link shadow-card ring-1 ring-border"
                              : "text-ink-secondary hover:bg-card/70 hover:text-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.locked ? (
                            <Lock className="size-3.5 shrink-0 text-ink-tertiary" aria-label="Locked by your agency" />
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {footer ? <div className="mt-5 border-t border-border px-2.5 pt-3 text-caption text-muted-foreground">{footer}</div> : null}
          </nav>

          {/* Tablet + phone: one grouped picker instead of a second rail. */}
          <div className="mt-3 lg:hidden">
            <Select
              value={active?.key}
              onValueChange={(v) => typeof v === "string" && void go(v)}
              items={labels}
            >
              <SelectTrigger aria-label={`${title} section`} className="h-(--ds-control-lg) bg-card shadow-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[70dvh]">
                {groups.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectGroupLabel>{g.label}</SelectGroupLabel>
                    {g.items.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        <span className="flex items-center gap-2">
                          {item.label}
                          {item.locked ? <Lock className="size-3.5 text-ink-tertiary" aria-label="Locked by your agency" /> : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {footer ? <div className="mt-2 text-caption text-muted-foreground">{footer}</div> : null}
          </div>
        </div>

        {/* ── Section ── */}
        <section aria-labelledby="settings-section-title" className="flex min-w-0 flex-col gap-4">
          <header className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-caption text-ink-tertiary max-lg:hidden">
              {title}
              <ChevronRight className="size-3.5" aria-hidden="true" />
              <span className="font-medium text-ink-secondary">{active?.label}</span>
            </p>
            <h2 id="settings-section-title" className="text-title-md font-semibold tracking-tight text-foreground">
              {active?.label}
            </h2>
            {active?.description ? <p className="text-body-sm text-muted-foreground">{active.description}</p> : null}
          </header>
          <div ref={panelRef} data-settings-panel="" className="flex min-w-0 flex-col gap-4">
            {children}
          </div>
        </section>
      </div>

      {dirty ? (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-0 z-30 -mx-4 mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-6px_18px_rgb(42_18_82/0.06)] backdrop-blur max-md:bottom-[calc(var(--crm-mobile-tab-bar-h)+env(safe-area-inset-bottom))] md:-mx-6 md:px-8"
        >
          <span className="size-2 shrink-0 rounded-full bg-gold-300" aria-hidden="true" />
          <span className="text-body-sm font-semibold text-foreground">You have unsaved changes</span>
          <span className="text-caption text-muted-foreground">
            {dirtyIds.length} section{dirtyIds.length === 1 ? "" : "s"} edited
          </span>
          <span className="flex-1" />
          <Button variant="secondary" onClick={discardAll} disabled={saving}>
            Discard
          </Button>
          <Button onClick={saveAll} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Save changes
          </Button>
        </div>
      ) : null}
      {dialog}
    </SettingsFormsContext.Provider>
  );
}
