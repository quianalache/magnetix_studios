"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import type { ResolvedActionTargets, StyleConfig } from "@/types/pages-funnels-puck";
import { resolveActionLink } from "@/lib/pages-funnels/puck/action";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import { readableOn } from "@/lib/brand/tenant-brand";
import {
  NAV_COLLAPSE_MAX_WIDTH,
  NAV_CONTENT_MAX_WIDTH,
  normalizeNavigation,
  resolveNavColor,
  type NavigationLink,
  type NavigationValue,
} from "@/lib/pages-funnels/navigation";
import { cn } from "@/lib/utils";
import { useNavigationPreview } from "@/components/pages-funnels/puck/navigation-preview";

export interface NavigationRenderProps {
  id: string;
  ariaLabel?: unknown;
  logo?: unknown;
  items?: unknown;
  cta?: unknown;
  mobile?: unknown;
  navStyle?: unknown;
  style?: StyleConfig;
  resolved?: ResolvedActionTargets;
  brandKit?: readonly { id: string; hex: string }[];
  /** In the builder: links render without an href, so a click never navigates the editor away. */
  editing?: boolean;
}

/**
 * Navigation block (Wave 2B-1). One native block — logo, menu items,
 * one-level dropdowns, optional CTA — rendered as a `<nav>` landmark.
 *
 * Responsive switch is pure CSS, scoped to this block (no resize listeners):
 * above the collapse width the horizontal menu shows; below it, a hamburger
 * toggles an in-flow menu panel (no overlay, no focus trap).
 *
 * Dropdowns follow the disclosure pattern: the parent is a real <button>
 * with aria-expanded/aria-controls that opens its list (click, Enter/Space,
 * or mouse hover as an enhancement). The parent itself never navigates.
 * Escape closes and returns focus to the button that opened it; clicking
 * outside closes. One document listener exists only while something is open.
 *
 * Links render through the shared `resolveActionLink`, so Page targets are
 * same-tenant published URLs, URLs pass the safe-scheme check, and a missing
 * target renders as an inert label — never a broken or foreign link.
 */
