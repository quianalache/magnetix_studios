# Magnetix Studios — Design System & UI Implementation Rules

> **Canonical document.** Reviewed against `origin/main` at `f1b6f73` (2026-10-26), which includes the Builder Capability Expansion (white page default, Section width controls, Button actions).
> Companion to `CLAUDE.md` → "Magnetix design system (Visual Direction 2)" and `AGENTS.md` → "Design system".
> When this file and those sections disagree, raise it with the owner. Don't silently pick one. Known stale wording in those files is listed in §22.

---

## 0. Instructions for coding agents (read first)

This document is the canonical Magnetix Studios visual and product implementation reference.

### The canonical rule for design-sensitive Magnetix work

1. **Read `docs/MAGNETIX_DESIGN_SYSTEM.md` first.**
2. **Inspect the closest canonical current implementation** (§20) before writing new markup.
3. **Reuse existing components, tokens and patterns** (`src/components/ui`, `src/components/system`, `src/styles/magnetix/`).
4. **Don't create a new visual language** unless the owner explicitly approves one. Visual Direction 2 is locked.
5. **If current code conflicts with this document, surface the conflict** in your report instead of silently picking one. Known conflicts are in §22.
6. **Explicit product requirements may override general rules** (for example, Reading Result pages, the Pages & Funnels canvas and tenant surfaces have their own rules; see §11–§14).
7. **Desktop + tablet + mobile QA is part of completion** (§10). Desktop-only is not done.
8. **Operational UI, moment/expressive UI and customer-authored page content are different design territories.** Don't conflate them (table below).

### Evidence labels used throughout

| Label | Meaning |
|---|---|
| **[IMPLEMENTED]** | True in code on `origin/main` today, with a path you can open. |
| **[PRINCIPLE]** | A design rule that guides decisions. It may be partly enforced by code. |
| **[EXCEPTION]** | A documented, deliberate departure from a general rule. |
| **[OWNER DIRECTION]** | Established by the owner but not fully represented or enforced in code yet. |
| **[FUTURE]** | Planned or deferred. **Does not exist yet.** Don't build against it as if it did. |

### The three UI territories

Each territory follows different rules. Before you build anything, decide which one you're working in.

| Territory | What it is | Whose style governs | Scope class |
|---|---|---|---|
| **A. Operational / product UI** | The CRM: agency pages, sub-account pages, settings, inbox, pipeline, tables, builder **chrome**, MyMagnetix member area | The fixed Magnetix system (this document) | `.mx-crm` via `<CrmScope>` |
| **B. Expressive / moment UI** | Approved "moment" surfaces inside A (Dashboard hero, Decoder editorial surfaces, selected index pages, success/first-run states) and Magnetix-owned public brand moments | Magnetix system **plus** the moment allowances (DM Serif Display, motifs, hero wash) | `.mx-crm` (+ `PageHeader variant="moment"`, `MomentHero`, `Motif`) |
| **C. Customer-authored / tenant content** | Pages & Funnels page content, Reading Result page content, booking, hosted forms, quotes, community/course public pages, portal, web chat | The **tenant's** brand and the page author's choices. Magnetix owns structure, safety and a11y, not the palette | none, or `.tenant-surface` |

---

## 1. Design philosophy (Visual Direction 2)

**Source:** the owner-approved *"Magnetix Visual Direction 2 — System Proof"* (2026-10-13), implemented in Phase 0/1 (tokens, primitives, composites), the proof pages (2026-10-14) and then module-by-module migration waves (Wave 1–4, CRM-wide cleanup `ca84c95`, Tenant/public `24ad092`, New Builder chrome `1a2077b`, Agency `abff0d4`).

### 1.1 Principles, translated into rules

| Principle | Concrete rule |
|---|---|
| **White / near-white operational canvas** [IMPLEMENTED] | Page background is `--ds-surface-canvas` (`#fbf9fe`). Content surfaces are white (`--ds-surface-raised`, `#ffffff`) with a 1px `--border` (`#ece7f4`). Never put an operational page on a tinted or gradient background. |
| **Deep plum navigation and primary actions** [IMPLEMENTED] | Sidebar = plum gradient `#3d1652 → #2a0f3a`. `<Button>` default = `--primary` = plum‑900 `#3d1652`. Outgoing message bubbles and the index-table header band are also plum. |
| **Royal violet is supporting, not primary** [IMPLEMENTED] | Violet (`#6d28d9` / `#5b21b6`) is for focus rings, selected states, links and switch-on. Never use it as a primary button fill. |
| **Restrained borders** [IMPLEMENTED] | 1px, `border-border` (`#ece7f4`). Use `border-border-subtle` (`#f2eef7`) for row dividers and `border-border-strong` (`#e0d9ec`) for inputs and hover. No 2px decorative borders on cards. |
| **Restrained, soft shadows** [IMPLEMENTED] | Cards use `shadow-card` (two very low-alpha plum-tinted layers). Hover/lift uses `shadow-pop`. Overlays use `shadow-overlay`. No heavy drop shadows and no coloured glows in operational UI. |
| **"Denser work, quieter art"** [PRINCIPLE] | Operational screens put useful density first: 38px controls, 13–14px body, 10.5px table headings, 24px between page sections. Decoration (motifs, serif display, washes) is reserved for moment surfaces and appears **at most once per page**. See §16. |
| **Calm and useful over decorative** [PRINCIPLE] | Colour carries information (status, category, chart series) in small doses: chips, pills, tags, icons. It doesn't paint big areas. |
| **No giant lavender/purple content slabs** [IMPLEMENTED + enforced] | Tints (`bg-tint-violet` etc.) are for **one** featured card or section, never a page background, never nested in another tint. `.momentum-scope` (lavender-on-lavender legacy theme) is frozen and ratcheted (§19). |
| **No purple-on-purple** [IMPLEMENTED] | Don't put purple text on lavender fills or lavender inside lavender. Text on a tint stays `--foreground` / `--muted-foreground`. Tag/status fg+bg pairs are pre-matched tokens. Use them as a pair. |
| **Plum acts; green is never a primary action** [OWNER DIRECTION + IMPLEMENTED] | Deep plum is the operational action colour. Green may be **semantic success** (published, live, paid, connected, verified) and may also be used **intentionally in charts, data visualization, category/tag systems, encoded metrics and other specialized information systems**. Green must not become a general primary-action colour, and avoid large decorative green operational surfaces unless a specialized experience is explicitly designed that way. See §2.8. |
| **Expressive design has its place** [PRINCIPLE] | Moments (Dashboard hero, Decoder editorial, Reading experiences, public brand pages, success states) may use DM Serif Display, a motif and a wash. This must not leak into records, settings, inbox, pipeline, builders or dense tools. |
| **Customer content isn't CRM chrome** [PRINCIPLE] | Tenant surfaces and authored page content follow the tenant's brand/author's choices. Don't force plum/violet onto them (§11, §13). |
| **Light mode only** [IMPLEMENTED] | CRM routes force light (`src/lib/theme/crm-theme.ts`). `.dark` tokens exist but are dormant. **[FUTURE]** Dark mode needs its own design task. Don't add dark styles. |

### 1.2 One internal visual system

[IMPLEMENTED] Agency and sub-account pages use the **same** components and tokens. There is **no app-theme picker**. `agencies/{id}.appTheme` is inert, and the `theme-green` / `theme-leadstack` / `theme-magnetix` classes are retired. `<CrmScope>` ([crm-scope.tsx](../src/components/theme/crm-scope.tsx)) server-renders a `display: contents` `.mx-crm` wrapper and mirrors the class onto `<html>` so portalled dialogs, sheets, menus and toasts inherit it. Public and tenant pages never get `.mx-crm`, which is why it's a scope and not `:root`.

---

## 2. Color system

All colors live in [src/styles/magnetix/](../src/styles/magnetix/). The layers are:

| Layer | File | Contents |
|---|---|---|
| L1 system tokens | `tokens.css` | Raw palette (`--color-*`), type scale, radii, shadows, page widths, control/icon sizes, z-index. Registered with Tailwind `@theme static`, so utilities like `bg-plum-900` and `text-title-lg` exist. |
| L2 semantic tokens | `semantic.css` | `--ds-*` surfaces, text, borders, actions, status, tags, table head, switch, chart, bubbles. Exposed as utilities (`bg-status-success-bg`, `text-ink-secondary`, `bg-tint-violet`, …). Also holds the `:root` neutral shadcn defaults and the **`.mx-crm`** mapping of shadcn variables → semantic tokens. |
| L3 tenant tokens | `tenant.css` | `--brand-*`, **only** inside `.tenant-surface`. |
| Legacy | `legacy.css` | Frozen `.momentum-scope`, `.content-sets-scope`, the Community bridge and Settings panel normalizers. |

**Rule [IMPLEMENTED + enforced]:** never hard-code a hex in a component. If no token fits, add one with a **semantic** name to `semantic.css` (or a raw one to `tokens.css`). The drift ratchet counts `hexInTsx` and fails if it rises (§19).

### 2.1 Brand palette (L1, `tokens.css`)

| Family | Tokens (value) | Role |
|---|---|---|
| **Plum** (primary) | `plum-50 #f7f1fa` · `100 #efe2f4` · `300 #c79bd8` · `500 #7a3794` · `700 #5e2574` · `800 #4a1870` · **`900 #3d1652`** · `950 #2a0f3a` | 900 = primary action + sidebar top; 800 = primary hover; 950 = sidebar bottom. |
| **Royal violet** (supporting) | `violet-ds-50 #f6f1ff` · `100 #eee6ff` · `300 #c9b6ff` · `600 #6d28d9` · `700 #5b21b6` | Focus ring (600), links + selected fg (700), selected bg (50), switch-on (600). |
| **Blush** | `blush-50 #fff6fa` · `blush-200 #fdd7e9` | Accent detail, motif colour, hero wash bloom. |
| **Pink / rosé** | `pink-ds-50 #fdeef5` · `pink-ds-600 #c42a7b` | Tag/chip accent. |
| **Aqua** | `aqua-50 #e3f6f7` · `aqua-300 #9edbdd` ("Aqua Glow", progress fill) · `aqua-600 #0b8a96` | Tag/chip accent, progress, sidebar focus ring. |
| **Gold** | `gold-50 #fef5e2` · `gold-300 #f2c46f` · `gold-600 #b7791f` | Tag/chip accent, motif rings, internal-note bubble. |
| **Periwinkle** | `periwinkle-50 #eceeff` · `periwinkle-600 #4450c9` | "Info" status and blue tag. |
| **Legacy brand constants** (in `.mx-crm`) | `--mx-lavender-mist #edd9ec`, `--mx-rose-quartz #e8b7c8`, `--mx-blush-veil #f3d9d7`, `--mx-aqua-glow #9edbdd`, `--mx-purple #5e2574` | Only kept for the sidebar active indicator (rose‑quartz → aqua bar) and the **frozen** Dashboard gradient helpers. No new uses. |

### 2.2 Neutrals and text

| Token | Value | Use |
|---|---|---|
| `--color-canvas` → `--ds-surface-canvas` → `--background` (in `.mx-crm`) | `#fbf9fe` | Page canvas |
| `--color-surface` → `--ds-surface-raised` → `--card`, `--popover` | `#ffffff` | Cards, panels, popovers |
| `--ds-surface-sunken` → `--muted`, `--secondary` | `#f7f5fa` | Wells, footers, disabled input fill, hover |
| `--color-ink` → `--foreground` | `#1f1b3a` | Primary text |
| `--color-ink-2` → `--muted-foreground` | `#5e5879` | Secondary text |
| `--color-ink-3` → `text-ink-tertiary` | `#736d8f` | Tertiary text (≥ 4.5:1 on white per the token comment) |
| `--ds-text-link` → `text-link` | `#5b21b6` | Links, eyebrow labels |
| `--ds-border-subtle` | `#f2eef7` | Row dividers |
| `--color-line` → `--border` | `#ece7f4` | Default border |
| `--color-line-strong` → `--input` | `#e0d9ec` | Input borders, hover borders |

### 2.3 Supporting surface tints

`bg-tint-violet #faf7ff`, `bg-tint-blush #fff9fb`, `bg-tint-aqua #f7fcfc`, `bg-tint-gold #fffcf5`.
**Rule [IMPLEMENTED in `Card variant="tint"` docs]:** use them for ONE featured card or section. Never as a page background, and never nested inside another tint.

### 2.4 Semantic status (state) and tags (category)