export function NavigationRender(props: NavigationRenderProps) {
  const nav = normalizeNavigation(props as unknown as Record<string, unknown>);
  const { id, resolved, editing = false } = props;
  const reactId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dropdownButtons = useRef(new Map<string, HTMLButtonElement>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The dropdown a mouse hover opened: the click that follows keeps it open instead of toggling it shut.
  const hoverOpened = useRef<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({});
  // Builder only: the Settings panel can preview a dropdown / the mobile menu open (canvas clicks don't reach the block).
  const preview = useNavigationPreview(id, editing);
  const shownDropdown = openDropdown ?? preview.dropdownId;
  const shownMobile = mobileOpen || preview.mobileOpen;
  const mobileItemOpen = (itemId: string) => !!mobileExpanded[itemId] || preview.dropdownId === itemId;

  const closeAll = useCallback(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, []);

  // Listeners exist only while a dropdown or the mobile menu is open: an
  // outside click closes, and so does Escape when focus is elsewhere (the
  // nav's own onKeyDown handles Escape inside it and returns focus).
  useEffect(() => {
    if (!openDropdown && !mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeAll();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDropdown, mobileOpen, closeAll]);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (openDropdown) {
      event.stopPropagation();
      const button = dropdownButtons.current.get(openDropdown);
      setOpenDropdown(null);
      button?.focus();
    } else if (mobileOpen) {
      event.stopPropagation();
      setMobileOpen(false);
      toggleRef.current?.focus();
    }
  };

  const brandKit = props.brandKit;
  const style = nav.navStyle;
  const bg = resolveNavColor(style.background, brandKit);
  const link = resolveNavColor(style.linkColor, brandKit) ?? (bg ? readableOn(bg) : null);
  const cta = resolveNavColor(style.ctaColor, brandKit);
  const scope = `[data-nav-root="${cssId(id)}"]`;
  const collapse = NAV_COLLAPSE_MAX_WIDTH[nav.mobile.collapseAt];
  const css = `${scope} [data-nav-desktop]{display:flex}${scope} [data-nav-toggle]{display:none}
@media (max-width:${collapse}px){${scope} [data-nav-desktop]{display:none}${scope} [data-nav-toggle]{display:inline-flex}}
@media (min-width:${collapse + 1}px){${scope} [data-nav-mobile-panel]{display:none!important}}`;
  const responsiveCss = resolveResponsiveCss(id, props.style);

  const visible = (l: NavigationLink) => editing || l.label.length > 0;
  const items = nav.items.filter((item) =>
    item.kind === "link" ? visible(item) : editing || (item.label.length > 0 && item.children.some(visible)),
  );
  const ctaShown = nav.cta.enabled && (editing || nav.cta.label.length > 0);
  const empty = !nav.logo.src && items.length === 0 && !ctaShown;
  const panelBg = bg ?? "white";

  const rootStyle: CSSProperties = {
    ...resolveBaseStyleProps(props.style),
    ...(bg ? { backgroundColor: bg } : {}),
    ...(link ? { color: link } : {}),
  };

  return (
    <nav
      ref={rootRef}
      id={id}
      aria-label={nav.ariaLabel}
      data-nav-root={cssId(id)}
      data-navigation=""
      onKeyDown={onKeyDown}
      className={cn("relative w-full", style.divider && "border-b border-black/10")}
      style={rootStyle}
    >
      <style dangerouslySetInnerHTML={{ __html: css + (responsiveCss ?? "") }} />
      <div
        className="mx-auto flex w-full items-center gap-6 px-6"
        style={{ maxWidth: NAV_CONTENT_MAX_WIDTH[style.width], paddingTop: style.paddingY, paddingBottom: style.paddingY }}
      >
        <Logo logo={nav.logo} editing={editing} />
        <div
          data-nav-desktop=""
          className={cn(
            "min-w-0 flex-1 items-center gap-6",
            style.menuAlign === "left" ? "justify-start" : style.menuAlign === "center" ? "justify-center" : "justify-end",
          )}
        >
          <ul className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-6 gap-y-2 p-0">
            {items.map((item) =>
              item.kind === "link" ? (
                <li key={item.id} data-nav-item={item.id}>
                  <NavLink link={item} resolved={resolved} editing={editing} className="text-base font-medium hover:opacity-75" onActivate={closeAll} />
                </li>
              ) : (
                <li
                  key={item.id}
                  data-nav-item={item.id}
                  className="relative"
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    if (openDropdown !== item.id) hoverOpened.current = item.id;
                    setOpenDropdown(item.id);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    hoverTimer.current = setTimeout(() => {
                      hoverOpened.current = null;
                      setOpenDropdown((cur) => (cur === item.id ? null : cur));
                    }, 150);
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenDropdown((cur) => (cur === item.id ? null : cur));
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) dropdownButtons.current.set(item.id, el);
                      else dropdownButtons.current.delete(item.id);
                    }}
                    aria-expanded={shownDropdown === item.id}
                    aria-controls={`${reactId}-${item.id}-menu`}
                    data-nav-dropdown={item.id}
                    onClick={() => {
                      const keepOpen = hoverOpened.current === item.id && openDropdown === item.id;
                      hoverOpened.current = null;
                      if (!keepOpen) setOpenDropdown(openDropdown === item.id ? null : item.id);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-base font-medium text-inherit hover:opacity-75"
                  >
                    {item.label || <Placeholder>Dropdown</Placeholder>}
                    <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", shownDropdown === item.id && "rotate-180")} />
                  </button>
                  <div className="absolute left-0 top-full z-50 pt-2" hidden={shownDropdown !== item.id}>
                    <ul
                      id={`${reactId}-${item.id}-menu`}
                      data-nav-submenu={item.id}
                      className="m-0 min-w-48 list-none rounded-xl border border-black/10 p-1.5 shadow-lg"
                      style={{ backgroundColor: panelBg }}
                    >
                      {item.children.filter(visible).map((child) => (
                        <li key={child.id} data-nav-child={child.id}>
                          <NavLink link={child} resolved={resolved} editing={editing} className="block rounded-lg px-3 py-2 text-sm hover:bg-black/5" onActivate={closeAll} />
                        </li>
                      ))}
                      {editing && item.children.length === 0 ? (
                        <li className="px-3 py-2 text-sm opacity-60">No sub-items yet</li>
                      ) : null}
                    </ul>
                  </div>
                </li>
              ),
            )}
            {editing && empty ? <li className="text-sm opacity-60">Add a logo and menu items in Settings</li> : null}
          </ul>
          {ctaShown ? <CtaButton nav={nav} color={cta} resolved={resolved} editing={editing} onActivate={closeAll} /> : null}
        </div>
        <button
          ref={toggleRef}
          type="button"
          data-nav-toggle=""
          aria-expanded={shownMobile}
          aria-controls={`${reactId}-mobile`}
          aria-label={shownMobile ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((open) => !open)}
          className="ml-auto size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-inherit hover:bg-black/5"
        >
          {shownMobile ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
        </button>
      </div>
      <div
        id={`${reactId}-mobile`}
        data-nav-mobile-panel=""
        hidden={!shownMobile}
        className="border-t border-black/10 px-6 pb-5 pt-2"
        style={{ backgroundColor: panelBg }}
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item) =>
            item.kind === "link" ? (
              <li key={item.id} data-nav-mobile-item={item.id} className="border-b border-black/5">
                <NavLink link={item} resolved={resolved} editing={editing} className="block py-3 text-base font-medium" onActivate={closeAll} />
              </li>
            ) : (
              <li key={item.id} data-nav-mobile-item={item.id} className="border-b border-black/5">
                <button
                  type="button"
                  aria-expanded={mobileItemOpen(item.id)}
                  aria-controls={`${reactId}-${item.id}-mobile-menu`}
                  data-nav-mobile-dropdown={item.id}
                  onClick={() => setMobileExpanded((cur) => ({ ...cur, [item.id]: !cur[item.id] }))}
                  className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-0 py-3 text-left text-base font-medium text-inherit"
                >
                  {item.label || <Placeholder>Dropdown</Placeholder>}
                  <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", mobileItemOpen(item.id) && "rotate-180")} />
                </button>
                <ul id={`${reactId}-${item.id}-mobile-menu`} hidden={!mobileItemOpen(item.id)} className="m-0 list-none pb-2 pl-4">
                  {item.children.filter(visible).map((child) => (
                    <li key={child.id} data-nav-mobile-child={child.id}>
                      <NavLink link={child} resolved={resolved} editing={editing} className="block py-2 text-base" onActivate={closeAll} />
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
        {ctaShown ? (
          <div className="mt-4">
            <CtaButton nav={nav} color={cta} resolved={resolved} editing={editing} onActivate={closeAll} block />
          </div>
        ) : null}
      </div>
    </nav>
  );
}

/** Puck ids are url-safe already; this keeps the CSS attribute selector safe regardless. */
function cssId(id: string) {
  return id.replace(/[^A-Za-z0-9_-]/g, "");
}

function Placeholder({ children }: { children: string }) {
  return <span className="opacity-60">{children}</span>;
}

function Logo({ logo, editing }: { logo: NavigationValue["logo"]; editing: boolean }) {
  if (!logo.src) {
    return editing ? (
      <span data-nav-logo="" className="shrink-0 rounded-md border border-dashed border-black/20 px-3 py-1.5 text-sm opacity-60">
        Logo
      </span>
    ) : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- customer-provided logo URL, same as the Image block
    <img
      data-nav-logo=""
      src={logo.src}
      alt={logo.alt}
      className="block w-auto shrink-0 object-contain"
      style={{ height: logo.height, maxWidth: "min(320px, 55vw)" }}
    />
  );
}

function NavLink({
  link,
  resolved,
  editing,
  className,
  onActivate,
}: {
  link: NavigationLink;
  resolved?: ResolvedActionTargets;
  editing: boolean;
  className: string;
  onActivate: () => void;
}) {
  const target = resolveActionLink(link.action, { resolved, editing });
  return (
    <a
      href={target.href ?? undefined}
      target={target.href && target.newTab ? "_blank" : undefined}
      rel={target.href && target.newTab ? "noreferrer" : undefined}
      aria-disabled={!target.href || undefined}
      data-nav-link={link.id}
      onClick={target.href ? onActivate : undefined}
      className={cn("text-inherit no-underline", className)}
    >
      {link.label || <Placeholder>Menu item</Placeholder>}
    </a>
  );
}

function CtaButton({
  nav,
  color,
  resolved,
  editing,
  onActivate,
  block = false,
}: {
  nav: NavigationValue;
  color: string | null;
  resolved?: ResolvedActionTargets;
  editing: boolean;
  onActivate: () => void;
  block?: boolean;
}) {
  const target = resolveActionLink(nav.cta.action, { resolved, editing });
  const outline = nav.cta.variant === "outline";
  const colored: CSSProperties | undefined = color
    ? outline
      ? { borderColor: color, color }
      : { backgroundColor: color, color: readableOn(color) }
    : undefined;
  return (
    <a
      href={target.href ?? undefined}
      target={target.href && target.newTab ? "_blank" : undefined}
      rel={target.href && target.newTab ? "noreferrer" : undefined}
      aria-disabled={!target.href || undefined}
      data-nav-cta=""
      onClick={target.href ? onActivate : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold no-underline shadow-sm transition-opacity hover:opacity-90",
        block && "w-full",
        !color && (outline ? "border border-primary text-primary" : "bg-primary text-primary-foreground"),
        color && outline && "border",
      )}
      style={colored}
    >
      {nav.cta.label || <Placeholder>Button</Placeholder>}
    </a>
  );
}