| Status tone | bg / fg / dot | Typical words (`STATUS_TONE` in [status-pill.tsx](../src/components/system/status-pill.tsx)) |
|---|---|---|
| success | `#dcf7ec` / `#0b5d45` / `#10b464` | active, live, published, paid, won, completed |
| warning | `#fef2d3` / `#7a3d00` / `#f59e0b` | draft, pending, needs attention |
| danger | `#fdecec` / `#c21f1f` / `#e5484d` | failed, error, overdue, lost, canceled |
| info | `#eceeff` / `#4450c9` / `#5b6cf0` | sent, open |
| scheduled | `#f4ebfe` / `#4a16b0` / `#7e22ce` | scheduled, queued |
| neutral | `#f2f2f8` / `#55547f` / `#8b8aa8` | archived, inactive, paused |

Tags (`Tag`, no dot): violet, pink, aqua, gold, blue (periwinkle), green, gray. Each one uses a `*-50` bg with a `*-600/700` fg. `tagColorFor(label)` hashes a label to a stable colour, so lists rotate families and never read all-purple.

**Rule [IMPLEMENTED]:** `StatusPill` = **state**, semantic colours, always with a dot. `Tag` = **category**, rotating accents, no dot. **Never use a tag colour to imply state.**

### 2.5 Destructive, warning, success (actions and alerts)

- `--destructive` (in `.mx-crm`) = `danger-700 #c21f1f`. The `destructive` button variant is a **soft** red (`bg-destructive/10 text-destructive`), not a solid red fill.
- `Alert` tones: `info | warning | success | danger | neutral`, built on the status tokens ([alert.tsx](../src/components/ui/alert.tsx)).
- Toasts: `sonner` `<Toaster position="top-right" richColors closeButton />` ([providers.tsx](../src/components/providers.tsx)).

### 2.6 Charts, messaging, switch, table head

- **CRM analytics chart palette** `--ds-chart-1…8`: `#6d28d9, #14a7b4, #db4a93, #5563e0, #e3a63b, #16a34a, #c79bd8, #8e88a8`. **[EXCEPTION]** Reading chart *renderers* (Human Design, astrology, mandala, Gene Keys) keep their own colours, controlled by Chart Designs.
- Bubbles: outgoing = plum `#3d1652` / white text. Incoming = white with border. Internal note = gold‑50 `#fef5e2` bg, `#ebcf92` border, `#6b4a08` text.
- Switch: off `#dcd6e6`, on violet‑600.
- Index table head band: plum‑900 bg, `#ede0ef` text.

### 2.7 Combinations: do / don't

| ✅ Do | ❌ Don't |
|---|---|
| Plum button on a white card | Violet, pink or green primary button |
| Tag fg on its own tag bg | Mixing a tag fg with another family's bg |
| Small tinted icon chip on a white card | A full lavender card containing more lavender cards |
| Body text in `--foreground` on a tint | Purple body text on lavender |
| Success green on a "Published" pill | Green on a "Save" or "Create" button |
| Green as one series in a chart, a `Tag`, or a `MetricCard tone` | A large green banner or slab on an operational page |
| Colour + text/icon for every state | Colour as the only indicator (§18) |

### 2.8 The green rule [OWNER DIRECTION, final]

- **Deep plum** is the primary Magnetix operational action colour.
- **Green must not become a general primary-action colour.** There is no green `Button` variant, and none should be added.
- **Green may be used for semantic success** (`StatusPill` success tone, `Alert tone="success"`, success toasts).
- **Green may also be used intentionally** in charts and data visualization (`--ds-chart-6`), category/tag systems (the `green` `Tag` family, `tagColorFor()`), encoded metrics (`MetricCard tone="green"`, e.g. Dashboard "won"/"paid", Growth "Income this month") and other specialized information systems. These existing uses are **legitimate**, not violations.
- **Avoid large decorative green operational surfaces** unless a specialized experience is explicitly designed that way.

---

## 3. Typography

### 3.1 Families

| Token | Stack | Use | Status |
|---|---|---|---|
| `--font-sans` (`font-sans`, the `html` default) | `ui-sans-serif, system-ui, sans-serif, emoji…` (**native system font**, no webfont) | **All operational UI** | [IMPLEMENTED] `src/app/globals.css` |
| `--font-mono` | `ui-monospace, "SF Mono", …` (native) | Code, ids | [IMPLEMENTED] |
| `--font-display` (`font-display`) | DM Serif Display (`next/font`, `--font-dm-serif-display`) → Georgia | **Approved moment pages only** | [IMPLEMENTED] `tokens.css`, `layout.tsx` |
| `--font-serif` | Instrument Serif | **Implementation/legacy detail.** Still loaded, with ~12 legacy `font-serif` usages; it doesn't control operational typography. No new uses. | Legacy, see §22 C3 |
| Geist / Geist Mono | **Implementation/legacy detail.** Still loaded in `src/app/layout.tsx` but **not** mapped to `--font-sans` / `--font-mono`, so it controls nothing | Don't use | Legacy, see §22 C3 |

**Canonical typography rule [OWNER DIRECTION, final]:** operational Magnetix UI uses the current **system sans stack** (`--font-sans`). DM Serif Display is reserved for intentional expressive/moment use. Don't use DM Serif for ordinary CRM headings, controls, settings, tables, builder chrome or routine operational screens. The Geist / Instrument Serif references in `CLAUDE.md` → Tech Stack are stale (§22 C3) and are follow-up alignment work.

### 3.2 The DM Serif Display rule

**[IMPLEMENTED + OWNER DIRECTION]** DM Serif Display is for **intentional expressive/moment use only**:

- ✅ Sub-account Dashboard header and hero (`PageHeader variant="moment"`, `MomentHero`)
- ✅ Energetic Decoder editorial surfaces (Content Sets titles, reading workspace)
- ✅ Selected index/landing moments (Assets) and public brand moments (e.g. MyMagnetix Mindset card)
- ❌ Records, settings, inbox/conversations, pipeline, tables, forms, dialogs, **builders** (incl. the Pages & Funnels chrome), dense tools, buttons, labels, tabs

How to get it: use `PageHeader variant="moment"`, which owns the serif `<h1>`. Don't add `font-display` to an operational heading. Current `font-display` users: [page-header.tsx](../src/components/system/page-header.tsx), [moment-hero.tsx](../src/components/system/moment-hero.tsx), [human-design-reading-workspace.tsx](../src/components/energetic-decoder/human-design-reading-workspace.tsx), [mindset-card.tsx](../src/components/mymagnetix/mindset-card.tsx). Content Sets uses a second DM Serif instance via [src/lib/fonts/display-serif.ts](../src/lib/fonts/display-serif.ts) (see §14, §22 C4).

### 3.3 Type scale (`tokens.css`, Tailwind utilities)

| Utility | Size / line-height | Use |
|---|---|---|
| `text-display-xl` | 48px / 1.05 | Moment hero (rare) |
| `text-display-lg` | 40px / 1.05 | Moment page `<h1>` ≥ sm |
| `text-display-md` | 34px / 1.1 | Moment page `<h1>` on phones |
| `text-title-lg` | 24px / 1.25 | **Operational page `<h1>`** (`PageHeader` default, semibold, tight tracking) |
| `text-title-md` | 20px / 1.3 | Sub-page or large dialog titles |
| `text-section` | 15px / 1.4 | Section/card titles (`SectionHeader`, `CardTitle`), semibold |
| `text-body` | 14px / 1.5 | Default body (inputs are `md:text-sm` = 14px) |
| `text-body-sm` | 13px / 1.45 | Dense body, table cells, descriptions |
| `text-caption` | 12px / 1.4 | Meta, pills, tags, breadcrumbs, helper text |
| `text-micro` | 11px / 1.3 | Eyebrows, bottom-tab labels, footers |
| `text-th` | 10.5px / 1.3 | Table column headings (uppercase, `tracking-[0.08em]`) |
| `text-overline` | 10px / 1.3 | Letter-spaced group labels (Settings nav, sidebar sections) |

**Rules:**
- [IMPLEMENTED + enforced] **No arbitrary font sizes** (`text-[13px]`). Use the scale. The ratchet counts `arbitraryFontSize` (baseline 761, may only go down).
- [IMPLEMENTED + enforced] **One `<h1>` per page, owned by `PageHeader`.** Raw `<h1 className=…>` is ratcheted (`rawH1ClassName` 120).
- If you add a new scale name, also register it in `cn()` ([src/lib/utils.ts](../src/lib/utils.ts)) so `tailwind-merge` understands it.
- Buttons are `text-sm font-medium` (14px). The `sm` button is 13px.
- Inputs are `text-base` on phones and `md:text-sm` from 768px. The 16px on phones stops iOS zoom-on-focus. Keep it.

---

## 4. Surfaces, cards and panels

### 4.1 Canvas and containers

- [IMPLEMENTED] CRM `<main>` ([src/app/(dashboard)/layout.tsx](<../src/app/(dashboard)/layout.tsx>)): `p-4` (16px) on phones, `md:p-6` (24px). `pb-24` on phones to clear the bottom tab bar.
- [IMPLEMENTED] **`PageShell`** ([page-shell.tsx](../src/components/system/page-shell.tsx)) is the one page container. It adds `lg:px-1` (≈28px at desktop) and a **24px (`gap-6`)** gap between top-level sections:

| `width` | Max | Use |
|---|---|---|
| `form` | 48rem (768px) | Forms, settings, editors, chat, feeds |
| `data` (default) | 64rem (1024px) | Tables, dashboards, calendars, reports, list pages |
| `wide` | 80rem (1280px) | Contacts list + profile only |
| `full` | none | Pipeline (Kanban), builders |

**Rule:** use the **same** width for every return of a page (loading, empty, locked, not-found) so the width never jumps. Use `PageShellLoading width=…`. Don't invent a new width.

### 4.2 Cards

[IMPLEMENTED] `Card` ([card.tsx](../src/components/ui/card.tsx)): white `bg-card`, 1px `border-border`, `rounded-card` (16px), `shadow-card`, 16px vertical padding and 16px horizontal header padding (`size="sm"` → 12px).
- `variant="tint"` + `tint="violet|blush|aqua|gold"` — one featured card only.
- `variant="interactive"` — the whole card is clickable (hover `border-border-strong` + `shadow-pop`, focus ring).
- Related: `NavCard`, `RecordCard`, `MetricCard` in `src/components/system/`.

### 4.3 Settings panels

[IMPLEMENTED] `SettingsSection` ([settings-section.tsx](../src/components/system/settings-section.tsx)): one white card (`rounded-card`, border, `shadow-card`, `p-5`) with `SectionHeader`, fields, and an optional sunken footer (`bg-surface-sunken`, `border-t`) for a per-section Save. **Never tinted, never nested in a tint.**

[IMPLEMENTED] `SettingsWorkspace` ([settings-workspace.tsx](../src/components/system/settings-workspace.tsx)): main sidebar │ grouped Settings column │ one section at a time (`?section=key`, content ≤ 720px, left-aligned).
- ≥1280px: Settings column 210px. 1024–1279px: 176px.
- <1024px: the column collapses to the title plus one grouped section picker. No second rail.
- The Settings column sits **directly on the canvas** (no card). The selected item is white.
- Edit-then-save forms register with `useSettingsForm()` to get the sticky "You have unsaved changes · Discard · Save changes" bar.
- **Never** add a second tab row or a floating sub-nav card. Old `?tab=` links resolve via `requestedSection`.
- Legacy section cards are normalized inside `[data-settings-panel]` (legacy.css). **New** sections use `<SettingsSection>`.

### 4.4 Modals, drawers, popovers

[IMPLEMENTED] `Dialog` (Base UI): `rounded-xl`, `bg-background`, `ring-1 ring-foreground/10`, `p-4`, `max-w-[calc(100%-2rem)]` and `sm:max-w-sm` by default (widen with `className`). `AlertDialog` for confirmations, plus `ConfirmDialog` + **`useConfirm()`** ([confirm-dialog.tsx](../src/components/system/confirm-dialog.tsx)), which **replaces `window.confirm`** (ratcheted, baseline 9). `Sheet` for drawers (left/right `w-3/4 sm:max-w-sm`; bottom sheets on phones). `Popover`, `DropdownMenu` and `Tooltip` are in `components/ui`.

### 4.5 Radii and shadows

| Token | Value | Use |
|---|---|---|
| `rounded-card` | 1rem (16px) | Cards, panels, tables, empty states |
| `rounded-control` | 0.625rem (10px) | Notices, small framed controls |
| `rounded-chip` | 0.75rem (12px) | Icon chips |
| `rounded-lg` (`--radius` = 0.625rem) | 10px | Buttons, inputs, selects, nav items |
| `rounded-full` | — | Status pills, avatars, switch |
| `shadow-card` | `0 1px 2px rgb(42 18 82/.04), 0 6px 18px rgb(42 18 82/.05)` | Resting cards |
| `shadow-pop` | `0 4px 12px …/.08, 0 12px 32px …/.08` | Hover lift, menus |
| `shadow-overlay` | `0 2px 4px …/.05, 0 18px 48px …/.12` | Overlays (low adoption so far, §22 C8) |

### 4.6 Nesting rules: avoiding "box inside box inside box"

[PRINCIPLE, reflected in `SettingsWorkspace` + `SettingsSection` design]
1. **Max one bordered card level** on the canvas. Inside a card, separate groups with spacing, `border-t`/`divide-y`, or a `SectionHeader`. Don't add another bordered card.
2. **No tint inside a tint.** No card inside a tinted card.
3. **The page header isn't a card.** `PageHeader` sits on the canvas.
4. **Settings navigation isn't a card.** It sits on the canvas.
5. **Lists inside a card use row dividers** (`border-border-subtle`), not per-row cards. The one exception is phone layouts, where table rows become stacked "card rows" *instead of* the table (e.g. Agency → Sub-accounts).
6. **Don't wrap a single control in a card** just to give it a border.
7. **A card whose title repeats the section title** ("Members" › "Members") should drop its own heading. `SettingsWorkspace` dedupes via `data-settings-dup`.

**When NOT to use a card:** page headers, filter bars, tab strips, a lone empty state that already has its own dashed frame (`EmptyState`), and anything inside a table cell.

---

## 5. Buttons and action hierarchy

[IMPLEMENTED] `Button` ([button.tsx](../src/components/ui/button.tsx)), Base UI + `cva`. It renders a Link through `render={<Link …/>}`.

| Variant | Look | Use |
|---|---|---|
| `default` | **Deep plum** fill, white text, `shadow-xs` | The **one** primary action in a region (Save, Create, Publish, Send) |
| `secondary` | White, `border-input`, `shadow-xs` | Secondary actions (approved secondary = white with border, **no tinted fills**) |
| `outline` | `bg-background` + border | Toolbar actions (e.g. builder Preview / Save Draft) |
| `ghost` | Transparent, `hover:bg-muted` | Tertiary/inline actions, icon buttons in rows |
| `link` | Plum text, underline on hover | Text actions in prose |
| `destructive` | Soft red (`bg-destructive/10 text-destructive`) | Delete/remove. Pair with `useConfirm()` |

| Size | Height | Notes |
|---|---|---|
| `default` | 38px (`--ds-control-md`) | Standard |
| `sm` | 32px | Toolbars, dense rows, builder header |
| `xs` | 24px | Inline micro actions only |
| `lg` / `touch` | 44px (`--ds-control-lg`) | Phone-first primary actions, touch targets |
| `icon` / `icon-sm` / `icon-xs` / `icon-lg` | 32 / 28 / 24 / 36px | Icon-only. **Must have `aria-label`** |

- Radius `rounded-lg` (10px). Icons default to 16px (`size-4`) or 14px in `sm`. Use `data-icon="inline-start|inline-end"` for padding balance.
- Disabled: `opacity-50`, no pointer events. **Loading:** keep the label and prepend `<Loader2 className="size-4 animate-spin" />`, then disable (pattern: [editor-shell.tsx](../src/components/pages-funnels/puck/editor-shell.tsx) Save Draft / Publish).
- **Semantic success:** there is **no green button variant**. Show success through a `StatusPill`, an `Alert tone="success"` or a toast. Don't recolour the button.
- **One primary per region.** Two plum buttons side by side means the hierarchy is wrong.

**Don't create a new button style.** If a variant seems missing, compose from `buttonVariants` with layout-only classes. Never add colour classes like `bg-violet-600` or `bg-green-600`. Tenant surfaces get brand colour automatically, because `--primary` is remapped inside `.tenant-surface`.

---

## 6. Forms, inputs and selects

| Control | Component | Spec |
|---|---|---|
| Text input | `Input` ([input.tsx](../src/components/ui/input.tsx)) | 38px, `rounded-lg`, `border-input`, transparent bg, 16px on phones / 14px md+, violet focus ring (`ring-3 ring-ring/50`), `aria-invalid` → destructive border + ring, disabled → `bg-muted` |
| Textarea | `Textarea` | Same styling, `field-sizing-content`, min 64px. `DictationTextarea` exists for voice input |
| Label | `Label` | Always associate (`htmlFor` / wrapping) |
| Checkbox | `Checkbox` | 16px, plum when checked, with an enlarged invisible hit area (`after:-inset-x-3 -inset-y-2`) |
| Radio | `RadioGroup` | — |
| Toggle | `Switch` ([switch.tsx](../src/components/ui/switch.tsx)) | 36×20, white thumb, off `#dcd6e6`, **on violet** |
| Select (system) | `Select` ([select.tsx](../src/components/ui/select.tsx)) on Base UI, and **`OptionSelect`** ([option-select.tsx](../src/components/system/option-select.tsx)) for "pick one or none" | Trigger matches Input (38px / `sm` 32px). The list is a popover. Pass `items` so the trigger shows labels |
| Multi-select | `MultiSelect` | — |
| Native `<select>` | Styled globally in `.mx-crm` ([semantic.css](../src/styles/magnetix/semantic.css) end) | `appearance:none`, shared chevron, `padding-right: 2.25rem`. **The native picker is kept on purpose** (§6.1). `multiple`/`size` selects keep native rendering |
| Color / timezone | `ColorInput`, `TimezoneSelect` | Use these. Don't hand-roll |
| Search | `SearchField` ([search-field.tsx](../src/components/system/search-field.tsx)) | Leading icon, clear button, **requires `aria-label`** |

### 6.1 Native select rule [OWNER DIRECTION, final]

**Canonical direction:** preserve native select behaviour where appropriate, and style native selects to fit Magnetix. Don't replace native selects with custom dropdown systems merely for visual novelty.

- **[IMPLEMENTED, 2026-10-24 `ca84c95`]** About 187 existing operational pick-lists use native `<select>`. The CRM scope draws them like system inputs (`appearance:none`, shared chevron) and **keeps the native picker on purpose**, because it's accessible and best on phones. Native checkboxes and radios use `accent-color: var(--primary)` (plum).
- **[IMPLEMENTED]** In the New Builder, Puck's built-in `select` fields (for example Section **Content width**) render native selects in the Settings panel, while the custom style and form fields use `OptionSelect`. Both are current, canonical implementations for their surfaces.

**For new implementation:**
1. A **native select is acceptable, and often preferred**, where native/mobile picker behaviour is beneficial (short pick-lists, mobile-heavy forms).
2. Shared **`Select` / `OptionSelect`** may also be used where they are already canonical for that specific surface (for example, the builder's style and form fields, or "pick one or none" lists that need labelled options and an empty choice).
3. **Inspect the closest existing implementation** and follow it. There is **no** blanket rule that every new select must use a custom `Select` component.
4. **Don't** replace a working native select with a custom dropdown just for looks, and **don't** build a third dropdown system (`Select`, `OptionSelect`, `MultiSelect` and the styled native select cover it).

**Possibly stale relative to this direction (not changed by this document; see §22 C1):** `CLAUDE.md` → "Select (use instead of native `<select>`)", the drift ratchet's `nativeSelect` count (baseline 187, may only go down), and the builder-chrome contract's "no native `<select>`" check for style and form fields. Until they're realigned, a new native select still has to get past the ratchet, so raise it with the owner rather than silently bumping the baseline.

### 6.2 Labels, helper text, validation

- [IMPLEMENTED] Label above the field, helper text below in `text-caption text-muted-foreground`, and errors via `aria-invalid` on the control plus a message in `text-caption text-destructive`. Inline validation example: Agency Settings → Branding (proof page).
- [OWNER DIRECTION / undefined] There's **no shared `FormField` composite** yet. Follow the proof-page pattern. Don't invent a new field wrapper per feature.
- Edit-then-save in Settings → `useSettingsForm()` sticky bar. Per-action controls (toggles that save immediately) keep their own buttons.
- **Mobile:** inputs stay 16px under 768px (no iOS zoom). Forms stack to one column. Primary actions may use `size="touch"`. Keep the keyboard from hiding the action (the layout uses `h-dvh`).

---

## 7. Navigation

### 7.1 Desktop sidebar [IMPLEMENTED]

[sidebar.tsx](../src/components/dashboard/sidebar.tsx). The agency nav list is [agency-nav.ts](../src/components/dashboard/agency-nav.ts).
- Deep plum vertical gradient (`.mx-crm .app-sidebar`: plum‑900 → plum‑950), `w-56` (224px) expanded and `w-14` (56px) as the collapsed icon rail.
- Text `#ede0ef`. Hover `rgb(255 255 255 / .06)`.
- **Active item:** white fill (`--sidebar-primary: #fff`) with plum text, plus a 3px rose‑quartz → aqua vertical indicator on the left edge.
- Items: 16px icon + 13px label, `rounded-lg`, `px-2.5 py-1.5`. Nested items are 14px icon, 12.5px label, indented.
- **Groups (sub-account):** Dashboard (no label) · CRM · Calendar · Content · Email · Marketing · Sales · AI · Memberships · Growth · Insights · Sub-Account Settings. Named groups collapse/expand, and the state is persisted (`ls_sidebar_collapsed_groups`).
- Gated features show a lock icon or hide, depending on the `*HiddenWhenDisabled` flags.
- Agency pages use the same sidebar component and tokens (agency nav + "Back to Agency" in sub-accounts).

### 7.2 Header [IMPLEMENTED]

[header.tsx](../src/components/dashboard/header.tsx): page title per route (every Agency route is named), Cmd/Ctrl+K search trigger, workspace switcher and a menu button on phones. The page's own `PageHeader` provides the `<h1>`.

### 7.3 Tablet (768–1023px) [IMPLEMENTED]

The sidebar defaults to the **collapsed icon rail** when the user has no saved collapse preference (`TABLET_RAIL_QUERY = (min-width: 768px) and (max-width: 1023.98px)`). A saved choice always wins.

### 7.4 Phone (<768px) [IMPLEMENTED]

- **Bottom tab bar** ([bottom-tab-bar.tsx](../src/components/pwa/bottom-tab-bar.tsx)): **Home · Inbox · Calendar · Projects · More**, in that order. Inbox shows the unread badge. **More** opens the full sidebar menu as a left `Sheet` drawer (Contacts, Pipeline and everything else live there).
  - Height `--crm-mobile-tab-bar-h` (3.5rem) plus `env(safe-area-inset-bottom)`. `bg-background/95 backdrop-blur`, top border. Active tab = plum text and a violet tag-bg pill behind the icon. 11px labels.
  - Rendered **only inside a sub-account** (`/sa/[id]/…`). Agency pages keep the drawer alone.
  - Pages with their own phone toolbars stack above it using the shared variable (Report Builder: `.report-builder-shell`).
- **Left drawer:** the sidebar as a `Sheet` (`w-56`, same plum treatment), opened from the header menu button or More.
- **When a left drawer is appropriate:** full navigation (all modules), Agency-level navigation, and any destination not in the four daily-loop tabs. **Don't** add a fifth content tab, and **don't** change the tab set without owner approval.

### 7.5 Secondary navigation inside a page

- `Tabs variant="underline"` switches **views of one record/page**. `Tabs variant="pill"` switches **areas**. Both scroll sideways inside the strip on narrow screens. The page itself never scrolls sideways.
- `SegmentedControl` ([segmented-control.tsx](../src/components/ui/segmented-control.tsx)) for compact filters (Published / Draft / All).
- Settings uses `SettingsWorkspace` (§4.3), **not** tabs.
- The default `Tabs` variant (muted pill strip) still exists for legacy use. Prefer `underline` / `pill` in new work.

### 7.6 MyMagnetix (member area) [IMPLEMENTED, EXCEPTION]

`src/app/my/(app)/layout.tsx`: inside `CrmScope` (same tokens), but with its own **lighter member layout**: a **white** `w-60` sticky sidebar (`bg-card`, `border-r`) from `lg`, `max-w-[1440px]`, header with a drawer on phones. It isn't the plum CRM sidebar, because members aren't operators.

---

## 8. Tables and data-dense UI

[IMPLEMENTED] **`DataTableShell`** + constants ([data-table.tsx](../src/components/system/data-table.tsx)). The reference is Assets (Visual Direction 2 §4.2).

| Part | Spec |
|---|---|
| Frame | White card, `rounded-card`, border, `shadow-card`, clips corners |
| Scroll | Body scrolls **horizontally inside the card** (`overflow-x-auto`, optional `minWidth`). The page never scrolls sideways |
| Header row | `DATA_TABLE_HEAD_ROW`: **deep plum band**, `#ede0ef` text, `text-th` (10.5px), uppercase, `tracking-[0.08em]`, one line |
| Header cell | `DATA_TABLE_TH`: `px-4 py-3` |
| Body row | `DATA_TABLE_ROW`: `border-b border-border-subtle`, `hover:bg-tint-violet` |
| Body cell | `DATA_TABLE_TD`: `px-4 py-2.5` (dense), `align-middle`; table text `text-body-sm` (13px) |
| Footer | `Pagination` inside the card ("Showing 1–25 of 240" + numbered pages) |
| Toolbar | `FilterBar` above: `SearchField` left, filters, trailing actions right. It wraps on narrow screens |
| State | `StatusPill`. Category = `Tag` |
| Row actions | `ghost` icon buttons or a `DropdownMenu` ("More actions") with `aria-label` |

`DataTableShell` users: `contacts-table.tsx`, `projects-list.tsx`, `deal-list-view.tsx`, Products, Agency Sub-accounts / Billing / Acquisition. The approved reference table (Assets) applies the same band classes inline: [crm-resources.tsx](../src/components/assets/crm-resources.tsx), [affiliate-library.tsx](../src/components/assets/affiliate-library.tsx). Calendar and My Tasks use the band too.

**Density rule [PRINCIPLE]:** prefer usable density over decorative whitespace. Keep a row to about one line, put meta in `text-caption` muted, and don't put cards inside rows.

**Responsive [IMPLEMENTED pattern]:** keep the table and let it scroll inside the card, **or** (preferred on high-traffic lists) render phone "card rows" below `sm`/`md` instead of the table (Agency Sub-accounts, Purchases). Never let a table widen the page.

**Empty table:** an `EmptyState` (compact) replaces the table body. Don't render an empty header band with a blank body.

---

## 9. Empty, loading, error and unavailable states

| State | Implementation | Rule |
|---|---|---|
| **Empty** | `EmptyState` ([empty-state.tsx](../src/components/system/empty-state.tsx)): dashed `border-border-strong` frame, white, icon chip (`bg-tint-violet text-link`) **or** `sparks` motif, title (`text-section`), one help line, **at most one primary action** | Use `compact` inside cards and tables. `sparks` only for first-run and success moments |
| **Loading (page)** | `PageShellLoading width=…` | Same width as the loaded page |
| **Loading (inline)** | `Skeleton` (`animate-pulse rounded-lg bg-muted`, honours `motion-reduce`) | Mirror the real layout's shape. No spinners for whole pages |
| **Busy action** | Button with `Loader2` spinner, disabled | Keep the label |
| **Error (page)** | Shared not-found / denied / load-error states built on `EmptyState` (e.g. [page-load-state.tsx](../src/components/pages-funnels/page-load-state.tsx): "Page not found", "You don't have access to this page", load error) | Never an endless spinner. Distinguish not-found from access-denied |
| **Error (inline)** | `Alert tone="danger"` or a toast | Plain language. No stack traces or HTTP codes in staff copy |
| **Warning** | `Alert tone="warning"` | — |
| **Success** | Toast (`sonner`), `Alert tone="success"`, or `EmptyState sparks` for celebratory moments | Green only here |
| **Locked by agency** | `LockedNotice` ([locked-notice.tsx](../src/components/system/locked-notice.tsx)): neutral lock chip, title "Locked by your agency", what to do next | Presentational only. The gate is enforced server-side |
| **Coming soon / unbuilt** | Muted text or a dashed neutral chip ("Frequency · Coming soon", [chart-design-library.tsx](../src/components/energetic-decoder/chart-design-library.tsx)); unbuilt routes render the branded not-found state | Don't fake a working UI. Don't link to dead ends |
| **Not tracked yet / unavailable data** | Show **"—"** with the hint **"Not tracked yet"** (`MetricCard`, Growth page) | **Never show placeholder zeros or invented numbers.** Point to where real data lives if it exists elsewhere |

**Rule [IMPLEMENTED + OWNER DIRECTION]:** **don't fabricate data to make a screen look complete.** `MetricCard` shows live values only: no invented trends or sparklines. (Business Pulse fix `698d3b9` removed stored placeholder zeros.)

---

## 10. Mobile + tablet definition of done

**[OWNER DIRECTION + tooling IMPLEMENTED] A desktop implementation is NOT complete without mobile and tablet review in the same pass.** The owner should never be the first to see a breakage.

### 10.1 QA widths

`390 · 820 · 1024 · 1280 · 1440`. These are the defaults in [scripts/qa/visual-pass.mjs](../scripts/qa/visual-pass.mjs) (`--widths`, `--axe`, `--scroll-shots N`, `compare`). Routes come from `scripts/qa/routes.example.json`, and sessions from `scripts/qa/mint-qa-session.ts`. Always serve locally with **`pnpm qa:serve dev|start`**, never a bare `pnpm start`.

### 10.2 CRM breakpoint behaviour

| Range | Navigation | Notes |
|---|---|---|
| < 768 (phone; QA 390) | Bottom tab bar + left drawer | `main` 16px gutter, `pb-24` |
| 768–1023 (tablet; QA 820) | Collapsed icon rail (default) | Settings column → section picker |
| 1024–1279 (QA 1024) | Full sidebar | Settings column 176px |
| ≥ 1280 (QA 1280 / 1440) | Full sidebar | Settings column 210px |

### 10.3 Checklist per screen

- **Stacking:** multi-column layouts collapse to one column on phones. `PageHeader` actions wrap below the title. `SectionHeader` actions drop below. `FilterBar` wraps.
- **Touch targets:** ≥ 44px for primary phone actions (`size="touch"` / `lg`). Icon buttons in dense rows must still be comfortably tappable. Checkboxes have enlarged hit areas.
- **Spacing:** 16px side gutter on phones (from `main`). Don't add more horizontal padding that squeezes content.
- **Overflow:** the document must **never** scroll horizontally. Tables, tab strips and segmented controls scroll **inside** themselves. Long URLs and ids must wrap or truncate (`min-w-0`, `truncate`, `break-all` where appropriate).
- **Navigation:** the bottom tab bar shows <768 on sub-account routes. Content isn't hidden behind it. Fixed bottom toolbars stack above it.
- **Tables:** scroll inside the card or switch to card rows (§8).
- **Drawers / sheets:** bottom sheets on phones for pickers and menus. They must sit above the tab bar.
- **Modals:** `max-w-[calc(100%-2rem)]` on phones. Long content scrolls inside the dialog. Primary actions stay reachable.
- **Forms:** one column, 16px inputs, labels above.
- **Builders:** see §11.7.
- **Motifs:** hidden on narrow screens (`hideBelow="sm"`).

---

## 11. Pages & Funnels builder (the New Builder)

**Key principle:** **the builder CHROME is operational Magnetix UI. The page CONTENT is the customer's.** Don't force the CRM palette or style onto authored page content.

Route: `/sa/[id]/pages-funnels/[pageId]/new-builder` (route group `src/app/(builder)/…`, wrapped in `CrmScope` by `src/app/(builder)/sa/[subAccountId]/layout.tsx`). It's the **only** editor (2026-10-23). Puck `@puckeditor/core` 0.23.

### 11.1 Chrome [IMPLEMENTED: `1a2077b`, contract `scripts/check-builder-chrome.mjs`]

- Shell: [editor-shell.tsx](../src/components/pages-funnels/puck/editor-shell.tsx). Theme: [magnetix-theme.css](../src/components/pages-funnels/puck/magnetix-theme.css) maps Puck's own `--puck-*` tokens to the CRM variables (`--card`, `--border`, `--primary`, `--muted`, `--font-sans`). It's scoped to `:root` **on purpose**, so it also reaches the canvas iframe via `syncHostStyles`.
- The editor imports `@puckeditor/core/no-external.css`. **No remote CSS `@import`** (it crashed the editor when rsms.me was blocked). `scripts/check-no-remote-css.mjs` runs in `pnpm lint`.
- **Header:** back link, title (takes the remaining space; one line with ellipsis ≥638px, two lines on phones), **page type label**, status `StatusPill` (**Published** green / **Draft** neutral / **Unpublished changes** amber), saving indicator, then actions:
  - **Preview** (`outline sm`, Eye icon), **Save Draft** (`outline sm`), **Publish** (`default sm`, plum). **These three always keep their labels.**
  - View Live Page / Copy Link go into a **"More actions"** menu below 2xl. Reading settings is icon-only below xl. The back link is icon-only below 2xl.
  - No "New Builder" badge (retired).
- **Left: Blocks panel** ([blocks-panel.tsx](../src/components/pages-funnels/puck/blocks-panel.tsx)): category headers, then compact icon + label tiles (`min-h-10`, `rounded-lg`, `border-border bg-card`, `text-caption`), on a fluid grid `minmax(6.75rem,1fr)` (one column when narrow). Drag cursor (`cursor-grab`).
- **Right: Settings panel** ([settings-panel.tsx](../src/components/pages-funnels/puck/settings-panel.tsx)): the header shows the component's **label** ("Featured Offer Settings"), never the internal key. Field labels are 13px and inputs 14px (Magnetix scale). Style and form dropdowns use the **system `Select` / `OptionSelect`**; Puck's built-in `select` fields (e.g. Section Content width) render the styled native select (§6.1). Style rows wrap rather than clip. **With nothing selected** (since `f1b6f73`), it shows **Page Settings** with the page **Background** (None / Color / Image / Video, plus Background Blur), followed by the hint "Select a block on the canvas to edit it". Name, address and SEO still live in Pages & Funnels.
- **Canvas:** selection and slot tints are a whisper of plum (5% / 3%), so a selected section never turns lavender. An empty page shows "Drag a block from the left to start building", not a tinted slab.
- **Load states:** shared `EmptyState` for not found / no access / load error, and for Preview's no-data state.

### 11.2 Device controls and Preview [IMPLEMENTED]

- Puck's **native** `ViewportControls` with `VIEWPORTS` ([src/lib/pages-funnels/puck/constants.ts](../src/lib/pages-funnels/puck/constants.ts)): **Desktop 1280 · Tablet 768 · Mobile 390**. Don't build a second device toolbar.
- **Preview** opens the same in-memory, **unsaved** data in a **new tab** (`…/new-builder/preview`), not a modal.
- **Save Draft** persists the Puck draft. **Publish** writes `puckPublishedData` and makes `/p/[pageId]` live. Public `/p/[pageId]` renders **only** a published New Builder snapshot (404 otherwise).

### 11.3 Block categories [IMPLEMENTED: `config.tsx`, `blocks-panel.tsx`]

| Category | Blocks | Shown on |
|---|---|---|
| **Layout** | Section, Row, Column | All pages |
| **Elements** | Heading, Text, RichText, Button, Image, Video, Divider, Spacer, Accordion, Icon, Tabs, Image Gallery, Image Slider, Logo Strip | All pages |
| **Data & Metrics** | Stats / Numbers, Animated Counter, Progress Bar, Progress Ring, Chart | All pages |
| **Prebuilt Sections** | Hero | All pages |
| **Business** | Form, Reading Tool, Testimonial / Proof, Countdown Timer, Pricing / Offer Summary | All pages |
| **Advanced** | CustomHtml | All pages, **including** Reading Result pages (since `f1923e8`) |
| **Reading** | HumanDesignChart, AtAGlance, Centers, Channels, Gates, Variables, Skills, Mandala, MandalaActivations, AstrologyChart, AstrologyKeyFacts, AstrologyHouses, AstrologyPlacements, AstrologyAspects, GeneKeys | **Reading Result pages only** (`pageType: "reading_result"`) |
| **Next Steps** | FeaturedOffer, MyMagnetixButton, PdfButton, ReadingReportButton | **Reading Result pages only** |

**Category order [IMPLEMENTED: `GENERAL_CATEGORY_ORDER` / `READING_RESULT_CATEGORY_ORDER` in `blocks-panel.tsx`; verified in production 2026-10-26]:**

| Page type | Order |
|---|---|
| Ordinary pages | Layout · Elements · Data & Metrics · Prebuilt Sections · Business · Advanced |
| Reading Result pages | **Reading · Next Steps** · Layout · Elements · Data & Metrics · Prebuilt Sections · Business · Advanced |

The specialized **Reading** and **Next Steps** categories stay semantically distinct, even though the general blocks are also available on Reading Result pages. They come first because the Reading is the content of that page type (§13).

**Block-picker icons:** lucide icons mapped per component in [block-icons.tsx](../src/components/pages-funnels/puck/block-icons.tsx). Every new block **must** add an entry there (lucide only).

**Wave 1 block guidance [IMPLEMENTED]:**

- **Stats / Numbers** is a static KPI / proof display. It is appropriate for authored values such as `10K+`, `98%`, `$1.2M`, `4.9/5` or `#1`. It does not count up, render progress, draw charts, query live CRM analytics or fabricate proof. Any displayed number remains customer-authored or otherwise explicitly sourced.
- **Logo Strip** preserves uploaded colors by default, with optional Grayscale treatment. It provides direct logo-height control from **48–240px**, defaults to **96px**, and keeps the Small / Medium / Large shortcuts at **64px / 96px / 128px**. Logos preserve aspect ratio, use contain-fit, and remain contained responsively.
- **Image Slider** supports multiple images, Media Library multi-select, replace/remove, and an Advanced image URL as a secondary path. Autoplay is expressed in customer-facing seconds: **5 seconds by default**, bounded from **3 to 60 seconds**.
- **Countdown Timer** uses native date and time pickers plus a searchable, human-readable timezone selector. The canonical IANA timezone value is an internal representation, not ordinary customer-facing terminology. The component has distinct **Unconfigured**, **Active** and **Expired** states.
- **Empty content blocks** remain visible, identifiable and selectable in the builder. The structural path is **Section → Row → Column → content block**. Builder-only empty states explain what belongs there; they do not invent visitor-facing content or leave an unexplained blank Section.

**Data & Metrics Capability Wave 1 [IMPLEMENTED: `data-metrics-config.tsx`, `src/components/pages-funnels/data-metrics/`, `src/lib/pages-funnels/data-metrics/`; check `scripts/check-data-metrics.ts`]:** all values are **manual and customer-authored**. There's no connected CRM or analytics data, no AI generation (`SAFE_PUCK_COMPONENTS` excludes every Data & Metrics block) and no arbitrary chart JSON. New blocks start empty: the builder shows an empty state, and visitors see nothing until real values are entered.

- **Animated Counter** is separate from Stats: a number that counts from a start value to an end value **once**, when it scrolls into view (or on load, or not at all). The builder shows the static final value. Server render and first paint are the final value (hydration-safe, no-JS safe); reduced-motion visitors see the final value immediately; screen readers get only the final value. Width is reserved for the widest value (tabular numerals) so nothing shifts.
- **Progress Bar** and **Progress Ring** share one progress model: a current value and a target above zero. The fill is clamped to 0–100%, while the real percentage (e.g. 120%) is still shown. A missing or zero target is "not set up", never NaN. The bar or ring carries `role="progressbar"` with `aria-valuemin`/`max`/`now`/`valuetext`, labelled by the visible label; the text stays readable. Optional one-time fill animation follows the same reduced-motion rules. The ring is a neutral primitive with no Decoder styling.
- **Chart** is **one block** with a chart-type selector: Bar, Horizontal bar, Line, Area, Pie, Donut. Data is a **Label | Value** list (add, remove, reorder) with no JSON. Plain SVG built in-house, with **no chart library**. Every chart has a visible title/description, a plain-language summary and a screen-reader data table. Charts draw at the container's real width so text stays 12px on phones; category labels thin out and shorten when space is tight. Horizontal bar suits long labels, and Pie/Donut legends stack under the chart on narrow screens. Line and Area keep entered order; Pie/Donut leave out negative values and say so in the builder.
- **Colours:** named choices (Plum, Violet, Pink, Aqua, Gold, Green, or the page's text colour) mapped to palette tokens on `:root`, never a free hex. Chart series use the Magnetix chart palette, plum first.
- **Number entry:** value fields accept `1,250`, treat an empty box as "not set" (not 0), and show "Enter a number" inline. Formatting (number, compact, currency, percentage, decimals, thousands separator) reuses the shared Data & Metrics formatter. Fields appear only when they apply (e.g. currency code only for Currency; donut centre only for Donut).

**Still later [DEFINED, NOT IMPLEMENTED]:** Data Table, multiple series and stacked charts, and connected (explicitly permissioned) CRM or analytics data.

**Runtime registry is part of “live.”** Source-code presence alone is not proof that a Builder block is available to customers. Release-sensitive additions must be checked in the runtime Puck registry/configuration and in the production block-picker categories, not only by locating a component file.

### 11.4 Custom HTML treatment [IMPLEMENTED: `61aa1fb`, `f1923e8`; checks `scripts/check-custom-html.ts`]

- **Where:** the **Advanced** category, on **ordinary Pages & Funnels pages and on Reading Result pages** (since `f1923e8`).
- **What it is:** **static HTML + CSS only**, pasted manually. It's an isolated block and is **not** HTML-to-native conversion; it never becomes Sections, Rows or native blocks.
- **Isolation:** renders in a **sandboxed `<iframe srcdoc>`** (no `allow-same-origin`) with a pinned in-frame CSP, so its **CSS is isolated** in both directions and it can't reach Magnetix cookies, session, storage or the surrounding page.
- **JavaScript is blocked.** The shared sanitizer [src/lib/pages-funnels/custom-html/sanitize.ts](../src/lib/pages-funnels/custom-html/sanitize.ts) strips scripts, event handlers, `javascript:` URLs, frames and other active content, and reports what it removed in plain language.
- **Forms are inert.** They render but can't submit; use the Form block for real forms.
- **External HTTPS assets are allowed** (images, fonts, stylesheets).
- **Manual-only:** AI PagePlan generation excludes it (`SAFE_PUCK_COMPONENTS`), so the AI page generator can never emit this block.
- Display: **Fit content** (auto height) or **Fixed height** (Scroll inside / Cut off). Limits: HTML 250 KB, CSS 150 KB, 25 blocks/page.
- **Width:** Custom HTML **follows its structural parent's width** (the Column, Row and Section it sits in, §11.6). It doesn't have its own page-width model. For a full-page design, put it in a Section set to **Edge to edge**.
- **The customer owns responsiveness inside Custom HTML.** Magnetix guarantees isolation, the sizing modes and the frame's width. It doesn't rewrite their CSS. Tell users to test in Mobile preview.

### 11.5 Page canvas default [IMPLEMENTED: `f1b6f73`, `PageRootRender` in layout.tsx; check `scripts/check-builder-actions.ts`]

- **The visitor page canvas defaults to white.** Every page renders through a page root (`PageRootRender`, `[data-page-root]`) that paints `#ffffff` unless the page sets its own **Page background** (`root.props.pageBackground`, edited in Page Settings, §11.1).
- **Builder canvas, Preview and the published page agree** (measured 2026-10-26: all white). Before `f1b6f73` the builder and Preview showed the CRM's lavender canvas (`#fbf9fe`) behind the page, while published pages were white.
- **The builder chrome keeps the VD2 operational canvas** *around* the customer page (`--puck-canvas-color-bg: var(--muted)`). Only the page itself is white.
- **Existing pages were not migrated** because the default changed. They were already white for visitors and render exactly as before.
- **Explicit template and Section backgrounds remain authoritative.** The page root sits behind them.
- Published pages (`src/app/p/[pageId]/page.tsx`) render **outside** `.mx-crm`, with the neutral `:root` defaults. Page colour comes from the author's page, Section and block backgrounds, never from CRM tokens.
- In the editor only, the page root lets Puck's root drop zone fill the page, so a block can be dropped anywhere on an empty canvas. Live pages are never stretched.

### 11.6 Structural width [IMPLEMENTED: `f1b6f73`, [layout.tsx](../src/components/pages-funnels/puck/layout.tsx)]

**Section owns structural width.** Width isn't a per-block or Custom-HTML-specific setting.

| Content width | Behaviour |
|---|---|
| **Contained (1024px)** | Content max 1024px, centred, with the normal side margins |
| **Wide (1280px)** | Content max 1280px, centred, with side margins |
| **Full width (side margins)** | Viewport width minus the normal side margins (24px each side) |
| **Edge to edge (no margins)** | The exact available page width, with no normal side margins |

| Background width | Behaviour |
|---|---|
| **Edge to edge** (default) | The Section background spans the full page width, whatever the content width |
| **Match content width** | The background is confined to the content box (a "card" look) |

**Content width vs background width:** they're separate settings on purpose. That's what allows designs such as a **full-width background with contained inner content** (a coloured band across the page with readable 1024px text inside), as well as a boxed card on the page canvas.

- **Row:** a 12-column grid. **Column widths** `Auto (half on desktop), 1/4, 1/3, 1/2, 2/3, 3/4, Full` → `col-span-12` on phones and the chosen span from `sm` (640px) (`COLUMN_SPAN_CLASS`).
- **Custom HTML follows its structural parent's width** (§11.4).
- **Responsive [verified 2026-10-26]:** tested at **390 · 820 · 1024 · 1280 · 1440**. Full width keeps its side margins at every width; Edge to edge removes them. **No page-level horizontal overflow is acceptable** at any width.

### 11.7 Builder on tablet and phone [IMPLEMENTED]

- 638–999px: opens with the **Blocks sidebar collapsed** so the canvas isn't squeezed. Laptops keep both panels.
- Puck's phone menu is anchored to the full header row.
- Header collapses per §11.1.

### 11.8 Button action model [IMPLEMENTED: `f1b6f73`; [action.ts](../src/lib/pages-funnels/puck/action.ts), [action-field.tsx](../src/components/pages-funnels/puck/action-field.tsx), [page-action-targets.ts](../src/lib/server/page-action-targets.ts); check `scripts/check-builder-actions.ts`]

Button (and Image) actions are chosen from one **Action** dropdown that shows only the fields that action needs:

| Action | Stores | Renders |
|---|---|---|
| **Go to URL** | URL + same/new tab | The URL, if it's a safe scheme |
| **Go to page** | Page **id** (+ new tab) | The page's live, custom-domain-aware `/p/…` link |
| **Go to Offer** | Offer **id** | The Offer's own checkout page link |
| **Scroll to section** | The Section's stable **id** | `#{sectionId}` |
| **Call** | Phone number | `tel:` |
| **Email** | Address + optional subject | `mailto:` |
| **Text message** | Phone number | `sms:` |

Not part of the model (reserved, never rendered): popups, show/hide, page JavaScript, custom events, submit form, checkout popup and workflow triggers.

**Object-bound actions.** When Magnetix owns the destination object, store a **stable object reference**, not a copied raw URL. Go to page stores the Page reference and Go to Offer stores the Offer reference; both resolve on the server at render time through the same URL builders every other public link uses. That keeps tenant authority and routing correct (custom domains, renamed slugs). AI-generated pages bound to a real Offer use Go to Offer too.

**Tenant safety.**
- Page and Offer targets must belong to the **active workspace**; the pickers only list that workspace's pages and Offers.
- **Cross-tenant references fail closed:** they never resolve, on the server or in Preview.
- **Published targets resolve publicly.** Drafts are labelled in the picker with a warning, and resolve only once published.
- Missing or deleted targets render a button **with no link**. They never silently produce an incorrect or foreign link.

**Scroll.** Scroll-to-section uses the Section's **stable id**. Never use visible text as an anchor identity. If the Section is deleted, the button stops linking.

**Editor safety.** A Button clicked inside the builder **selects and edits the block**; it never navigates the editor away (the builder renders no `href`). Preview and the public page perform the real action.

**Browser-native actions.** Call, Email and SMS use validated `tel:`, `mailto:` and `sms:` schemes (invalid numbers and addresses are flagged in Settings and produce no link). Unsafe URLs (`javascript:`, `data:` …) and unknown action types never create executable links.

---

## 12. Specialized and moment surfaces

| Surface | Allowed expressive treatment | Path |
|---|---|---|
| Sub-account Dashboard | `PageHeader variant="moment"` (serif) + `MomentHero` (hero wash: lavender bloom top-right, blush bloom bottom-left, `#fbf8ff→#f6f0ff`) + **planet** motif + `MetricCard`s + `--ds-chart-*` | [dashboard/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx>), [moment-hero.tsx](../src/components/system/moment-hero.tsx) |
| Index pages: the approved Assets moment | `PageHeader variant="moment" motif="crescent"` (serif title + eyebrow), segmented areas, tags | [assets-ui.tsx](../src/components/assets/assets-ui.tsx) `AssetsHeader` |
| Other index / reporting pages (Forms, Broadcasts, Quotes, QR Codes, Templates, Products, Contacts, Growth, Reports) | **Operational** `PageHeader` (sans) + the small 40px `accent="crescent"` (index) or `accent="orbit"` (reporting) corner motif, hidden on phones | e.g. [forms/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/forms/page.tsx>), [reports/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/reports/page.tsx>) |
| Energetic Decoder (readings, charts, Content Sets) | **constellation** motif, DM Serif titles, editorial layouts | `src/components/energetic-decoder/` |
| AI experiences | **glow** motif | AI Agents, Workspace Assistant |
| Public / login / onboarding | **clouds** wash (tenant-tinted on tenant pages) | auth shells, booking |
| Empty + success moments | **sparks** (`EmptyState sparks`) | — |
| Reading experiences | Chart-heavy, editorial (§13) | — |
| Public tenant pages | Tenant brand inside `.tenant-surface` (§13.4) | booking, forms, quotes, … |

**Motif rules [IMPLEMENTED: [motif.tsx](../src/components/brand/motif.tsx), `MOTIF_FOR`; check `scripts/check-motifs.tsx`]:** one motif per page, picked from `MOTIF_FOR` (don't invent art). Decorative only (`aria-hidden`, no pointer events). It must sit inside a positioned frame (`MotifFrame` or a `relative` parent). Fixed size presets: `hero` 160, `header` 64, `corner` 40, `inline` 96. Static unless `animate`, and then only under `prefers-reduced-motion: no-preference`. **None on operational pages.** The `accent` corner motif doesn't combine with a `sparks` EmptyState on the same page.

**Frozen [IMPLEMENTED]:** `.mx-hero-gradient`, `.mx-wash-gradient`, `.mx-banner-gradient`, `.mx-gradient-text`. Kept only so the approved Dashboard renders. **No new uses** (ratchet `legacyThemeClass`).

**How moments differ from daily screens:** a moment may use serif display type, one motif, a wash and more generous vertical space. A daily operational screen uses none of those and optimizes for scanning and repeated action.

---

## 13. Reading Tool / Reading Result design boundaries

### 13.1 Architecture [IMPLEMENTED: CLAUDE.md "Reading Tools + Reading Result Pages"]

- **One set of Reading blocks** in [src/components/energetic-decoder/reading-blocks/](../src/components/energetic-decoder/reading-blocks/) renders all three of:
  1. the **Standard Result** ([standard-result.tsx](../src/components/energetic-decoder/reading-blocks/standard-result.tsx)),
  2. the **Custom Reading Result Page** (Puck wrappers in [reading-components.tsx](../src/components/pages-funnels/puck/reading-components.tsx)), and
  3. the **MyMagnetix Reading** page (`src/app/my/(reading)/`, [reading-view.tsx](../src/components/mymagnetix/reading-view.tsx)).
- Blocks receive a `ReadingBlockContext` ([src/types/reading-blocks.ts](../src/types/reading-blocks.ts)) built server-side ([reading-block-context.ts](../src/lib/server/reading-block-context.ts)).
- **Blocks carry ~3–5 domain controls (heading, show/hide, cards vs list, …), never colours and never a Content Set.** Colours come from the page or tenant context and from **Chart Designs**. Content comes from the Reading's **Content Set**, set on the Reading Tool.
- Page-level settings: `PageDoc.readingResult = { chartDesignSetId, sample }` (the Reading settings dialog, [reading-result-settings.tsx](../src/components/pages-funnels/puck/reading-result-settings.tsx)).
- Rendering for visitors: [reading-result-page-view.tsx](../src/components/pages-funnels/reading-result-page-view.tsx).

### 13.2 Styling rules

- [IMPLEMENTED] Reading blocks are styled with **neutral shadcn variables** (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`), not CRM plum/violet tokens. That lets them sit inside any section background, column or tenant brand. The shared frame is `BlockSection` + `CARD` (`rounded-2xl border bg-card p-4 sm:p-5`) in [block-section.tsx](../src/components/energetic-decoder/reading-blocks/block-section.tsx).
- [EXCEPTION, ALLOW-listed] Chart renderers (`human-design-*`, `mandala-*`, `astrology-*`, `gene-keys-*`, `chart-*`, `report-*`) keep purpose-built colours. They're excluded from the colour/font-size drift metrics.
- [PRINCIPLE] **Don't make Reading Result pages look like generic CRM screens.** No plum table bands, no CRM `PageHeader`, no StatusPills as decoration, no Settings-style card stacks. Reading visualization (charts, centers, channels, gates) is the content. Give it the width (the Standard Result is up to 1100px) and the visual priority.
- [PRINCIPLE] General blocks (Layout, Elements, Business, Advanced/Custom HTML) can coexist on a Reading Result page. They must not replace or restyle Reading blocks, and Reading settings or the Content Set must never move into a block.
- **Next Steps:** FeaturedOffer (title, price and inclusions come from the Offer only; unpublished Offers never show), MyMagnetixButton ("Open your Reading in MyMagnetix"), PdfButton, ReadingReportButton.

### 13.3 Reading Tool (the embeddable form)

The Reading Tool owns the form, Content Set, Chart Design, delivery and `afterSubmit.destination`. Three "Ways to share": Pages & Funnels, Website (script/iframe), Direct link. Editor: [embed-editor.tsx](../src/components/energetic-decoder/embed-editor.tsx). Public tool: [public-reading-tool.tsx](../src/components/energetic-decoder/public-reading-tool.tsx).

### 13.4 Tenant surfaces (general rule for territory C)

[IMPLEMENTED: [tenant.css](../src/styles/magnetix/tenant.css), [tenant-brand.ts](../src/lib/brand/tenant-brand.ts); checks `scripts/check-tenant-brand.ts`, `scripts/check-public-surfaces.mjs`]
- Tenant branding lives **only** inside `.tenant-surface`, set with `tenantBrandStyle()` (which computes a contrast-safe on-primary). Inside, `--primary` follows the brand, so `Button` turns tenant-coloured automatically.
- Building blocks: `tenant-wash`, `tenant-card` (white, 20px radius), `tenant-mark`, `tenant-text`, `tenant-choice`, `tenant-soft`, `tenant-button`.
- Magnetix keeps control of layout, spacing, type scale, focus rings, error and success colours, and **"Powered by Magnetix"** ([powered-by-magnetix.tsx](../src/components/brand/powered-by-magnetix.tsx), shown by default; `canHidePoweredBy()` returns false. **[FUTURE]** plan entitlement).
- **Never** let `--brand-*`, `.tenant-surface` or `tenantBrandStyle` into the CRM shell (ratchet `brandTokenInCrm` = 0).
- Reference: public booking page [src/app/b/[subAccountId]/[slug]/page.tsx](../src/app/b/[subAccountId]/[slug]/page.tsx).

---

## 14. Content Sets: current specialized visual system

[IMPLEMENTED, owner-approved mockups 2026-10-07; **EXCEPTION**: a current specialized visual system inside the Energetic Decoder]

**Treat Content Sets as a deliberate exception. Don't force it into generic CRM styling.** Its distinct treatments are part of the approved design:
- its own **status treatment** (Content Sets `StatusPill` Active/Draft, `EntryStatePill`),
- **expressive typography** (DM Serif titles via `displayTitle`),
- **dedicated variables** (`--cs-*` in `.content-sets-scope`),
- **specialized page-header behaviour** (its own `PageHeader` and `Breadcrumb`).

Whether to consolidate it with the system components later is a **separate review**, not something to do in passing. Don't change Content Sets code as part of unrelated work.

- Files: [content-sets-visuals.tsx](../src/components/energetic-decoder/content-sets-visuals.tsx) (presentational primitives), [content-sets-library.tsx](../src/components/energetic-decoder/content-sets-library.tsx), [content-set-editor.tsx](../src/components/energetic-decoder/content-set-editor.tsx), [content-tab.tsx](../src/components/energetic-decoder/content-tab.tsx).
- Tokens: `.content-sets-scope` (`CS_SCOPE`) in **`@layer legacy`** ([legacy.css](../src/styles/magnetix/legacy.css)): `--cs-ink #1a1238`, `--cs-body #3e3a6e`, `--cs-subtle #6b6496`, `--cs-link #4a1d96`, `--cs-tint #f4ecfe`, `--cs-active-*` …
- Primitives: `StatusPill` (Active/Draft), `EntryStatePill`, `IconTile` (violet/pink/teal; square/circle; sm/md/lg), `setTile`, `SYSTEM_ICON` / `SYSTEM_TONE` (hd/astro/freq), `CATEGORY_ICON` / `entryTile`, `ProgressRing`, `Breadcrumb`, `CelestialDecoration`, a Content Sets `PageHeader`, and `displayTitle` (DM Serif via `display-serif.ts`).
- **Lineage:** the system status palette (`--ds-status-*`) was **promoted from** the Content Sets `--cs-*` palette. Same greens and ambers.

**Where to reuse:**
- **Inside Energetic Decoder** content surfaces (Content Sets, Report Builder dialogs, readings library): reuse `content-sets-visuals.tsx` primitives (IconTile, ProgressRing, EntryStatePill, CATEGORY_ICON) instead of inventing new tiles, icons or progress indicators.
- **Outside the Decoder:** use the **system** `StatusPill`, `PageHeader`, `EmptyState` and the `tag-*` chips. **Don't** import the Content Sets `StatusPill` / `PageHeader` into other modules, and don't add new uses of `CS_SCOPE` outside the Decoder (it's a legacy layer).

---

## 15. Iconography

- [IMPLEMENTED] **`lucide-react` is the icon system.** `react-icons` is in `package.json` but **unused in `src/`**. Don't start using it, and don't add any other icon library. Brand marks are custom components in `src/components/brand/` (`logo-mark.tsx`, `google-g-icon.tsx`).
- **Sizes** (`--ds-icon-*`): 14px `size-3.5` (sm buttons, nested nav), **16px `size-4` (default: buttons, nav, inputs, table actions)**, 20px `size-5` (page-header chips, bottom tabs, empty states), 24px `size-6` (moment chips).
- **Stroke:** lucide default (2). There's no standardized override. Don't set `strokeWidth` ad hoc.
- **Icon chips:** `rounded-chip` + a tag bg/fg pair (e.g. `bg-tag-violet-bg text-tag-violet-fg`), 32–48px square. This is where colour lives on operational pages.
- **Placement:** leading icon in buttons and nav items. Trailing only for chevrons and external-link affordances.
- **When to use icons:** navigation, block-picker tiles, primary/secondary actions where they help scanning, status and alert glyphs, and empty-state chips.
- **When not to:** every label in a dense form, decorative repetition in tables, or as the *only* label of a non-standard action (needs `aria-label` + tooltip).
- **Decorative icons get `aria-hidden="true"`.** Icon-only buttons get `aria-label`.
- **Block picker:** one lucide icon per Puck component in [block-icons.tsx](../src/components/pages-funnels/puck/block-icons.tsx) (e.g. `CodeXml` for Custom HTML, `Hexagon`/`Orbit`/`SunMoon` for Reading blocks).

---

## 16. Spacing and density

There are **no custom spacing tokens**. Magnetix uses Tailwind's default 4px spacing scale. The values below are the **established conventions in the canonical components**, not a separate token set.

| Context | Convention (from code) |
|---|---|
| Page gutter | 16px phones / 24px md+ (`main`); PageShell `lg:px-1` |
| Between top-level page sections | 24px (`PageShell gap-6`) |
| Page header internal | `gap-3`; title↔actions `gap-x-6 gap-y-4` |
| Card padding | 16px (`Card`); 12px (`size="sm"`); 20px (`SettingsSection p-5`) |
| Inside a card between groups | 16px (`gap-4`) |
| Section header title↔description | 2px (`mt-0.5`) |
| Form field rows | ~16px between fields; label→control ~6–8px |
| Table cells | `px-4 py-2.5` body, `px-4 py-3` head |
| Toolbar items | 8px (`gap-2`) |
| Sidebar items | `px-2.5 py-1.5`, `gap-2.5` |
| Empty state | `py-12` (`py-8` compact) |
| Controls | 38px default / 32px sm / 44px touch |

**"Denser work, quieter art," in practice:**
- **Operational screens (inbox, contacts, pipeline, settings, tables, builders):** compact controls, 13–14px text, tight row padding, no motifs, no serif, no washes. Whitespace is only there to group things.
- **Dashboards:** metric cards in a grid with consistent `gap-4`/`gap-6`. One hero only on the approved Dashboard.
- **Builder panels:** compact tiles (`min-h-10`), 13px labels, 14px inputs.
- **Expressive/public pages:** more vertical breathing room, larger type, a wash or motif. That spacing belongs to the moment and doesn't come back into the CRM.

---

## 17. Responsive page design (customer pages, separate from CRM UI)

Customer page responsiveness is governed by the builder's own system ("System A"), **not** by CRM breakpoints.

| Concern | Rule [IMPLEMENTED unless marked] |
|---|---|
| **Breakpoints** | `RESPONSIVE_BREAKPOINTS` in [src/lib/pages-funnels/puck/style.ts](../src/lib/pages-funnels/puck/style.ts): **mobile ≤ 767**, **tablet ≤ 1279**, desktop ≥ 1280. One shared resolver (`resolveResponsiveCss`) emits `@media` overrides and per-device visibility, scoped to the component id. Builder device preview widths (1280/768/390) fall inside these ranges. |
| **Per-device overrides / visibility** | Style fields can override per device and hide a block on desktop, tablet or mobile. |
| **Page** | White by default; optional Page background (§11.5). |
| **Section** | Content width Contained 1024 / Wide 1280 / Full width (side margins) / Edge to edge (no margins); Background width Edge to edge or Match content width (§11.6). |
| **Row / Column** | 12-col grid. Columns **stack full width below 640px** (`col-span-12 sm:col-span-N`). |
| **Media** | Image/Video have shared media size and style fields ([media-size.ts](../src/lib/pages-funnels/puck/media-size.ts), [video.ts](../src/lib/pages-funnels/puck/video.ts)). They scale to their column. Video uses responsive embeds. |
| **Form** | The Form block renders the hosted form ([form-client.tsx](../src/components/pages-funnels/puck/form-client.tsx) / [form-server.tsx](../src/components/pages-funnels/puck/form-server.tsx)). Fields are full width in their column. Visitors never see editor placeholders. |
| **Custom HTML** | The frame fills its structural parent's width (Column → Row → Section). **Internal responsiveness is the customer's responsibility** (§11.4). `vh` units are measured against an 800px screen. |
| **Buttons** | Actions per §11.8. They render the real link only in Preview and on the public page. |
| **Reading blocks** | Responsive on their own (`w-full min-w-0`, `sm:` padding). Chart layouts adapt in the renderer. |
| **Visitor preview requirement** | Before publishing, check **Desktop, Tablet and Mobile** in the device controls **and** open **Preview** (new tab). For agents: QA a published or preview page at 390 / 820 / 1024 / 1280 / 1440, with no page-level horizontal overflow. |

---

## 18. Accessibility and usability

**No WCAG conformance level has been verified or claimed.** The rules below are current expectations and implemented behaviours.

- **Contrast:** text tokens are chosen for legibility (`--color-ink-3` is annotated "≥ 4.5:1 on white"). Tenant brands go through `tenantBrandStyle()`, which computes a readable on-primary and contrast-checked brand text. Don't put tertiary text on tints, and don't lower text contrast for "softness".
- **Focus:** every interactive primitive shows a visible focus ring (`focus-visible:ring-3 ring-ring/50`, violet; aqua inside the sidebar). Never remove `outline` without a replacement.
- **Keyboard:** use real `<button>` / `<a>` (via `Button` / `render`), Base UI primitives (Select, Dialog, Menu, Tabs, Switch, Checkbox) for keyboard and ARIA behaviour, Cmd/Ctrl+K for search, and Escape closes overlays. Click-only `<div>`s are not allowed.
- **Semantic controls:** one `<h1>` per page (`PageHeader`), `h2`/`h3` via `SectionHeader`, `<nav aria-label>` for nav and pagination, `aria-current="page"` for the active tab and page.
- **Labels:** every input has a label. `SearchField` *requires* `aria-label`. Icon-only buttons require `aria-label`.
- **Native controls:** native selects, checkboxes and radios stay where they work (§6.1). Don't replace accessible natives with custom widgets without a reason.
- **Touch:** 44px primary targets on phones; enlarged checkbox hit areas; `-webkit-tap-highlight-color: transparent` with our own press states (`active:opacity-60`, `active:translate-y-px`).
- **Not colour alone:** `StatusPill` = colour + dot + **text**. Alerts carry icons + text. Locked states carry a lock icon + text. Charts need labels or legends.
- **Motion:** motifs animate only under `prefers-reduced-motion: no-preference`. Skeleton respects `motion-reduce`.
- **Tooling:** `visual-pass.mjs --axe` runs axe checks. Running it isn't automatic. Do it on design-touching changes.

---

## 19. WHAT NOT TO DO

Most of these are **enforced**: `pnpm lint` runs [check-design-drift.mjs](../scripts/check-design-drift.mjs), and counts may only **go down** (baseline in `scripts/design-drift-baseline.json`, updated 2026-10-25: hexInTsx 1510, arbitraryFontSize 761, nativeSelect 187, windowConfirm 9, rawH1ClassName 120, momentumScope 4, brandTokenInCrm 0, legacyThemeClass 2). **Don't bump the baseline to make your change pass.** A justified specialized surface goes into `ALLOW` with a reason.

1. ❌ **Giant lavender/purple operational backgrounds** or tinted page canvases.
2. ❌ **Purple-on-purple**: lavender inside lavender, purple text on lavender, a tinted card inside a tinted card.
3. ❌ **Green primary buttons**, or large decorative green operational surfaces. (Green for success, charts, tags and encoded metrics is fine; §2.8.)
4. ❌ **Violet, pink or aqua primary buttons.** Primary is deep plum.
5. ❌ **Excessive nested cards** ("box inside box inside box"). §4.6.
6. ❌ **Changing the typography system**: Geist, Instrument Serif, new webfonts, arbitrary `text-[Npx]`.
7. ❌ **DM Serif Display on routine operational headings**, controls, tables, settings or builders.
8. ❌ **Rebuilding existing controls** (buttons, inputs, selects, tabs, pills, empty states, confirm dialogs) instead of using `components/ui` and `components/system`.
9. ❌ **`window.confirm`**. Use `useConfirm()`.
10. ❌ **Raw `<h1 className>`**. Use `PageHeader`.
11. ❌ **Hard-coded hex** in components. Add a semantic token.
12. ❌ **Desktop-only completion.** §10.
13. ❌ **Replacing native selects with custom dropdowns just for looks**, or building a third dropdown system. Follow the closest existing implementation (§6.1).
14. ❌ **Inventing a new visual system per feature** (own palette, own pill, own header).
15. ❌ **Excessive decorative whitespace** in dense work surfaces.
16. ❌ **Introducing a new icon library** (`react-icons`, heroicons, etc.).
17. ❌ **Forcing CRM chrome styles onto public or customer content** (plum buttons on a tenant page, CRM headers on a funnel).
18. ❌ **Making Reading Result pages look like generic CRM screens**, or putting colours or a Content Set into Reading block settings.
19. ❌ **Adding `.momentum-scope`** or the `mx-*-gradient` / `mx-gradient-text` helpers to anything.
20. ❌ **Re-adding an app-theme picker** or competing full-app themes (`theme-*` classes).
21. ❌ **`--brand-*` / `.tenant-surface` / `tenantBrandStyle` inside the CRM shell.**
22. ❌ **More than one motif per page**, motifs on operational pages, or invented decorative art.
23. ❌ **Fabricated data**: placeholder zeros, fake trends, sample numbers shown as real. Use "—" / "Not tracked yet".
24. ❌ **Second tab rows or floating sub-nav cards in Settings.**
25. ❌ **Pages that change width between loading, empty and loaded states.**
26. ❌ **Remote CSS `@import`** (font CDNs etc.). It's enforced by `check-no-remote-css.mjs`.
27. ❌ **Dark-mode styles** (not yet designed).
28. ❌ **Developer jargon in staff/customer copy** (HTTP codes, "QStash", "/api/v1", spec references). The Agency and builder passes removed these.
29. ❌ **Changing the mobile tab set** (Home / Inbox / Calendar / Projects / More) without owner approval.
30. ❌ **Rebuilding Puck's device toolbar or a modal Preview.** Use native ViewportControls and a new-tab Preview.
31. ❌ **Copying a raw URL into a Button when Magnetix owns the destination** (a page or Offer). Use Go to page / Go to Offer (§11.8).
32. ❌ **A per-block page-width model** (e.g. width logic inside Custom HTML). Width belongs to Section (§11.6).
33. ❌ **Builder elements that navigate the editor away** when clicked. Clicks select; Preview and the public page act.

---

## 20. Canonical implementation references

Open the closest one **before** building.

| Need | Look at |
|---|---|
| Tokens | [src/styles/magnetix/tokens.css](../src/styles/magnetix/tokens.css), [semantic.css](../src/styles/magnetix/semantic.css), [tenant.css](../src/styles/magnetix/tenant.css), [legacy.css](../src/styles/magnetix/legacy.css), [src/app/globals.css](../src/app/globals.css) |
| CRM scope / light mode | [src/components/theme/crm-scope.tsx](../src/components/theme/crm-scope.tsx), [src/lib/theme/crm-theme.ts](../src/lib/theme/crm-theme.ts) |
| Living visual reference | `/docs/design-system` → [src/app/docs/design-system/page.tsx](../src/app/docs/design-system/page.tsx), [showcase.tsx](../src/app/docs/design-system/showcase.tsx) (dev only; 404 in prod unless `DESIGN_SYSTEM_DOCS=on`) |
| Primitives | [src/components/ui/](../src/components/ui/): `button`, `input`, `textarea`, `select`, `multi-select`, `checkbox`, `radio-group`, `switch`, `tabs`, `segmented-control`, `card`, `alert`, `skeleton`, `dialog`, `alert-dialog`, `sheet`, `popover`, `dropdown-menu`, `tooltip`, `color-input`, `timezone-select` |
| Composites | [src/components/system/](../src/components/system/): `page-shell`, `page-header`, `section-header`, `settings-section`, `settings-workspace`, `status-pill` (+ `Tag`), `empty-state`, `locked-notice`, `confirm-dialog`, `search-field`, `filter-bar`, `pagination`, `data-table`, `metric-card`, `moment-hero`, `nav-card`, `record-card`, `option-select` |
| Brand / motifs | [src/components/brand/motif.tsx](../src/components/brand/motif.tsx), [powered-by-magnetix.tsx](../src/components/brand/powered-by-magnetix.tsx), [logo-mark.tsx](../src/components/brand/logo-mark.tsx) |
| CRM layout + nav | [src/app/(dashboard)/layout.tsx](<../src/app/(dashboard)/layout.tsx>), [src/components/dashboard/sidebar.tsx](../src/components/dashboard/sidebar.tsx), [agency-nav.ts](../src/components/dashboard/agency-nav.ts), [header.tsx](../src/components/dashboard/header.tsx), [src/components/pwa/bottom-tab-bar.tsx](../src/components/pwa/bottom-tab-bar.tsx) |
| Moment page (proof) | [src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx>) |
| Index page + table (proof) | [src/app/(dashboard)/sa/[subAccountId]/assets/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/assets/page.tsx>), [src/components/assets/assets-ui.tsx](../src/components/assets/assets-ui.tsx), [crm-resources.tsx](../src/components/assets/crm-resources.tsx) |
| Operational index page | [src/app/(dashboard)/sa/[subAccountId]/forms/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/forms/page.tsx>), [src/app/(dashboard)/sa/[subAccountId]/products/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/products/page.tsx>) |
| Settings (proof) | [src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx>), [src/app/(dashboard)/agency/settings/page.tsx](<../src/app/(dashboard)/agency/settings/page.tsx>) |
| Dense data | [src/components/contacts/contacts-table.tsx](../src/components/contacts/contacts-table.tsx), [src/components/projects/projects-list.tsx](../src/components/projects/projects-list.tsx), [src/components/pipeline/deal-list-view.tsx](../src/components/pipeline/deal-list-view.tsx) |
| Full-bleed board | [src/app/(dashboard)/sa/[subAccountId]/pipeline/page.tsx](<../src/app/(dashboard)/sa/[subAccountId]/pipeline/page.tsx>) |
| Agency | [src/app/(dashboard)/agency/page.tsx](<../src/app/(dashboard)/agency/page.tsx>), [agency-home-dashboard.tsx](../src/components/agency/agency-home-dashboard.tsx), [src/app/(dashboard)/agency/sub-accounts/page.tsx](<../src/app/(dashboard)/agency/sub-accounts/page.tsx>), [sub-account-manage-dialog.tsx](../src/components/agency/sub-account-manage-dialog.tsx), [src/app/(dashboard)/agency/billing/page.tsx](<../src/app/(dashboard)/agency/billing/page.tsx>) |
| MyMagnetix | [src/app/my/(app)/layout.tsx](<../src/app/my/(app)/layout.tsx>), [src/components/mymagnetix/](../src/components/mymagnetix/) |
| Tenant / public (proof) | [src/app/b/[subAccountId]/[slug]/page.tsx](../src/app/b/[subAccountId]/[slug]/page.tsx), [src/lib/brand/tenant-brand.ts](../src/lib/brand/tenant-brand.ts) |
| Builder chrome | [editor-shell.tsx](../src/components/pages-funnels/puck/editor-shell.tsx), [magnetix-theme.css](../src/components/pages-funnels/puck/magnetix-theme.css), [blocks-panel.tsx](../src/components/pages-funnels/puck/blocks-panel.tsx), [settings-panel.tsx](../src/components/pages-funnels/puck/settings-panel.tsx), [style-field.tsx](../src/components/pages-funnels/puck/style-field.tsx), [block-icons.tsx](../src/components/pages-funnels/puck/block-icons.tsx), [page-load-state.tsx](../src/components/pages-funnels/page-load-state.tsx) |
| Builder model | [config.tsx](../src/components/pages-funnels/puck/config.tsx), [layout.tsx](../src/components/pages-funnels/puck/layout.tsx) (`PageRootRender`, `SectionRender`), [src/lib/pages-funnels/puck/constants.ts](../src/lib/pages-funnels/puck/constants.ts), [style.ts](../src/lib/pages-funnels/puck/style.ts) |
| Builder actions | [src/lib/pages-funnels/puck/action.ts](../src/lib/pages-funnels/puck/action.ts), [action-field.tsx](../src/components/pages-funnels/puck/action-field.tsx), [src/lib/server/page-action-targets.ts](../src/lib/server/page-action-targets.ts), `scripts/check-builder-actions.ts` |
| Custom HTML | [custom-html-frame.tsx](../src/components/pages-funnels/puck/custom-html-frame.tsx), [custom-html-field.tsx](../src/components/pages-funnels/puck/custom-html-field.tsx), [src/lib/pages-funnels/custom-html/sanitize.ts](../src/lib/pages-funnels/custom-html/sanitize.ts) |
| Reading | [src/components/energetic-decoder/reading-blocks/](../src/components/energetic-decoder/reading-blocks/), [reading-components.tsx](../src/components/pages-funnels/puck/reading-components.tsx), [reading-result-page-view.tsx](../src/components/pages-funnels/reading-result-page-view.tsx), [src/types/reading-blocks.ts](../src/types/reading-blocks.ts) |
| Content Sets | [content-sets-visuals.tsx](../src/components/energetic-decoder/content-sets-visuals.tsx), [content-sets-library.tsx](../src/components/energetic-decoder/content-sets-library.tsx), [content-set-editor.tsx](../src/components/energetic-decoder/content-set-editor.tsx) |
| `cn()` scales | [src/lib/utils.ts](../src/lib/utils.ts) |
| Guardrails | [scripts/check-design-drift.mjs](../scripts/check-design-drift.mjs), `scripts/check-builder-chrome.mjs`, `check-crm-visual-cleanup.mjs`, `check-agency-visual.mjs`, `check-public-surfaces.mjs`, `check-proof-pages.tsx`, `check-motifs.tsx`, `check-tenant-brand.ts`, `check-custom-html.ts`, `check-no-remote-css.mjs` |
| Visual QA | [scripts/qa/visual-pass.mjs](../scripts/qa/visual-pass.mjs), `scripts/qa/routes.example.json`, `scripts/qa/serve-local-qa.mjs`, `scripts/qa/mint-qa-session.ts` |

---

## 21. Implementation checklist for future agents

**The canonical rule (§0), every time:** read this document first → inspect the closest canonical implementation → reuse existing components, tokens and patterns → no new visual language without owner approval → surface conflicts between code and this document instead of silently picking one → explicit product requirements may override general rules → desktop + tablet + mobile QA is part of completion → keep operational UI, moment/expressive UI and customer-authored page content separate.

### Before building
- [ ] Read this document and `CLAUDE.md` → "Magnetix design system".
- [ ] Classify the surface: **A operational / B moment / C customer-tenant** (§0).
- [ ] Open the closest canonical screen in §20 and copy its structure (PageShell width, PageHeader variant, sections).
- [ ] List the existing primitives and composites you'll use. If something seems missing, check `components/ui`, `components/system`, `/docs/design-system`, and (for the Decoder) `content-sets-visuals.tsx` first.
- [ ] Write down the phone (390), tablet (820) and desktop (1280+) states, plus empty, loading, error, locked and not-tracked states.

### While building
- [ ] Tokens only: no new hex, no `text-[Npx]`, no raw `<h1>`, no `window.confirm`. Selects follow the closest existing implementation (§6.1); raise a new native select with the owner while the ratchet still counts them.
- [ ] Builder work: width on Section (§11.6), object-bound Button actions for Magnetix-owned destinations (§11.8), clicks in the editor never navigate.
- [ ] One plum primary per region. Status = `StatusPill`, category = `Tag`.
- [ ] One card level. No tint in a tint.
- [ ] System sans everywhere. DM Serif only via `PageHeader variant="moment"` on approved moment pages.
- [ ] At most one motif, from `MOTIF_FOR`, and only on moment surfaces.
- [ ] Tenant/customer surfaces: `.tenant-surface` + `tenantBrandStyle()`. No CRM tokens leaking in, and no tenant tokens leaking out.
- [ ] Reading surfaces: Reading blocks + Chart Designs. No CRM chrome, no colour controls on blocks.
- [ ] Icons: lucide, `size-4` default, `aria-hidden` when decorative, `aria-label` on icon-only buttons.
- [ ] Real data only. "—" / "Not tracked yet" when unmeasured.

### Before completion
- [ ] `pnpm lint` passes (drift ratchet, no-remote-CSS, ESLint). Run the relevant contract scripts (`check-builder-chrome`, `check-proof-pages`, `check-public-surfaces`, …) for the area you touched.
- [ ] Serve with `pnpm qa:serve dev` and run `node scripts/qa/visual-pass.mjs` for the affected routes at **390, 820, 1024, 1280, 1440** (add `--axe` and `--scroll-shots` where useful). Check that no horizontal document scroll, clipped header or hidden-behind-tab-bar content shows up.
- [ ] Interaction states: hover, focus-visible (keyboard through the page), disabled, loading, error, empty, locked.
- [ ] Visual drift check: put it side by side with the canonical screen. Same widths, header pattern, card treatment, table band, pill colours?
- [ ] Builder changes: verify Desktop/Tablet/Mobile device controls **and** the Preview tab **and** a published `/p/…` page, at 390 / 820 / 1024 / 1280 / 1440 with no page-level horizontal overflow.
- [ ] Desktop + tablet + mobile QA done in the same pass (§0 rule 7), and the surface kept in its own territory (§0 rule 8).
- [ ] Report any conflict with this document (§0 rule 5). If you changed a rule, update this document in the same change.

---

## 22. Known discrepancies, owner-direction-only rules and open areas

### 22.1 Contradictions and discrepancies (surface these; don't "fix" them silently)

Classification: **implementation debt** (code should eventually match the standard) · **specialized exception** (deliberate, keep) · **stale documentation/check** (the code or owner direction is right; the text or check is out of date) · **unresolved standard** (the owner hasn't chosen yet).

| # | Topic | Class | Detail |
|---|---|---|---|
| **C1** | **Native `<select>`** | Stale documentation/check | The owner direction is final (§6.1): preserve native select behaviour where appropriate, styled to fit Magnetix; no blanket custom-Select rule. Still contradicting it: `CLAUDE.md` → "Select (use instead of native `<select>`)", the drift ratchet's `nativeSelect` count (may only go down), and the builder-chrome contract's no-native check for style/form fields. Not changed here; realign separately. |
| **C2** | **Green** | Resolved (was "green = success only") | The final rule is §2.8. The green `Tag` family, `tagColorFor()`, `MetricCard tone="green"` and `--ds-chart-6` are legitimate uses, not violations. |
| **C3** | **Fonts** | Stale documentation | `CLAUDE.md` Tech Stack still says "Geist Sans + Instrument Serif". Operational type is the native system stack (`--font-sans`). Geist / Geist Mono / Instrument Serif are still **loaded** in `src/app/layout.tsx` (implementation/legacy detail), and `font-serif` (Instrument) has ~12 legacy usages. Follow-up alignment work. |
| **C4** | **Content Sets parallel system** | Specialized exception | Its own `StatusPill`, `PageHeader`, a second DM Serif instance (`display-serif.ts`), `--cs-*` tokens and arbitrary sizes. Approved for the Decoder (§14). Consolidation is a separate future review. |
| **C5** | **Sidebar details off-token** | Implementation debt | Badges use raw Tailwind `amber-500`, item labels use `text-[13px]` / `text-[12.5px]`, and the active indicator uses legacy `--mx-rose-quartz` / `--mx-aqua-glow`. |
| **C6** | **Stale comments** | Stale documentation | `tokens.css` says "nothing in the app uses them yet" (they're live). `magnetix-theme.css` says CRM values are in a `.theme-magnetix` block in `globals.css` (retired; they're in `.mx-crm`, `semantic.css`). `config.tsx` cites a "master spec §6" taxonomy. |
| **C7** | **Form width** | Unresolved standard | `SettingsWorkspace` content ≤ 720px vs `PageShell width="form"` 48rem (768px): two "form width" numbers. |
| **C8** | **Overlay elevation** | Implementation debt | `--shadow-overlay` exists (2 usages). `Dialog` uses `rounded-xl` + `ring-1` rather than `rounded-card` + `shadow-overlay`. |
| **C9** | **Reading Standard Result success banner** | Specialized exception (with token debt) | Uses raw `emerald-*` utilities rather than status tokens, inside a specialized Reading surface. |
| **C10** | **`Tabs` default variant** | Implementation debt (legacy) | The muted-pill default variant still exists beside the approved `underline` / `pill`. |
| **C11** | **Tablet definitions** | Unresolved standard | The CRM treats <768 as phone and 768–1023 as tablet. The page builder treats ≤767 as mobile and 768–**1279** as tablet. Each is right for its territory, but "tablet" means different ranges. |
| **C12** | **Builder settings selects** | Stale documentation/check (minor) | Puck's built-in `select` fields (e.g. Section Content width, 10 in `config.tsx`) render native selects, while the builder-chrome contract's wording reads as "no native selects". The contract only checks style and form fields, so it passes; under §6.1 both are acceptable. |

### 22.2 Rules that are owner direction, not (fully) enforced in code

- "Desktop isn't done without mobile/tablet QA in the same pass." Tooling exists, but nothing forces it.
- "Denser work, quieter art." It's reflected in component defaults but not measurable or enforced.
- No box-in-box nesting. Enforced only by component design and review, not lint.
- DM Serif only on moments. Not linted (`font-display` usage isn't ratcheted).
- One motif per page. Partly checked by `check-motifs.tsx` and the component docs.
- "Preserve native select behaviour where appropriate" (§6.1). The checks still point the other way (C1).
- Green is never a general primary-action colour (§2.8). There's no green Button variant, but no lint either.
- Customer page content must not be forced into CRM style. It's architectural (no `.mx-crm` on `/p`), but not linted.
- Reading Result pages must not look like CRM screens. Review-only.
- No fabricated data. Fixed case by case (Business Pulse), not enforced.
- No developer jargon in UI copy. Review-only.

### 22.3 Genuinely undefined areas (ask the owner before inventing)

- **Dark mode**: tokens are dormant. A design task is required.
- **Formal spacing scale**: nothing beyond Tailwind's defaults and the component conventions in §16.
- **Animation timing and easing**: no standard durations or easing beyond component defaults and reduced-motion handling.
- **Shared label / control / helper / error field abstraction** (`FormField`): pattern only, no component.
- **Toast vs inline alert guidance**: both exist; there's no written rule for when to use which.
- **Stricter icon stroke and size conventions**: nothing beyond lucide defaults and `--ds-icon-*`.
- **Chart colours beyond the existing 8-colour palette** (sequential/diverging scales, chart typography).
- **Explicit accessibility conformance target** (e.g. WCAG 2.2 AA): not declared or verified.
- **Email builder chrome** (`src/components/email-authoring/`): not covered by the Visual Direction 2 passes reviewed here.
- **"Powered by Magnetix" control behaviour**: shown by default; `canHidePoweredBy()` is a stub returning false, and whether and how a tenant can hide it isn't defined. **[FUTURE]**

*Resolved since the previous review:* in-builder page background fidelity vs the published white page (now defined and verified, §11.5).
