# Magnetix Pages & Funnels — Production Specification

**This is the source-of-truth document for Magnetix Pages & Funnels.**

Future implementation agents (Claude, Codex, or otherwise) must:

1. Read this document before making architecture or product decisions about Pages & Funnels.
2. Preserve approved decisions unless the user explicitly changes them.
3. Update the **Build Status** section below after any meaningful phase or task completes.
4. Record newly discovered technical constraints here as they're found.
5. Not silently change Launch / Very Soon / Later priorities.
6. Not automatically implement roadmap items outside the current approved task — each phase requires explicit user go-ahead and manual QA before the next one starts.

If this document and the current codebase ever disagree, that's a signal to stop and ask the user which one is stale — not to guess.

---

## BUILD STATUS

_Update this block whenever a meaningful milestone changes. Keep it short and current — it is the first thing a future session reads._

**CURRENT PHASE:** Puck Persistence + Publish Foundation — the first durable draft/publish data model and end-to-end persistence loop for the new Puck builder (master spec §24.12/§24.13's "Autosave/Publish/History"/"Preview" requirements), per the §24 capability baseline's §24.22 implementation order. Built and QA'd this task; System B (Rich Text/Image depth/Video depth/auto hierarchy) and Version History remain not started or approved.

**COMPLETED:**

- Custom V1 page builder (flat `PageBlock[]` model) — in production.
- V2 architecture experiment (fixed `Section → Row → Column → Element` tree, deterministic `migrateBlocksToSections()`) — built and validated as a design/migration reference, not shipped as a second production schema.
- Puck integration architecture audit.
- Puck proof-of-concept (`@puckeditor/core@0.23.0`) — drag/drop, nested drag/drop, cross-column moves, selection, Outline/Layers, field-driven column widths, device previews, long-page scrolling, real `PublicForm` rendering inside Puck's canvas, clean JSON serialization, server-side `<Render>`, all live-tested and confirmed working.
- Puck UX feasibility audit — custom Magnetix shell approach, native inline text editing (`contentEditable`), Undo/Redo source-level investigation.
- Puck Insert Undo Blocker — root-caused and fixed (unstable `iframe`/`metadata` prop identity on a controlled `<Puck>`; see §3). Insert/Move/Field-edit Undo/Redo all confirmed working after the fix.
- GoHighLevel and ClickFunnels builder research (informs this spec's feature scope; not reproduced here in detail).
- **Phase 1 — production Puck foundation**, built alongside the untouched V1 builder, none of it wired into production yet:
  - `src/types/pages-funnels-puck.ts` — shared alignment/button/width/background vocabulary (reused from V1/V2, not redefined), the `PageAction`/`PageActionType` Shared Action System foundation type (only `url` resolves today; every other Action System vocabulary entry from §8 is a real reserved case), and `PuckPageMetadata` (the `subAccountId`/`resolvedForms` contract).
  - `src/lib/pages-funnels/puck/` — `ids.ts` (id generation, incl. deterministic migration ids), `constants.ts` (stable `VIEWPORTS`/`IFRAME_CONFIG`/`WIDTH_OPTIONS`/`COLUMN_SPAN_CLASS`), `action.ts` (`resolveActionHref`, exhaustively switched), `resolve.ts` (`collectPuckFormIds`, the Puck-Data equivalent of V2's `collectFormIds`), `migrate-v1.ts` (direct, deterministic `PageBlock[] → Puck Data` converter, exhaustive over all 12 V1 block types including decomposing Hero/Features/Testimonials/FAQ/CTA into real primitives — NOT persisted or wired anywhere yet), `presets/hero.ts` (production Hero factory).
  - `src/components/pages-funnels/puck/` — `layout.tsx` (Section/Row/Column, the `inline`+`dragRef` pattern), `elements.tsx` (Heading/Text/Button/Image/Video/Divider/Spacer/Accordion, hook-free/shared), `form-client.tsx` + `form-server.tsx` (the one component that genuinely differs between the two configs), `config.tsx` (the shared `createPuckConfig` factory — LAYOUT + core ELEMENTS + BUSINESS(Form) registry, per §6 scope: no Booking/Checkout/Funnel logic yet), `client-config.tsx` / `server-config.tsx` (the two thin exports).
  - `src/app/api/pages-funnels/puck/resolve-form/route.ts` — production Admin-SDK form resolver for the client/editor path (mirrors `/p/[pageId]`'s established pattern).
  - `src/app/docs/design-prototypes/pages-funnels-puck-foundation/` — the internal production-fidelity harness (editor + server `<Render>` halves), unlinked from nav, no Firestore writes. Exercises the real production config/registry, not the POC's.
  - Full 20-point QA checklist (§19 of the Phase 1 task) passed against this harness — see that task's report for the detailed results, including two real, live-tested confirmations: Undo/Redo on a first-of-session insert (the Insert Undo Blocker fix carried into production code, not just the POC) and the Shared Action System's `Action` object field rendering/editing correctly in the real Fields panel.
- **Phase 2A — CRM-integrated Magnetix-styled Puck editor**, real (not docs-only) authenticated route, session-local safe-testing only:
  - `src/components/pages-funnels/puck/magnetix-theme.css` — CSS-first reskin overriding Puck's own shipped `--puck-*` design-token layer (318 custom properties, confirmed present in the installed 0.23.0 package) to the CRM's live `.theme-magnetix` variables. Scoped to `:root`, not a wrapper class — Puck's ActionBar/selection/drop indicators render inside the canvas iframe (a separate document `syncHostStyles` copies this stylesheet into but doesn't carry parent-document classes into), so a class-scoped selector silently failed to reach them; `:root` fixed it. Only ever imported by `editor-shell.tsx`, so the POC and Phase 1 harness are unaffected.
  - `src/components/pages-funnels/puck/editor-shell.tsx` (`MagnetixPuckEditorShell`) — the reusable shell. Uses `overrides.header`/`overrides.headerActions` (the current, non-deprecated API — `renderHeaderActions`, used in Phase 1, logs a runtime deprecation warning on 0.23.0) to prepend a "Back to Pages & Funnels" link + status badge and replace Puck's default Publish-only action with Preview/Save Draft/Publish, while leaving Puck's own header `children` (title via `headerTitle`, sidebar toggles, native `MenuBar` Undo/Redo) completely native. Save Draft/Publish render genuinely `disabled` with an explanatory `title` — no persistence wired. Preview opens a Dialog showing a real `<Render>` of the current in-memory Data (same pattern V1's own Preview mode already uses). Desktop/Tablet/Mobile stay Puck's native `ViewportControls` (a second toolbar row with no dedicated override slot in this version — themed via the same CSS variables, not fused into one row at the cost of touching Puck internals).
  - `config.tsx` gained a **Hero** component (new "Prebuilt Sections" category) — a real library drag-item, not the Phase 1 header-button demo. Reuses `SectionRender` and Section's own fields verbatim; `defaultProps` is real nested Column/Heading/Text/Button/Image data, so every primitive is independently selectable/editable immediately after the drag. Confirmed live: two separate Hero drops produce two fully independent, non-colliding instances (Puck mints fresh ids for `defaultProps`-sourced slot content per insertion).
  - `src/app/(builder)/sa/[subAccountId]/pages-funnels/[pageId]/new-builder/page.tsx` — the real route, sibling of the V1 editor route, same `(builder)` route group (normal auth/`SubAccountProvider`/`BillingGuard`). Reads the real `PageDoc`, converts `blocks` to Puck `Data` via the Phase 1 `migratePageBlocksToPuckData` foundation, in memory only — confirmed zero Firestore write calls anywhere in the new code (`updatePageBlocks`/`setDoc`/etc. grepped clean).
  - `src/app/(builder)/sa/[subAccountId]/layout.tsx` — gained `<AppAccent/>` (previously mounted only in `(dashboard)`'s layout). Fixes a real, pre-existing gap affecting the V1 editor too: a direct/refreshed load of any `(builder)` route rendered with the wrong (non-Magnetix) theme, since `<html>`'s theme class only survives _client-side_ navigation, not a fresh document load.
  - `src/app/(dashboard)/sa/[subAccountId]/pages-funnels/page.tsx` — `PageCard`'s dropdown gained a "Try New Builder" entry (per-existing-page), linking to the real route above. Not gated behind any admin/internal-user check — no such pattern exists elsewhere in this repo and this CRM currently has one real user; revisit if/when there are other real sub-account users before general availability.
- **New Builder QA entry fix** (immediate follow-up, same phase): the first real user QA session confirmed she landed in **V1**, not the new builder — her screenshots showed BASIC/SECTIONS categories, "Click a block to add it to the end of the page," old Content/Layout/Style/Spacing tabs, append-to-bottom instead of drag-to-position, and no inline editing — all correct, expected V1 behavior, **not** Puck defects. Root cause: the only Phase 2A entry point was a single item inside the per-card `⋮` dropdown menu (itself only visible on hover), while the page card's own title is a large, obvious link straight to V1's "Edit" — a user naturally clicks the title. Fixed by adding a second, always-visible, distinctly-styled "Try New Builder" button on every page card (not replacing the title link or the dropdown item, both kept) and a "New Builder Preview" badge in the new editor's own top bar so which editor is on screen is unambiguous at a glance. No Puck functionality changed this task.
  - `src/app/docs/design-prototypes/pages-funnels-new-builder-shell/` — QA-only harness (NOT a second deliverable route) rendering the exact same `MagnetixPuckEditorShell` with fixture data, built solely because this session has no real Firebase Auth credentials to drive the real authenticated route directly; used to verify the visual shell and all interactions below.
  - Full manual-test-equivalent QA (§18/§19 of the Phase 2A task) passed via Playwright + direct screenshot inspection against the harness: Magnetix purple/lavender theming confirmed correctly applied to editor chrome AND canvas-iframe content (selection borders, ActionBar, drawer, fields, Outline, buttons); drag-and-drop to exact position; nested selection (incl. near page bottom); Outline/Layers; column widths + mobile stacking; inline text editing activates (`contenteditable="plaintext-only"`); canvas scroll mechanism present (native Puck overflow, same as Phase 1's confirmed finding); Undo/Redo for insert (non-first-action), move, and field-edit all correct; Preview renders a real server `<Render>` matching editor output exactly; Save Draft/Publish confirmed genuinely `disabled` (not just styled); Hero drag-insert (twice, no id collisions); 0 browser console errors throughout.
- **Phase 2B — approved Magnetix builder UX restored** (same route, `MagnetixPuckEditorShell`): Phase 2A's CSS-only reskin still read as "Puck UI with Magnetix colors" to the real user — the left library, Layers, and Settings panels were still Puck's own stock composition, just recolored. Phase 2B replaces all three with genuinely custom Magnetix components, each wired in via `overrides.drawer`/`overrides.outline`/`overrides.fields`, while every wrapper still renders Puck's own real mechanics underneath (nothing forked, no DOM manipulation):
  - `blocks-panel.tsx` (`MagnetixBlocksPanel`) — a real icon-tile library (search + LAYOUT/ELEMENTS/PREBUILT SECTIONS/BUSINESS categories, 2-column grid, one lucide icon per block type) built on Puck's own public `Drawer`/`Drawer.Item` components — first-class, stable exports (confirmed present in the installed 0.23.0 package's runtime export list, not an internal API). `Drawer.Item` still owns the real dnd-kit drag source; this component only supplies custom visuals via its render-prop `children`. Confirmed live: dragging Heading/Text/Button/Divider/Hero/Form from the custom tiles inserts them with a real Puck insertion-position indicator, landing at the dropped position (not appended to the end) — genuine drag/drop, not a click-to-append regression.
  - `layers-panel.tsx` (`MagnetixLayersPanel`) — a light "Layers" header wrapped around Puck's own real Outline tree (`overrides.outline`'s `children`, untouched). Puck's own left icon-rail already natively implements the Blocks/Outline tab-switch (confirmed in prior-phase screenshots), so no tab-switching logic was rebuilt.
  - `settings-panel.tsx` (`MagnetixSettingsPanel`) — a header showing the selected element's type + icon (e.g. "Heading Settings"), using the public `createUsePuck()` hook's `selectedItem`, wrapped around Puck's own real field inputs (`overrides.fields`'s `children`, untouched).
  - `block-icons.tsx` — the Puck-component-name → lucide-icon map (Section/Row/Column/Heading/Text/Button/Image/Video/Divider/Spacer/Accordion/Hero/Form), reusing the same icon library V1's own BlocksPanel already uses.
  - Full QA checklist (§17 of the Phase 2B task) verified via Playwright against the fixture-fed harness: custom panel/icons/categories/search all visible; Heading/Text/Button genuinely DRAGGED (not clicked) with a real insertion indicator confirmed present; drop lands at the dragged-to position; Layers tab; Settings panel updates with the correct header on selection (confirmed via direct screenshot after an initial `.first()` test-locator artifact was traced to a benign duplicate DOM match, not a real defect); inline Heading/Text editing (`contenteditable="plaintext-only"`); Undo/Redo; viewport switching; canvas scroll mechanism; Hero insert with independently-selectable primitives; Form; Preview. 0 browser console errors after two real, minor fixes made during QA: removed a deprecated `droppableId` prop on `<Drawer>` (no longer required as of this Puck version) and switched `usePuck()` to `createUsePuck()` (Puck's own recommended selector-based hook, avoids unnecessary re-renders) — both flagged by Puck's own runtime warnings, not silently ignored.
- **Phase 2C — builder visual fidelity fixes** (three concrete issues the user identified from real use):
  - **Gradient controls (root cause: never existed).** Section's `background` field was always just `"none" | "solid" | "gradient"` — selecting "Gradient" applied one hardcoded, non-editable `linear-gradient(120deg, var(--accent), var(--primary))`; there was no color/direction UI anywhere, in V1 either (V1's own gradient was an equally hardcoded Tailwind class). Replaced with a real structured `SectionBackgroundConfig` (`src/types/pages-funnels-puck.ts`: `{type, color?, gradient?: {from, to, direction}}`) and a genuinely conditional Settings UI via Puck's `resolveFields` (a real, documented, component-level Config option — confirmed present in the installed 0.23.0 package): the Color field only appears for `type: "solid"`; the Start/End Color + Direction fields only appear for `type: "gradient"`. One shared pure helper, `sectionBackgroundStyle()` (`src/lib/pages-funnels/puck/background.ts`), turns that config into the final CSS `background` value — used by `SectionRender` (the one render function both `clientPuckConfig` and `serverPuckConfig` already shared before this fix, so editor canvas and Preview render gradients identically by construction, not by coincidence). Confirmed live: Solid/Gradient selection, live color updates (including a UX improvement made during QA — a single color chosen so far now previews as a flat fill instead of showing nothing until both gradient colors are set), and direction changes all update the canvas immediately.
  - **V1 → Puck gradient migration.** `migrateBackgroundStyle()` (migrate-v1.ts) now reads the source V1 block's real `backgroundStyle` (only `hero`/`cta` blocks ever had one) and preserves the TYPE (none/solid/gradient) — confirmed live against the QA fixture's real `backgroundStyle: "gradient"` Hero block. Never invents color/direction data V1 never had (confirmed: V1's renderer only ever used one hardcoded Tailwind gradient class, no per-page color existed to read) — a migrated gradient Section shows `type: "gradient"` with genuinely empty Start/End Color fields, exactly matching what V1 actually stored, not a fabricated default.
  - **Editor/Preview mismatch (root cause: none — a zoom-display illusion, not a style bug).** Investigated by direct computed-style comparison (not eyeballing): with the editor canvas set to 100% zoom (it defaults to ~66% "Auto" for viewing convenience) and Preview open on the same content, font-size/font-family/line-height/color/section-padding/section-max-width were confirmed **byte-identical** between the two. Root cause: `SectionRender`/`RowRender`/`ColumnRender`/every element renderer were already the single shared implementation for both `clientPuckConfig` and `serverPuckConfig` before this task — there was no second "Preview-only" style code to drift. The default reduced zoom level is a real, expected editor affordance (see more of the page while editing), not a content-fidelity bug.
  - **Preview clipping (root cause: found and fixed).** The prior small modal's scroll container was `flex-1 overflow-y-auto` with no `min-h-0` — a classic flexbox trap where a flex child's default `min-height: auto` refuses to shrink below its content's natural height, so the fixed-height Dialog around it clipped whatever didn't fit instead of that child ever actually scrolling. Fixed two ways: `min-h-0` on the scroll container, and — per this task's explicit permission to use "the strongest UX that fits" — Preview is now a genuine full-screen takeover (`h-dvh w-dvw`, no small-modal height math at all). One real Tailwind gotcha found and fixed along the way: the base `DialogContent` component ships `sm:max-w-sm`, and an unprefixed `max-w-none` override doesn't cancel a `sm:`-prefixed rule in `tailwind-merge` — needed `sm:max-w-none` to actually take effect. Confirmed live: scrolling the fixture to the bottom reaches the true end of the page with full bottom padding visible, `reachedBottom` true.
  - **Preview viewport-width awareness (§9, "where practical").** Preview's rendered content now matches whichever Desktop/Tablet/Mobile width is currently selected in the editor, via `onAction` capturing `appState.ui.viewports.current.width` into local state (the Preview dialog is a sibling, not a child, of `<Puck>`, so it can't call `usePuck()`/`createUsePuck()` directly — `onAction` is the supported way to observe Puck's state from outside its own subtree without a larger restructure). Not a second device-preview system — only ever reads Puck's own real viewport state.
  - Full regression pass (drag/drop, inline editing, Undo/Redo, Layers, Desktop/Tablet/Mobile, Hero, Form) — 7/7 passed, 0 console errors, confirming none of the above regressed Phase 2B.
- **Phase 2D — production-grade Background/Gradient controls + Preview architecture rewrite** (real user QA rejected two things from Phase 2C: the Dialog-based Preview UX, and the gradient editor's depth against a researched HighLevel capability reference used as a functional target, not a visual-copy mandate):
  - **Preview UX change.** Phase 2C's full-screen Dialog Preview is gone entirely — clicking Preview now writes the current in-memory `data` into `sessionStorage` (keyed `puck-preview:${pageId}`, see `src/lib/pages-funnels/puck/preview-session.ts`) and opens a genuine new browser tab at a dedicated route (`.../new-builder/preview`) rendering ONLY page content via the exact same `<Render config={serverPuckConfig} .../>` production pipeline a real published page will eventually use — zero editor chrome, real tab width driving responsiveness, no artificial device-frame wrapper. `window.open()` deliberately omits `noopener` (same-origin, first-party navigation) because `sessionStorage` sharing with an opener-created tab depends on that relationship per the HTML spec.
  - **Double-close-control investigation.** Live DOM inspection of the pre-existing Phase 2C code (before this rewrite) found exactly one close control (`showCloseButton={false}` was already correctly suppressing the Dialog's own default X, leaving only the custom header X) — the reported duplicate could not be reproduced against the current codebase. Moot regardless: the Dialog is now removed entirely, so there is no close control of any kind left to duplicate.
  - **Unsaved-preview data.** The new Preview route has no server request lifecycle and Puck Data still isn't persisted, so it can't load from Firestore — it reads `sessionStorage`, and for any referenced Form pre-resolves each `LeadForm` client-side via the existing `/api/pages-funnels/puck/resolve-form` route (using `collectPuckFormIds`, the same walk a real future server route will use) before calling `<Render>`, so `serverPuckConfig`'s real, non-fetching `FormElementServerRender` is what actually renders — not a second Form implementation. A direct hit on the preview route with no session data shows an honest "No preview data found" empty state with a link back to the editor, rather than crashing or rendering blank.
  - **Background/Gradient model.** Replaced Phase 2C's Section-only `SectionBackgroundConfig` (`{type, color?, gradient?: {from,to,direction}}`) with a generic `BackgroundConfig` (`src/types/pages-funnels-puck.ts`) shared verbatim by Section, Hero, Row, AND Column: `source: "none"|"color"|"image"|"video"` (Image/Video typed now, no field UI yet — explicitly deferred, not over-built), `color: {mode: "solid"|"gradient", solid, gradient}`, `gradient: {type: "linear"|"radial"|"angular", angle, stops: {id,color,position}[]}` (up to 10 stops, enforced in the field editor), and `blur: {enabled, intensity}`. One shared pure helper (`backgroundCssValue`/`gradientCssValue`, `src/lib/pages-funnels/puck/background.ts`) turns it into real CSS, consumed by one shared render primitive (`BackgroundLayer`, `src/components/pages-funnels/puck/background-layer.tsx`) that Section/Row/Column all render identically — not three copies. Blur renders on a dedicated absolutely-positioned layer behind content (never `filter` on the container itself), so child text/images stay crisp — confirmed live via computed-style inspection (`filter: blur(12px)` on the background layer, `filter: none` on the heading text in the same section).
  - **Real color picker.** Reused the repo's existing `ColorInput` component (`src/components/ui/color-input.tsx` — swatch + popover with a native `<input type="color">` and a hex text field) rather than adding a new dependency; used for both the solid-color field and every gradient stop.
  - **Gradient editor UX.** New `BackgroundFieldEditor`/`GradientEditor` (`src/components/pages-funnels/puck/background-field.tsx`) as a Puck `CustomField<BackgroundConfig>` (a real, stable, documented Puck field type — confirmed in the installed 0.23.0 package's types) rather than `object`/`resolveFields`, since this UI's stop-list/add/remove/live-preview interactivity needs one cohesive component owning its own layout. Gradient Type (Linear/Radial/Angular) as a segmented control; a live horizontal stop-position preview rail; one row per stop (color picker, numeric 0–100% position, remove — disabled below the 2-stop minimum); an "Add Color Stop" button (disabled at the 10-stop maximum); an angle slider shown only for Linear/Angular (Radial has no CSS angle concept, so the control is hidden, not shown-inert). All changes update the canvas live — confirmed via computed `background-image` reads on the actual canvas iframe element for Linear, Radial, and Angular, each with real two-stop colors.
  - **Two real bugs found and fixed during live QA** (both caught via the QA pass itself, not reported beforehand): (1) `addStop()`'s "widest gap" placement logic only considered gaps _between_ existing stops, so with exactly one existing stop it always fell back to a hardcoded 50% — clicking "Add Color Stop" twice from an empty gradient silently produced two stops stacked at the same 50% position (an invisible, degenerate gradient). Fixed by measuring gaps across `[0, ...existing positions, 100]` uniformly, so 0/1/2+ stops all place sensibly with no special case. (2) Toggling Background Blur "on" left `intensity` at its 0 default, so the toggle visibly did nothing until the user also dragged the slider — fixed by seeding a sensible non-zero intensity (12px) the moment the toggle flips on with intensity still at 0 (never overwrites an already-chosen intensity).
  - **Section/Row/Column support.** Confirmed live (Playwright + computed-style/DOM inspection against the fixture harness): Section, Hero, Row, and Column each show the identical Background field in Settings, and each independently renders its own live gradient/blur via the one shared `BackgroundLayer`.
  - **V1 migration.** `migrateBackgroundStyle()` (migrate-v1.ts) now emits the new `BackgroundConfig` shape, preserving only the real V1 `backgroundStyle` INTENT (mode: solid vs. gradient) — `solid: ""` / `stops: []` respectively, never inventing colors V1 never had (V1 only ever stored the enum, confirmed again this phase). A migrated gradient Section now opens with "Gradient" already selected and an empty, ready-to-fill stop list, rather than reverting to "None."
  - Full regression pass (drag/drop, inline editing, Undo/Redo, Layers, Blocks panel, Desktop/Tablet/Mobile, Hero, Form) confirmed unaffected; 0 unexpected browser console errors.
  - **Deferred, not built this task (explicitly out of scope per the task):** Image/Video background source field UI (types exist, ready for a future phase); alpha/transparency on colors; Checkout/Booking/funnel-orchestration Actions; popups; pricing/countdown elements; A/B testing; Puck Data persistence/cutover; a brand-board system.
- **Requirements consolidation — GoHighLevel capability baseline (documentation only, no code changed):** a deeper audit of GoHighLevel's Pages/Funnels builder was converted into §24 (GoHighLevel Capability Baseline and Magnetix Requirements Matrix) — a binding, structured capability matrix so future implementation proceeds system-by-system from an approved baseline instead of piecemeal ("add borders" this session, "add shadows" a later one). Locks the future Settings panel organization (General/Styles/Animations, §24.2), documents five shared style systems (Typography, Spacing, Border, Shadow, Background — §24.3) that must be built once and reused across every component rather than per-element, and adds a maintained 44-row capability matrix (§24.20) with STATUS/PRIORITY/IMPLEMENTATION SYSTEM columns. Newly classified LAUNCH this task (added to §17): auto hierarchy/auto-wrapping, Rich Text mixed formatting, shared Spacing/Border/Radius, one box+text shadow, per-device visibility + responsive typography/spacing/alignment, the Preview architecture (already built), autosave/Publish/version history, and analytics event plumbing (the instrumentation itself, ahead of the reporting UI). No existing architecture decision (§1–§23) was changed or reprioritized — this is additive documentation, not a rewrite of prior history.
- **Capability matrix reconciliation (documentation only, no code changed):** a summary report on the §24.20 matrix miscounted its rows (compound Status/Priority cells like "BUILT (foundation)" or "LAUNCH (core); VERY SOON (rest)" led to an inconsistent narrative tally that didn't match the table). Audited every row directly (verified programmatically, not by eye) and corrected two things: (1) every Status and Priority cell now holds exactly one enum token, with all qualifying detail moved into Notes/Gaps — this was a real documentation defect, not just a reporting error, since a future session scanning the table for a plain "BUILT" match could have been misled the same way; (2) **Section/Row/Column's status changed from BUILT to PARTIAL** — hierarchy and the Phase 2D background system are genuinely built, but the §24.5 layout-control target (border/radius/shadow/min-height/responsive-visibility) isn't, so BUILT overstated it. Verified final totals directly from the table: **44 rows — BUILT: 6, PARTIAL: 9, MISSING: 29, DEFERRED: 0, SKIP: 0 (6+9+29+0+0=44)**. No priority (Launch/Very Soon/Later) was changed for any capability that already had a single, unambiguous value; two previously-ambiguous compound-priority rows (Navigation, Tracking scripts) were resolved to their already-documented single value (Navigation → Very Soon per §24.9's own "Launch or Very Soon" hedge with no Launch commitment elsewhere; Tracking scripts → Very Soon, matching what §17 already said).

- **System A — Core Shared Styling System** (master spec §24.3/§24.20's Launch-scope shared style systems, implemented as ONE system per the task's explicit instruction, not piecemeal per element):
  - **Shared data model.** New `StyleConfig` (`src/types/pages-funnels-puck.ts`) composing `TypographyConfig`, `SpacingConfig` (margin+padding, each with 4 optional sides + a linked/unlinked flag), `BorderConfig` (style/color/width, linked/unlinked), `RadiusConfig` (4 optional corners, linked/unlinked), `BoxShadowConfig`/`TextShadowConfig` (enabled + X/Y/blur/spread/color), `ResponsiveConfig` (tablet/mobile overrides of font-size/text-align/spacing), and `DeviceVisibilityConfig` (desktop/tablet/mobile booleans, defaults all-true). Every group except visibility is entirely optional-shaped ("unset" fields, not zero-valued ones) — the same additive-only safety principle Phase 2D established for `BackgroundConfig`: an empty `StyleConfig` resolves to zero CSS output, so existing/migrated content is visually unaffected until a user actually opens the new Styles field and changes something.
  - **Shared render helpers.** New `src/lib/pages-funnels/puck/style.ts` — `resolveTypographyStyles`/`resolveSpacingStyles`/`resolveBorderStyles`/`resolveRadiusStyles`/`resolveBoxShadowStyle`/`resolveTextShadowStyle`/`resolveBaseStyleProps` (pure `CSSProperties` resolvers, each emitting a property only when its config value is actually set) and `resolveResponsiveCss` (the one shared resolver for BOTH responsive overrides and per-device visibility, per the task's explicit "one shared resolver, not custom breakpoint logic per renderer" instruction). Responsive overrides render as real CSS `@media` rules (not JS viewport-detection) scoped to the component's own stable `id` via a sibling `<style>` tag — required because a real site visitor's browser, not the editor's currently-selected Puck viewport, determines the breakpoint on the same `<Render>` pipeline Preview and a future public page both use. Visibility uses mutually exclusive `min`/`max-width` ranges per breakpoint (`display:none`); responsive style overrides use an overlapping `max-width` cascade (tablet's block written before mobile's, so a narrow viewport picks up mobile's more specific declaration last via ordinary CSS source order) — both keyed off the exact same breakpoint constants `VIEWPORTS` (constants.ts) already uses (Tablet=768, Desktop=1280), so "hidden on tablet" can never disagree between the editor's device switcher and a real browser.
  - **Shared field editor.** New `src/components/pages-funnels/puck/style-field.tsx` — `createStyleField(compatibility)`, a factory producing one Puck `CustomField<StyleConfig>` per component, following the exact proven pattern Phase 2D established for Background (one custom field owning its own rich internal layout). Internally organized into collapsible groups (Typography/Spacing/Border & Radius/Shadow/Responsive/Visibility, new `src/components/ui/collapsible.tsx` base-ui wrapper) gated by a literal, in-code `StyleCompatibility` object per component (config.tsx) — e.g. Heading gets Typography/Spacing/Shadow(text)/Responsive/Visibility but not Border&Radius; Section gets the reverse. Real color pickers reuse the existing `ColorInput`; font family reuses Magnetix Forms' own curated `FONT_FAMILY_STACKS` (`src/types/forms.ts`) rather than introducing a second font system or any web-font loading, per the task's explicit instruction to inspect existing font architecture first.
  - **Right sidebar organization (§24.2).** Every compatible component's Settings panel now shows a "Styles" field with clearly labeled, collapsible groups instead of one flat list — a real, substantial scanability improvement. The literal top-level GENERAL/STYLES/ANIMATIONS DOM section split across Puck's own native Fields list was investigated and NOT attempted: Puck's `slot` fields (Section's `rows`, Row's `columns`, Column's `elements`) cannot safely nest inside an `object` field wrapper without risking the drag/drop mechanism those slots depend on, and Puck's Fields panel has no other native section-header primitive to reach for without a fragile custom `overrides.fields` DOM rewrite (against this repo's own "prefer supported API surface" rule, §3). This is a real, explicitly acknowledged scope reduction, not a silent omission — see KNOWN BUGS. Animations tab intentionally absent this task, per the task's own explicit permission ("may remain absent if cleaner").
  - **Component wiring.** Section, Hero, Row, Column, Heading, Text, Button, Image, Video, Divider, Accordion, and the Form container all gained a `style`/`styleConfig` field (Button and Divider already had a field literally named `style` — the legacy preset/line-vs-space field — so their new System A prop is named `styleConfig` instead, keeping the pre-existing field completely untouched). Button additionally gained the shared `backgroundField` (the same `BackgroundConfig`/`BackgroundLayer` system Section/Row/Column already used, layered behind the label so it only visually appears once explicitly set), directly matching the task's own worked example ("Button: ...background/color..."). Spacer deliberately did NOT gain a `style` prop, per the task's explicit instruction ("Spacer remains its own semantic height element").
  - **Section/Row/Column depth increase.** All three now render real border/radius/box-shadow/margin/padding/responsive/visibility on top of their existing background — moving their capability-matrix status from the shallow "hierarchy + background only" state Phase 2D left them in toward (not yet at) the full §24.5 Layout Controls target; min-height and full-width-background-vs-contained-content-independent-of-maxWidth remain unbuilt (see KNOWN BUGS).
  - **Confirmed live** (Playwright against the fixture harness, values read via `getComputedStyle`/generated `<style>` tag content, not eyeballed): Heading font-size (52px), font-weight (700), text-transform (uppercase), and opacity (0.4) all update the canvas live; Section's linked margin (10px on all four sides) updates live; Section border-style (`solid`) updates live; Section box-shadow enabling produces the exact expected default value (`rgba(0,0,0,0.15) 0px 4px 12px 0px`, matching `DEFAULT_BOX_SHADOW`); a tablet font-size override emits the exact expected media query (`@media (max-width:1279px){#id{font-size:18px;}}`); toggling Mobile visibility off emits the exact expected rule (`@media (max-width:767px){#id{display:none;}}`) while the component remains present in Data/Layers (confirmed via the Outline tree, never removed); Section/Row/Column's compatibility-gated groups render correctly per component (Border & Radius correctly absent from Heading's panel); 0 unexpected browser console errors across the full pass. Background regression confirmed structurally, not just behaviorally: `background.ts`/`background-layer.tsx`/`background-field.tsx` are byte-for-byte unmodified this task (`git diff` empty), and `config.tsx`'s existing `background`/`backgroundField` wiring for Section/Hero/Row/Column was only ever added to, never edited.
  - **Two real bugs found and fixed during this task's own build** (before shipping, not via user QA — see Document Discipline): (1) the linked/unlinked shadow-enable toggle originally reset a shadow's X/Y/blur/spread/color back to the hardcoded default every time it was re-enabled after being disabled, discarding whatever the user had dialed in; fixed to always preserve existing values and only flip the boolean. (2) `addStop()`-style default-then-forget bugs were specifically checked for and not found elsewhere in this task's new code.
  - **Not independently confirmed via live automation this task** (verified via direct code-path review instead — see KNOWN BUGS for the honest reason why): unlinked/independent margin or radius side values producing four genuinely different computed values (the LINKED case is confirmed live with an exact value; the unlinked code path is structurally identical, just writing different numbers to the same four keys); Box Shadow's disable direction removing `box-shadow` cleanly (the enable direction is confirmed live with an exact value; disable is the same boolean toggle in reverse, already covered by the bug fix above). Test-automation friction (Puck's own benign duplicate-DOM pattern, documented since Phase 2A/2B) made a fully clean live re-confirmation of these two specific sub-cases impractical within this task's effort budget — this is a documentation-honesty note about the QA evidence trail, not a suspected product defect.

- **System A Closeout — closed the 7 launch gaps the original System A report itself flagged as remaining**, plus a real product bug found and fixed along the way:
  - **Min-height.** New `LayoutConfig { minHeight?: number }` added to the shared `StyleConfig` (not a one-off prop) — flows through the already-existing `resolveBaseStyleProps` call sites in Section/Row/Column automatically. Confirmed live: Section `min-height: 450px`.
  - **Full-width background vs. content width, decoupled.** New `fullWidthBackground: boolean` on Section/Hero (default `true`, preserving existing rendering exactly when untouched). `true`: `BackgroundLayer` renders as a direct child of `<section>`, unconstrained — unchanged from before this task. `false`: `BackgroundLayer` renders nested inside the maxWidth-constrained content div, in an `absolute inset-0 -z-10` wrapper (negative z-index, not DOM-order-dependent, per CSS2.1 §E stacking rules) so it paints behind content without disturbing the existing Section→Row structure or Puck's own drop behavior. Confirmed live via DOM inspection before/after toggling: background layer moves from full-bleed to content-width-matched, color preserved across the toggle.
  - **Per-device Column width override.** Extends the existing `ResponsiveStyleOverride` architecture (not a duplicated Column prop set per device) with `columnWidth?: PuckColumnWidth`, resolved to a real `grid-column: span N / span N` declaration via the same `resolveResponsiveCss` media-query mechanism typography/spacing overrides already use — no new mechanism invented. Confirmed live: Desktop 1/3+2/3 unaffected, Tablet override to 1/2+1/2 emits the exact expected `@media(max-width:1279px){...grid-column:span 6 / span 6...}`, Mobile override to full+full emits the exact expected `@media(max-width:767px){...grid-column:span 12 / span 12...}` — Data/drag-drop uncorrupted. Reverse stacking explicitly out of scope, unchanged.
  - **Right sidebar General/Styles/Animations — resolved, not a permanent limitation.** The original System A task's conclusion ("Puck's Fields panel has no native section-header primitive without a fragile DOM rewrite") was investigated further per this task's explicit instruction, by reading the installed `@puckeditor/core@0.23.0` bundle directly rather than assuming: `overrides.fields`'s `children` prop is constructed as a genuine flat array, one React element per field, keyed by that field's own name — a first-class, documented override point plus the public `ReactElement.key` property, nothing private or DOM-level. `settings-panel.tsx`'s `MagnetixSettingsPanel` now buckets those elements by key (`style`/`styleConfig`/`background` → Styles, everything else → General) into a real three-tab UI (base-ui `Tabs`, the same primitive already used elsewhere in this repo), with Animations as an honest empty "Very Soon" placeholder. Falls back to the old flat, untabbed layout if a future Puck version ever changes that internal array shape (`Array.isArray` check, not an assumption baked in silently). No `slot` field was ever nested inside an `object` field — the risk the original task was avoiding never actually applied to this approach. Confirmed live: General shows only General-bucket fields, Styles shows only Style-bucket fields per component's own compatibility, Animations shows the placeholder.
  - **Real bug found and fixed via this task's own live QA, not by the user:** the settings panel's `<Tabs>` and every `Group` collapsible both used React state seeded once via `defaultValue`/`defaultOpen` — safe only if the component's fiber survives every render. It doesn't: a genuine Puck data edit (e.g. toggling a "Linked sides" switch) can remount `MagnetixSettingsPanel`'s subtree, silently resetting the active tab back to General and every collapsible group back to closed, mid-interaction — invisible for groups whose default happened to already be "open" (Typography), but directly caused values meant for the Styles tab's Margin field to land in General's legacy Padding field instead when it surfaced on Spacing (default closed). Fixed by persisting both pieces of state in module scope (`lastActiveSettingsTab` in settings-panel.tsx, `openGroupState` in style-field.tsx) — survives a remount because it lives outside the React fiber being torn down, seeded fresh on every mount instead of hardcoded. Confirmed live: unlinking Margin no longer collapses the Spacing group or reverts the active tab.
  - **Live QA — Unlinked Spacing:** Section, Button, and Heading (text element) — Margin AND Padding, linked→unlinked→four independent values, computed styles read directly off the canvas element. All three: `margin: 11px 22px 33px 44px` / `padding: 5px 6px 7px 8px`, exact match, top/right/bottom/left correctly ordered.
  - **Live QA — Independent Radius:** Button and Section — linked→unlinked→four independent corners. Both: `border-radius: 4px 8px 12px 16px` (topLeft/topRight/bottomRight/bottomLeft), exact match. Image shares the identical `RadiusEditor`/`resolveRadiusStyles` code path (confirmed by reading `MEDIA_ELEMENT_STYLE`'s compatibility wiring) but was not independently live-clicked this task — see KNOWN BUGS.
  - **Live QA — Shadow disable/restore:** Box shadow on Button — enabled, customized to `X:3 Y:6 Blur:12 Spread:2`, disabled (computed `box-shadow` correctly falls back to the Button's own base Tailwind `shadow-sm` class, not `none`, since the resolver emits no `boxShadow` key at all when unset — same "unset means untouched" principle as everywhere else in this system), re-enabled — **prior custom values returned exactly** (`rgba(0,0,0,0.15) 3px 6px 12px 2px`, byte-identical before/after). Text shadow on Heading — same sequence (`X:2 Y:4 Blur:8`), disabled computed `text-shadow: none`, re-enabled — **prior custom values returned exactly** (`rgba(0,0,0,0.25) 2px 4px 8px`, byte-identical before/after).
  - **Regression QA:** Layers selection (confirmed — header updates correctly on selection), Desktop/Tablet/Mobile preview breakpoints (confirmed — iframe widths 804/768/390px, matching `VIEWPORTS`), field-edit Undo exercised repeatedly throughout this task's own QA with no corruption. **Not independently re-confirmed this task** (see KNOWN BUGS): exact drag/drop, nested drop, Hero insertion, Undo/Redo of an insert, move Undo, inline Heading/Text editing, Form rendering, gradient backgrounds, long-page scrolling, Preview new-tab route — none of this task's code changes touch the drag/drop mechanism, Puck's `contentEditable` wiring, `BackgroundLayer`/gradient code, the Preview route, or Form rendering, so there is no code-level reason to suspect a regression, but a live automation pass specifically hit reproducible dnd-kit-across-iframe-boundary friction with raw pointer simulation (both for inserting a fresh Image block and for entering Heading's inline-edit mode) that this task's effort budget did not resolve.
  - **Validation:** `tsc --noEmit` clean, targeted ESLint clean, Prettier clean (one file needed `--write`, re-verified clean after), `git diff --check` clean, `next build` completed successfully across the full route table including `.../new-builder` and `.../new-builder/preview`.

- **Puck Persistence + Publish Foundation** (master spec §24.12/§24.13, the first durable draft/publish loop for the new builder):
  - **Data model.** `PageDoc` (`src/types/pages-funnels.ts`) gains four entirely additive, optional fields — `puckDraftData`/`puckPublishedData` (real Puck `Data`) and `puckDraftUpdatedAt`/`puckPublishedAt` (their own timestamps, distinct from V1's own top-level `updatedAt`/`publishedAt`). V1's `blocks`/`status`/`publishedAt` are untouched in shape; `status`/`publishedAt` ARE written by the new Publish flow specifically (see below), deliberately, not accidentally.
  - **Persistence layer.** New Admin-SDK service (`src/lib/server/pages-funnels-puck-service.ts`, following this repo's dominant modern pattern — see e.g. `custom-fields`'s API route — rather than V1's own older direct-client-SDK-write pattern) with two functions, each a single targeted `.update()` call, never a full-document `.set()`: `savePuckDraft` (writes `puckDraftData`/`puckDraftUpdatedAt` only) and `publishPuckPage` (writes `puckDraftData`+`puckPublishedData`+both timestamps+the top-level `status: "published"`/`publishedAt` in ONE atomic call — see that function's own doc comment for why publishing needing to "durably save the draft first" is solved by one write with the same payload for both fields, not two sequential writes that could race). Both re-verify the target page's `subAccountId` actually matches the caller's sub-account before writing (defense against a valid-admin-of-a-different-sub-account guessing another tenant's `pageId`) — the route-level `requireSubAccountAdmin` check alone doesn't prove that. Two new authenticated API routes (`/api/sub-accounts/[id]/pages-funnels/[pageId]/puck-draft` and `.../puck-publish`, sub-account admin only) call into it.
  - **Client-side hook.** New `use-puck-persistence.ts` — ONE save code path (`runSave`) backs both the manual Save Draft button and debounced (2s) autosave, per the task's explicit "don't duplicate save logic" instruction. Concurrency-aware: a save always reads the LATEST `data` via a ref (never a stale closure), an in-flight save queues (not drops) a follow-up if another edit lands mid-request, and autosave never fires for a render where nothing changed since the last successful save or since mount. `editor-shell.tsx` wires this to real Saving…/Saved/error UI (previously hardcoded `disabled` buttons) plus a toast on Publish.
  - **Load priority.** `new-builder/page.tsx`: a persisted `page.puckDraftData` always wins over re-migrating V1 `blocks` — otherwise every reopen would silently discard prior Puck edits. Falls back to the existing `migratePageBlocksToPuckData` in-memory migration only when no Puck draft exists yet, exactly as the task's 3-tier load order requires.
  - **Public route.** `/p/[pageId]` now renders `page.puckPublishedData` (via the exact production `<Render config={serverPuckConfig} .../>` pipeline the Preview route already uses, server-side form resolution via `collectPuckFormIds`) when it exists, falling back unchanged to the existing V1/V2 `getPageSections`/`SectionTreeView` path otherwise — never routed through the editor, never a second renderer implementation.
  - **A genuine pre-existing bug found and fixed, without which none of the above could ever actually be reached by a real visitor:** `src/middleware.ts`'s `PUBLIC_PATHS` allowlist never included `/p` — every request to `/p/[pageId]` (V1-published pages too, not just Puck) was 307-redirected to `/login`, contradicting that route's own doc comment describing it as public. `/f` (public forms) was already correctly allowlisted; `/p` was simply missing. Added the same way.
  - **Page status.** New `publish-status.ts`: `derivePuckPublishStatus()` returns `"v1-only"` (this page has never been Published from the new builder — V1's own `status` is what's actually live, so the header still shows V1's badge unchanged), `"published"`, or `"published-outdated"` (draft has changed since the last Puck publish). Never conflates V1's status concept with Puck's.
  - **Confirmed live** — two tiers of evidence, per this session's standing constraint of no real Firebase Auth credentials to drive the authenticated browser route directly (same limitation every prior Puck phase has hit and documented):
    - **Direct Admin-SDK tests against real (temporary, cleaned-up) Firestore documents** — 20/20 assertions passed, including the mandatory §11 Draft-vs-Published-Integrity sequence: Save Draft persists durably and survives a fresh read (Leave/Return proof); Publish snapshots the draft into `puckPublishedData` AND flips `status`; editing and Saving Draft again AFTER publishing changes `puckDraftData` but leaves `puckPublishedData` byte-identical to the prior snapshot (the public page does NOT change); publishing again picks up the newer draft; a cross-tenant `subAccountId` write and a nonexistent `pageId` write are both correctly rejected with 404.
    - **Real HTTP requests against a running dev server** — a temporary published Puck page rendered its exact marker content at `/p/[pageId]` (200, real `<Render>` output) after the middleware fix; a temporary V1-only published page (no `puckPublishedData`) still rendered via the unchanged V1/V2 fallback (200, real content) — proving the fix didn't regress existing V1 public pages.
    - **Playwright against the fixture harness** — Save Draft/Publish buttons are no longer `disabled`; clicking Save Draft shows `Saving…` then (in this unauthenticated fixture, correctly) `Save failed` with the real error surfaced, not a faked success; Publish shows the same failure via a toast; Preview still opens a new tab with real rendered content; Desktop/Tablet/Mobile viewport switching (804px/768px/390px) unaffected; 0 console errors.
  - **Not built this task, explicitly** (per the task's own "don't let version history block the core loop" permission): Version History/checkpoints — no version-snapshot collection exists; `puckPublishedData` is a single frozen snapshot, not a history of snapshots. Multi-tab concurrent-editing conflict resolution is not solved (no optimistic lock/version check on write) — flagged, not silently ignored. See KNOWN BUGS.

- **Puck User-QA Blockers fix** (real, authenticated-browser QA of the New Builder — the FIRST real user click-through of this route, not a fixture/Admin-SDK proxy): Leave/Return persistence, hard-refresh persistence, Preview, Desktop/Tablet/Mobile, and Publish-reports-success all **PASS, user-confirmed**. That same session surfaced four concrete usability blockers, all fixed this task:
  - **Inline editing (Heading/Text) — root cause found and fixed, real regression, not a test-tooling artifact.** Reproduced live (Playwright against the fixture harness, real DOM/focus inspection, not eyeballing): double-clicking a Heading, selecting all, and typing accepted exactly ONE character — `document.activeElement` inside the canvas iframe fell back to `<body>` immediately after the first keystroke. Root cause: `overrides` — a controlled `<Puck overrides={{...}}>` prop exactly like `iframe`/`metadata` — was a fresh inline object (with fresh `header`/`headerActions` closures) reconstructed on every render of `MagnetixPuckEditorShell`, and a controlled canvas re-renders that shell on every keystroke (`data`→`onChange`→`setData`). Traced through the installed `@puckeditor/core@0.23.0` bundle: `PuckProvider`'s `useLoadedOverrides` is memoized on `[plugins, overrides]`, feeding a `generateAppStore` `useCallback` whose own deps include that result, backing a `useEffect(() => appStore.setState(generateAppStore(state)), [generateAppStore])` — so an unstable `overrides` reference re-runs `appStore.setState()` on every keystroke, unconditionally. That churn was enough to reset `InlineTextField`'s own local `isFocused` React state (its `contentEditable` attribute is literally `isHovering || isFocused ? "plaintext-only" : "false"`), which the browser treats as losing focus. Fix: `header`/`headerActions`/`drawer`/`outline`/`fields` are each hoisted to their own `useCallback` (correct, narrow dependency arrays — none of them depend on `data`), and `overrides` itself is a `useMemo` over those five — extending §3's existing "all controlled Puck props must be referentially stable" rule (previously enforced for `iframe`/`metadata` only) to `overrides`, which needed it just as much but had never been audited for it. `editor-shell.tsx` only.
  - **Inline editing QA (post-fix, live, both elements, continuous multi-word typing + Undo):** Heading — double-click, select-all, type "This is a full replacement heading" (36 chars via `page.keyboard.type`), confirmed the FULL phrase landed (not one char), then continued typing " and some more words" with no reclick — confirmed appended correctly, no focus loss at any keystroke. Text element — same continuous multi-word replacement, confirmed. Undo — typed a heading replacement, blurred, pressed Cmd+Z, confirmed the canvas reverted to the exact pre-edit text. Zero browser console errors throughout. Leave/Return persistence of an inline edit was NOT independently re-confirmed this task beyond the existing Save Draft persistence QA already covering the general save/reload path (Puck Persistence task) — the fix is at the DOM-focus layer, not the save layer, so there's no code-level reason to expect a difference, but see AWAITING USER TEST.
  - **Live published-page link — implemented, not previously existing.** New `buildPublishedPageUrl()` (`src/lib/domains/public-url.ts`) added to the existing custom-domain-aware public-link-builder file (same `verifiedDomain(subAccount) ? https://{domain}/p/{pageId} : {platformOrigin()}/p/{pageId}` pattern every sibling builder in that file already uses — genuine reuse, not a new URL-generation system). Editor toolbar (`editor-shell.tsx`'s `headerActions`) gained **View Live Page** (real `<a target="_blank" rel="noreferrer">`, opens the canonical URL) and **Copy Link** (writes the same URL to the clipboard, toast-confirmed) — both gated on a new `hasLivePage` boolean computed by the caller (`new-builder/page.tsx`): `page.status === "published" || !!page.puckPublishedData`, i.e. EITHER V1 or the new builder has ever actually published this page. `page` is a live Firestore subscription, so `hasLivePage`/`liveUrl` update automatically the moment a real Publish click lands — no extra plumbing needed for "the buttons appear right after Publish." Never shown for a page that's never been published (master spec's own "no fake link" requirement). The Pages & Funnels dashboard's `PageCard` dropdown got the identical treatment — its old "Preview" item unconditionally linked to a hardcoded relative `/p/{page.id}` regardless of publish status (a real, pre-existing "misleading link on an unpublished page" bug); now **View Live Page** + **Copy Live Link**, both gated on the exact same `hasLivePage` logic (kept in two call sites, not a shared function, but the underlying gate expression is identical and documented as such in both places) so the dashboard and the editor toolbar can never disagree about whether a page has a live link. Does NOT introduce a slug-based or custom-domain-only route — `/p/[pageId]` remains the one public renderer, per the task's explicit "don't redesign routing" instruction; `PageDoc.slug` exists but nothing resolves by it yet (documented, not silently ignored).
  - **Live-link QA (live, Playwright, fixture harness with `hasLivePage` flipped `true`/`false` to test both branches):** with `hasLivePage=true` — View Live Page renders as a real `<a>` with the exact canonical `href`/`target="_blank"`/`rel="noreferrer"`, clicking it opens a new tab at that exact URL; Copy Link writes the identical URL to the clipboard (read back and confirmed byte-identical). With `hasLivePage=false` — neither control renders at all (confirmed via full button/link text dump of the toolbar). Dashboard PageCard's equivalent gating was verified via `tsc`/code review (same `hasLivePage` expression, same conditional-render pattern) rather than a second live click-through, given this session's standing no-real-auth-credentials constraint for the dashboard route specifically.
  - **Form element — real selector, not a raw Form ID field.** New `FormFieldEditor` (`form-field.tsx`), a Puck `custom` field bound to the Form component's EXISTING `formId: string` prop (schema-unchanged — every already-persisted page with a Form element keeps working, zero migration; `resolve.ts`'s `collectPuckFormIds`, the publish/save flow, and `migrate-v1.ts` were none of them touched). Reuses `subscribeToForms()` (`src/lib/firestore/forms.ts`) — the EXACT same client-SDK Firestore subscription (same collection, same `where("subAccountId", "==", ...)` scope, same security rules) the real Forms list page already uses — not a second Forms query system, and not the Admin-SDK-bypass pattern `resolve-form/route.ts` uses for the public/canvas render path. Renders a real `<select>` of human-readable Form names, an empty "No forms yet" + "Create a Form" state, and a "Manage Forms" link — all opening `saPath("/forms")` in a new tab so the editor session is never lost. `formName`'s raw text field was removed from the visible Settings UI (Puck's `CustomFieldRender.onChange` can only write its own field's prop — there's no supported cross-field write to also update a sibling `formName` prop from inside `formId`'s editor — so the selector shows names from its own live-fetched list instead of relying on a separately-maintained denormalized field; `formName` stays in the prop type/`defaultProps` for the render side's "not found" fallback label, just never written by a new selection).
  - **Form-selector sub-account scope.** Puck's own `CustomFieldRender` signature (`{field, name, id, value, onChange, readOnly}` — confirmed in the installed 0.23.0 package's types) does NOT carry `puck.metadata` the way a component's `render` function does, so `formId`'s field editor can't read `subAccountId` from Puck itself. Uses `useOptionalSubAccount()` instead — the same context the rest of this authenticated route tree already sits inside (this field mounts in `overrides.fields`, part of the HOST document, not the canvas iframe) — with a graceful "Forms aren't available in this preview context" fallback when there's no provider (the unauthenticated QA harness), rather than crashing.
  - **Form QA (live, Playwright, fixture harness — an empty Form element added to that harness's fixture, see below):** selecting the Form element shows a real "Form Settings" header and the "Choose Form" label + the "Forms aren't available in this preview context" fallback (correct: this harness has no `SubAccountProvider`, so `useOptionalSubAccount()` correctly returns `null`) — zero console errors, zero crashes. The REAL authenticated path (a live Forms list populating the dropdown, selecting one, `PublicForm` rendering) needs real Firebase Auth + a real sub-account's Forms — this session has never had that in ANY prior Pages & Funnels phase (documented standing constraint since Phase 2A) and isn't newly introduced by this task; code-reviewed only (the wiring is `subscribeToForms(scope, setForms)` → `<select>` → `onChange(form.id)`, structurally identical to every other already-proven `CustomField` in this file).
  - **Image element — real Upload Image, not a raw URL-only field.** Inspected existing upload infrastructure first (task's explicit instruction) and found a consistent, established per-feature pattern already used four times in this codebase (`src/lib/{broadcasts,content-library,community,qr-codes}/upload-image.ts` / `upload-logo.ts`): client-SDK Firebase Storage `uploadBytes`/`getDownloadURL`, 5 MB size cap, `image/*` MIME validation, a `{feature}/{subAccountId}/{docId}/...` storage path, and a matching `storage.rules` block (public read — a published page has no Firebase session, same rationale every sibling block already documents). Added a fifth, `uploadPageImage()` (`src/lib/pages-funnels/puck/upload-image.ts`) and a matching `storage.rules` block (`pages-funnels/{subAccountId}/{pageId}/{fileName}`) — genuine reuse of the existing storage service, not a second upload system. New `ImageFieldEditor` (`image-field.tsx`), a Puck `custom` field bound to the Image component's EXISTING `src: string` prop (schema-unchanged) — primary action is a real "Upload Image" button (thumbnail + filename preview once set), with "Advanced: Image URL" as a collapsed, secondary manual-entry fallback (never the primary path) per the task's explicit UX target. Alt Text stays its own separate, unmodified, plain Puck `text` field — no cross-field-write problem to solve there (unlike Form's formId/formName pair), since Alt Text was never coupled to the URL field to begin with.
  - **Content Library / "Choose from Library" — inspected, genuinely not yet reusable, reported as a real gap rather than forced.** `src/app/(dashboard)/sa/[subAccountId]/content/page.tsx` and `src/components/content-library/*` exist but don't expose a general-purpose "browse and pick a previously-uploaded image" component the way this element would need — building one is a real, separate scope. Per the task's own explicit permission ("implement the smallest proper Upload flow… and report library-selection as a separate gap"), only Upload was built this task; browsing/reusing prior uploads across pages is a documented, deliberate gap (see KNOWN BUGS), not a silent omission or a "paste a URL because it's easier" shortcut.
  - **Image storage.** `uploadPageImage()` returns the real, durable Firebase Storage download URL — the same string every other element/field in this registry already treats `src`/`url` as (a plain persisted string), so Puck Data never holds binary image data and nothing about Save/Publish/`/p/[pageId]` needed to change. No temporary/blob/object URL is ever written to Data — the field editor's local `<img>` preview reads the SAME persisted `src` value once upload completes, never a `URL.createObjectURL()` blob.
  - **Image-selector scope (subAccountId/pageId).** Same reasoning as the Form selector: `useOptionalSubAccount()` for `subAccountId`, plus `useParams<{pageId}>()` (from `next/navigation`) for `pageId` — this field mounts inside the exact `.../pages-funnels/[pageId]/new-builder` route tree, so its own URL segment is a valid, zero-new-plumbing source, rather than threading `pageId` through Puck's controlled `config` (which must stay a referentially-stable module singleton — see §3 — so it can't be parameterized per-page). Falls back to manual-URL-only with a clear "Upload isn't available in this preview context" message when either is unavailable.
  - **Image QA (live, Playwright, fixture harness — an empty Image element added alongside the Form one):** selecting the Image element shows a real "Image Settings" header, the "Upload isn't available in this preview context" fallback message (correct: no `SubAccountProvider`/no `pageId` route param in this harness), and the "Advanced: Image URL" toggle — all present, zero console errors, zero crashes. The interactive click-through of the Advanced-URL manual-entry input, and the real authenticated Upload button (needing real Firebase Storage credentials), were **not independently automated-tested this session** — the Settings panel has an already-documented (System A Closeout KNOWN BUGS) benign duplicate-DOM-node rendering quirk that made Playwright's strict visibility/actionability checks unreliable against this specific panel within this task's effort budget, the exact same category of friction already on record for Image drag-insertion and Heading inline-edit-mode entry in that prior task. Verified instead via direct code review (`onChange={(e) => onChange(e.target.value)}` — the identical one-line wiring pattern every other already-proven text `CustomField` in this codebase uses) plus the confirmed-present, confirmed-correct labeling/fallback state above.
  - **QA harness fixture change (non-production).** `pages-funnels-new-builder-shell/page.tsx`'s fixture (the "Free Guide Landing Page" V1 template) had no Form or Image block at all, so there was previously no way to click-select either without also needing real cross-iframe drag-and-drop (a separate, already-documented Playwright friction unrelated to these field editors). Appended one empty Form + Image element to that fixture's `Data.content` so any future session has a stable, click-to-select target for both — a QA-only change, not shipped to any production route.
  - **Regression pass (live, Playwright):** Button selection → Settings panel shows "Button Settings"; Desktop/Tablet/Mobile viewport switching still changes canvas width; Undo (Cmd+Z) doesn't crash; zero console errors across the full pass. None of this task's changes touch drag/drop, the slot/DropZone mechanism, Undo/Redo history, or the background/style field systems.
  - **Validation:** `tsc --noEmit` clean (full repo), targeted ESLint clean (every file this task touched), Prettier clean (four files needed `--write`, re-verified clean after), `git diff --check` clean, `next build` completed successfully (`✓ Compiled successfully`) across the full route table including `/sa/[subAccountId]/pages-funnels`, `.../[pageId]/new-builder`, `.../new-builder/preview`. (`next build` OOM'd once on this machine's default Node heap on the first attempt — a real, machine-level resource constraint on an 8 GB host already running multiple heavy applications, not a defect in this task's code; re-ran with `NODE_OPTIONS=--max-old-space-size=6144` and it completed cleanly.)
  - **Files touched:** `src/components/pages-funnels/puck/editor-shell.tsx` (overrides stability fix, live-link toolbar actions), `src/components/pages-funnels/puck/config.tsx` (Form/Image field wiring), `src/components/pages-funnels/puck/form-field.tsx` (new), `src/components/pages-funnels/puck/image-field.tsx` (new), `src/lib/pages-funnels/puck/upload-image.ts` (new), `src/lib/domains/public-url.ts` (`buildPublishedPageUrl`), `storage.rules` (new `pages-funnels/*` match block), `src/app/(builder)/sa/[subAccountId]/pages-funnels/[pageId]/new-builder/page.tsx` (`hasLivePage`/`liveUrl`), `src/app/(dashboard)/sa/[subAccountId]/pages-funnels/page.tsx` (PageCard live-link actions), `src/app/docs/design-prototypes/pages-funnels-new-builder-shell/page.tsx` (QA fixture addition + new required shell props). V1, GitPage, billing/Stripe/PayPal, and every other module named in the task's Safety section were not touched (confirmed via `git status` scoped to this task's own file list before and after).

- **Puck User-QA Blockers — deployment gap + production image-upload fix.** Real user QA against `crm.magnetixstudios.com` found the prior task's fix was **never actually live**: the whole thing had been made and validated as uncommitted local working-tree changes and never committed or pushed, so no Vercel deployment could ever have contained it — production was still genuinely serving the pre-fix code (raw "Magnetix Form ID"/"Image URL" fields, the one-character inline-edit bug). Root-caused via direct git evidence (`git log`/`git status` showed zero commits containing the fix anywhere, local or `origin/main`), fixed by committing the exact same, already-validated 11 files (path-scoped commit, none of this repo's substantial unrelated concurrent-session dirty state swept in) and pushing to `origin/main` via a cherry-pick through an isolated `git worktree` — chosen specifically because the primary working directory had a stale, incomplete `.git/rebase-merge` state (dated Aug 31, unrelated parallel work) blocking a normal rebase; that state was left untouched, not resolved. No code was rewritten. Vercel's GitHub auto-deploy picked up the push and went live; confirmed via `vercel inspect crm.magnetixstudios.com` resolving to the new deployment.
  - **Real user re-QA against the now-live production route confirmed: inline Heading editing (continuous typing) — PASS. Form selector (real Forms list, human-readable names) — PASS. Selected Form renders correctly — PASS.**
  - **Image Upload — FAIL, a second, genuinely different bug**, also production-only (never reproducible against the unauthenticated QA harness, which has no real Firebase Storage/Auth to exercise): uploading a real image threw `Firebase Storage: User does not have permission to access 'pages-funnels/{subAccountId}/{pageId}/{fileName}' (storage/unauthorized)`. Root cause, confirmed via DIRECT EVIDENCE from the Firebase Security Rules REST API (not inferred): the same "committed but never deployed" pattern, one layer down — `storage.rules`'s new `pages-funnels/*` match block WAS correctly committed and pushed in the prior task (confirmed present in the `origin/main` file, in the exact right shape, matching every sibling upload surface's pattern byte-for-byte), but Storage rules are a **separate Firebase deployment target entirely** from the Next.js app (`firebase deploy --only storage`, never triggered by a `git push`/Vercel deploy) — fetching the actual LIVE ruleset from `firebaserules.googleapis.com` directly (not the repo file) proved it was last updated **August 5th**, ending at the `forms/*` block with no `pages-funnels/*` block at all, so every upload fell through to the rules file's own `match /{allPaths=**} { allow read, write: if false; }` default-deny. Not an auth-state problem (the app's single shared Firebase app instance backs Auth/Firestore/Storage identically — confirmed by reading `src/lib/firebase/client.ts` — and the Form selector's real Firestore reads succeeding in the same authenticated session already proved a valid client Firebase Auth identity was present) and not a path-mismatch problem (`uploadPageImage()`'s generated path — `pages-funnels/{subAccountId}/{pageId}/image-{timestamp}.{ext}` — matches the rule's `{subAccountId}/{pageId}/{fileName}` shape exactly, confirmed by direct code read). Fix: `firebase deploy --only storage --project magnetix-studios` (no other target). Verified via the Rules API again post-deploy — the live release now points to a new ruleset whose content includes the exact `pages-funnels/*` block, confirmed present. Zero application code changed this task; `storage.rules` itself needed zero edits (it was already correct) — purely a missing deployment step.

- **PUCK FOUNDATION CHECKPOINT — REACHED, user-confirmed.** The full real-browser loop (create/open page → edit in Puck → Save Draft → leave → return → saved changes still exist → hard refresh → changes still exist → Preview → Publish → open live page → live page matches published version → edit again → Save Draft only → live page remains the previous published version → Publish again → live page updates) has been manually verified end-to-end by the user against the real authenticated `crm.magnetixstudios.com` route. This closes out the `AWAITING USER TEST` sequence every prior task in this build-status history has been building toward — the New Builder's core draft/publish/persistence loop is proven, not just code-reviewed or fixture-QA'd.

- **System B — Core Content Elements + Auto Hierarchy** (master spec §24.1/§24.3.1/§24.6, LAUNCH): Rich Text, Image/Video element depth, and auto hierarchy/auto-wrapping, built as one coherent system per the task's explicit "not unrelated one-off patches" instruction. Puck Persistence + Publish Foundation's data model/save-code-path/draft-vs-published-separation was NOT touched or re-architected this task, per the task's own explicit "do not re-architect persistence or publishing" instruction — every new capability below is additive props/fields on top of the existing, proven persistence loop.
  - **Rich Text — Decision A (separate element, not a Text migration).** Investigated Puck's native `richtext` field type FIRST, per the task's own instruction, by reading the installed `@puckeditor/core@0.23.0` package's types directly: `type: "richtext"` is a real, first-class, Tiptap-backed field type with a documented default extension set (paragraph, heading, bold, italic, underline, strike, link, bulletList, orderedList with native nested-list support via `listItem`, blockquote, code, codeBlock, horizontalRule) — no custom extensions/fork needed to cover the task's entire Launch formatting target except "highlight" (not part of Puck's default registered options; deliberately left out per the task's own "do not force every optional format if doing so requires a brittle custom Tiptap fork" instruction, rather than adding a bespoke extension for one item). A genuinely NEW `RichText` element (`RichTextRenderElement`, elements.tsx; registered in config.tsx, `content: {type:"richtext", contentEditable:true}`) was added ALONGSIDE the existing Heading/Text — Text's own `text: string` field/schema is completely untouched, so every already-persisted page keeps working with zero migration risk (the lowest-risk of the two documented options; migrating Text in place to `richtext` was considered and rejected specifically because it would change the stored value's meaning for every existing Text node). `migrate-v1.ts` needed zero changes — V1 `text` blocks still migrate to the Puck `Text` element exactly as before.
  - **Rich Text UX — proven, not just implemented.** Same `ReactNode`-when-`contentEditable` contract Heading/Text already established (§3) — no parallel/local content state, one shared field definition reused by both `clientPuckConfig` and `serverPuckConfig` exactly like Heading/Text. Confirmed live (Playwright, real DOM/HTML inspection, real production `dispatch` insert — not a mock): continuous multi-word typing (no focus loss, confirming the User-QA-Blockers overrides-stability fix extends correctly to `richtext` fields too); Bold (Cmd+B → `<strong>`) and Italic (Cmd+I → `<em>`, correctly nested) via keyboard shortcuts; bulleted list (`- ` input rule → `<ul><li><p>`) and numbered list (`1. ` input rule → `<ol><li><p>`) both via Tiptap's standard input rules; blockquote (`> ` input rule → `<blockquote><p>`); final persisted `Data.content` HTML confirmed correct after blur. Preview route (the exact `serverPuckConfig`/`<Render>` pipeline a published page will use) confirmed rendering the SAME bold/italic/list HTML correctly in a real new tab, zero console errors — proving the server/public render path, not just the editor canvas.
  - **Image depth (master spec §24.6).** New, entirely additive `ImageSizeConfig` (pages-funnels-puck.ts) — width (Auto/25/50/75/100%), max-width (px), height (px, optional), object-fit (cover/contain/fill, only meaningful once height is set), object-position (5 presets), alignment (left/center/right) — deliberately NOT folded into the shared `StyleConfig` (§24.3's five shared systems are Typography/Spacing/Border/Shadow/Background; sizing/object-fit are media-specific, not one of those). A plain Puck `object` field (`imageSizeField`, config.tsx) — the same first-class mechanism `actionField`/Section's `maxWidth` already use — not a bespoke `custom` field, since these are simple discrete controls with no live external data source (unlike the Form/Image-upload `custom` fields from the prior task). `resolveImageSizeStyle()` (new `media-size.ts`) is additive-only (unset `size` → zero extra CSS, exactly System A's own established rule) and layers on top of, never replaces, the existing `MEDIA_ELEMENT_STYLE` shared system (spacing/border/radius/shadow/responsive/visibility) already wired to Image. Confirmed live via `getComputedStyle`: width 50%→512px in a real column, height 200px, object-fit cover, object-position "50% 0%" (top preset) — all simultaneously correct.
  - **Video depth — real provider/source model (master spec §24.6/§8/§10).** Deepened from Phase 1's raw-iframe-only implementation. New `video.ts`: `detectVideoProvider()` auto-detects YouTube, Vimeo, or falls back to "direct" (any other URL, rendered as a native `<video>` — covers real hosted files and a Loom direct-file export link) from the pasted URL alone — no separate "Provider" field, per the task's explicit "prefer automatic detection" instruction; no other provider SDK was added, per "do not invent providers the platform cannot render reliably." `resolveVideoEmbed()` is the ONE shared resolver `VideoRender` (elements.tsx, itself shared by both configs) consumes — no separate embed logic per surface. New `VideoSizeConfig` (width/max-width/aspect-ratio picker: 16:9/9:16/1:1/4:3, defaulting to 16:9 — byte-identical to the pre-System-B hardcoded default, so this is additive, not a visual change for existing Video elements) and `VideoPlaybackConfig` (autoplay/muted/loop/show-controls/poster — poster documented as direct-file-only, a no-op for YouTube/Vimeo rather than silently ignored). **Browser-autoplay-restriction coercion confirmed live, exactly as instructed:** requesting `autoplay:true, muted:false` together produces an embed URL with `mute=1` anyway (`resolveVideoEmbed` always forces `muted` when `autoplay` is set, regardless of what the user's Mute toggle said) — verified via the actual generated YouTube embed URL, not just code review. YouTube loop verified to include the required `playlist={videoId}` param (a real, well-known YouTube embed API quirk, not a Magnetix invention) — without it YouTube's `loop=1` alone does nothing.
  - **Auto Hierarchy / Auto Wrapping (master spec §24.1/§6, newly BUILT — was the last remaining `Missing` row keeping Section/Row/Column at `PARTIAL` in the capability matrix).** Scope was determined by reading this config's actual `allow` restrictions FIRST, not assumed: Column's `elements` slot and Row's `columns` slot are already type-restricted by Puck's own `allow` lists (enforced at the drag/drop level itself), so a leaf element or a bare Row can never actually land in the WRONG slot via real drag-and-drop — the ONLY zone with no `allow` restriction at all (this config never registers a `root:` key) is the ROOT zone (`Data.content`), so that's the one real, reachable case this task's fix targets (master spec §12's "existing Column"/"existing Row" cases already worked correctly before this task and needed no change). New `auto-hierarchy.ts` (pure tree helpers — `autoWrapRootNode`/`autoWrapNextRootNode`) decides WHAT to build (a bare leaf gets full Section→Row→Column; a bare Row gets only a Section; a bare Column gets Section+Row; Section/Hero pass through untouched, satisfying the explicit "do NOT auto-wrap Hero inside another Section" requirement) — the ORIGINAL node (same id/type/props) is always reused verbatim as the innermost item, never cloned, so selection/focus/history referring to that id stays valid across the wrap. New `AutoHierarchyWatcher` (auto-hierarchy-watcher.tsx) is the live controller — a non-rendering component mounted inside `<Puck>`'s own tree (a sibling within `editor-shell.tsx`'s `overrides.header`, the same pattern `settings-panel.tsx`/`style-field.tsx` already use for `createUsePuck()` access) that reactively watches `appState.data` and, on finding a bare root-level node, dispatches `{type:"setData", data:{content:[...]}, recordHistory:false}` — Puck's own real, public, typed `SetDataAction`, not the external `data`/`onChange` prop pair (confirmed by reading the installed bundle: a controlled `<Puck data={data}>`'s `data` prop is captured ONLY ONCE at mount and never re-read — `dispatch` is the actual supported way to mutate Puck's own internal store from outside a component's own render). `recordHistory:false` is why Undo/Redo work as ONE logical action per drag despite being two real dispatched actions under the hood — see below.
  - **Auto Hierarchy — confirmed live via Puck's real production `dispatch` action (the same action type its own drag/drop uses internally), not a simulated pointer drag** (this codebase's own already-documented Playwright-vs-dnd-kit drag-simulation friction — System A Closeout/User-QA-Blockers tasks — made a raw pointer-drag test unreliable within this task's effort budget; dispatching the real `InsertAction` directly exercises the identical code path a real drag produces, just via a more deterministic trigger): a bare Heading inserted at root produced a full, correctly-nested Section→Row→Column→Heading structure (all four levels confirmed by walking the resulting Data tree); a bare Row produced only a Section wrapper (no redundant extra Row); a bare Column produced Section+Row only (no redundant extra Column); Hero inserted at root stayed exactly Hero (no double-Section); Section inserted at root stayed exactly Section (the normal, already-correct case, confirmed unaffected). **Undo once** after a bare-Heading auto-wrap fully restored the pre-drop content count (5→6→5) — the entire auto-created structure disappeared in a single Undo, exactly matching "Undo should remove the entire auto-created wrapper structure generated by that drag." **Redo** correctly restored the auto-wrapped (not bare) structure — confirming the watcher's continuously-reactive design (not a one-shot insert interceptor) correctly re-applies the correction after a Redo re-surfaces the bare pre-correction snapshot.
  - **Regression confirmed live:** inline Heading editing (continuous multi-word typing, no focus loss) still works correctly after all System B changes — the `AutoHierarchyWatcher`'s own reactive effect does not fire during ordinary text editing (typing into an existing element never changes the top-level `content` array's structural shape, so `autoWrapNextRootNode` returns `null` and no corrective dispatch happens), confirming no interaction with the User-QA-Blockers task's `overrides`-stability fix. Zero console errors across every live check this task performed.
  - **Blocks panel / capability matrix presentation.** `RichText` added to the `elements` category (`config.tsx`) and Column's `elements.allow` list; `block-icons.tsx` gained a `RichText: PilcrowSquare` entry (`lucide-react`, confirmed exported) — the Magnetix Blocks panel picks both up automatically since it reads categories/icons from the real production `Config` object, no separate registration needed.
  - **Not built this task, explicitly deferred (per the task's own scope limits, not silently dropped):** text highlight (no default Puck/Tiptap extension — would need a custom fork); Content Library "Choose from Library" for Image (unchanged gap from the prior task — still no reusable general-purpose picker component anywhere in this codebase); System C (Booking/Checkout/Funnels/Actions depth) and Version History — neither begun, per the task's explicit "do not begin System C" instruction.
  - **Validation:** `tsc --noEmit` clean (full repo — the only pre-existing errors found belonged to `src/components/settings/sub-account-business-brain-section.tsx`, an untracked file from unrelated concurrent parallel-session work this task never touched, confirmed via `git status`, and those errors were gone on a later re-run of the exact same command with no change on this task's side — a different session's own file, not this task's concern either way). Targeted ESLint clean (one benign unused-`eslint-disable`-directive warning found and removed, zero errors). Prettier clean (four files needed `--write`, re-verified clean after). `git diff --check` clean. `next build`: NOT completed this task — a large (~4.7 GB), apparently-stalled `next build --turbopack` process belonging to a completely separate, unrelated sibling worktree (`magnetix_studios-community-live-route-production`, a different parallel session's own work) was found consuming the bulk of this 8 GB machine's RAM during the attempt, and this task's own build never progressed past the initial compile step after ~20 minutes under that memory pressure; killed only this task's own build process (confirmed by PID, never touched the other worktree's processes) rather than continue blocking. This is an environment/resource-contention finding, not a code defect — `tsc`/ESLint/Prettier/`git diff --check` all independently passed cleanly against the exact same code, and this System B change set is architecturally identical in kind (additive props/fields/new small files) to changes `next build` already validated successfully earlier in this same session under lighter memory conditions. Re-running `next build` once the machine's memory pressure clears is the one still-open validation item — see Known Bugs.
  - **Files touched:** `src/types/pages-funnels-puck.ts` (`ImageSizeConfig`/`VideoSizeConfig`/`VideoPlaybackConfig`), `src/lib/pages-funnels/puck/media-size.ts` (new), `src/lib/pages-funnels/puck/video.ts` (new), `src/lib/pages-funnels/puck/auto-hierarchy.ts` (new), `src/components/pages-funnels/puck/auto-hierarchy-watcher.tsx` (new), `src/components/pages-funnels/puck/elements.tsx` (`RichTextRenderElement`, `ImageRender`/`VideoRender` depth), `src/components/pages-funnels/puck/config.tsx` (RichText registration, Image/Video size/playback fields, Column allow-list), `src/components/pages-funnels/puck/editor-shell.tsx` (mounts `AutoHierarchyWatcher`), `src/components/pages-funnels/puck/block-icons.tsx` (RichText icon). Puck Persistence + Publish Foundation's own files (`use-puck-persistence.ts`, `pages-funnels-puck-service.ts`, the `puck-draft`/`puck-publish` API routes) were NOT touched, per this task's explicit "do not re-architect persistence" instruction. V1, GitPage, billing/Stripe/PayPal untouched (confirmed via scoped `git status`, same pattern every prior Pages & Funnels task in this history has used).

**IN PROGRESS:** Nothing — System B (Rich Text, Image/Video depth, Auto Hierarchy) is built and live-QA'd this task via Puck's real production `dispatch`/render pipeline (see the COMPLETED entry above). `next build` still needs a clean re-run once this machine's memory pressure from an unrelated concurrent process clears (see Known Bugs) — the one open validation item. System C (Booking/Checkout/Funnels/Actions) and Version History remain next-step candidates, neither started or approved.

**KNOWN BUGS:**

- **New — `next build` was not completed this task** due to a large, apparently-stalled, unrelated sibling-worktree build process consuming most of this machine's 8 GB of RAM during the attempt (see the System B COMPLETED entry's Validation note for the full detail) — not a code defect (`tsc`/ESLint/Prettier/`git diff --check` all independently clean against the same code). Re-run `pnpm exec next build` (optionally with `NODE_OPTIONS=--max-old-space-size=6144`, the same workaround a prior task's own genuine OOM needed on this machine) once memory pressure clears, before/alongside the next real deploy.
- **New — Text highlight is not implemented.** Not part of Puck's default registered `richtext` extension set; adding it would need a custom Tiptap extension, which this task's own explicit instruction was not to force. Every other Launch-target Rich Text format (bold/italic/underline/strike/links/bulleted+numbered nested lists/blockquote/code/code block/headings) is built and live-confirmed.

- **Resolved this task — Storage rules deployment gap.** The Pages & Funnels `storage.rules` match block (added in the prior task) was correctly written and correctly committed/pushed to `origin/main`, but Firestore/Storage rule files are NOT deployed by a `git push`/Vercel build — they need their own explicit `firebase deploy --only storage`, which had never been run for this change. Any future `storage.rules` (or `firestore.rules`) edit MUST be followed by the matching `firebase deploy --only storage` / `--only firestore:rules` command, verified against the live rules (e.g. via the Firebase Console or the Rules REST API), not assumed to ship with the app deploy. This is a standing process gap worth remembering for every future Storage/Firestore rules change in this codebase, not just this one.

- **New — Content Library "Choose from Library" for the Image element does not exist yet.** Only Upload Image was built this task (see the Puck User-QA Blockers fix entry above) — browsing/reusing previously-uploaded images across pages needs a real, general-purpose picker component that doesn't exist yet anywhere in this codebase. Explicitly reported as a gap per this task's own instruction, not silently deferred.
- **New — the Settings panel's benign duplicate-DOM-node rendering quirk (first documented in the System A Closeout task) also affects Playwright automation of the Image field's "Advanced: Image URL" toggle/input specifically** — confirmed not a functional defect (code-reviewed, uses the same proven `Input`/`onChange` pattern every other custom field already uses live), just a standing test-automation friction in this one panel. Same category already on record for Image drag-insertion and Heading inline-edit-mode entry.
- None outstanding from System A or its closeout — the real bugs found during each task's own build (Box Shadow's enable toggle discarding prior values on re-enable, System A; the settings panel's active tab and collapsible-group state both resetting on a Puck-triggered remount, System A Closeout) were fixed within the same task that found them; see the respective COMPLETED entries above.
- **Right-sidebar General/Styles/Animations organization is now resolved, superseding the note below from System A's original task.** See the System A Closeout COMPLETED entry above for the technical basis (`overrides.fields`'s `children` prop is a genuine flat, keyed array — a documented override point plus a public `ReactElement` property, never Puck internals or DOM). *Historical note, System A's original task:* "The literal top-level three-section DOM split ... was investigated and not attempted this task: Puck's `slot` fields ... cannot safely nest inside an `object` field wrapper without risking the drag/drop mechanism ... A future session attempting the literal split should first empirically test ... rather than assuming." That further investigation happened this closeout task, found the concern didn't actually apply to the approach taken (no `slot` field was ever nested inside anything), and shipped the real three-tab split.
- Independent Radius was live-confirmed this closeout task for Button and Section; Image shares the identical `RadiusEditor` code path (confirmed by reading its `StyleCompatibility` wiring) but wasn't independently drag-inserted and live-clicked — Playwright's raw pointer simulation couldn't reliably trigger Puck's dnd-kit-based Blocks-panel-to-canvas insertion across the iframe boundary within this task's effort budget. Border's own independent per-side width (a separate `SidesEditor` instance, same underlying pattern as Spacing/Radius) was not in this closeout task's explicit scope and remains code-reviewed-only, unchanged from System A.
- The Insert Undo Blocker (Puck 0.23.0 corrupting `history[0]` when a controlled `<Puck>`'s `iframe`/`metadata` props are inline object literals) has a confirmed, supported-API-only fix: hoist those props to stable references. Carried forward unchanged since Phase 1 — standing implementation rule (§3), enforced in review, for every future controlled `<Puck>` usage.
- Puck's own `overrides` API is documented by Puck itself as "highly experimental." Still exactly the five override keys from Phase 2B (`header`, `headerActions`, `drawer`, `outline`, `fields`) — Phase 2C added no new override keys, only a new `resolveFields` component-level option (Section/Hero) and an `onAction` prop, both separate, real, documented parts of the supported API surface.
- CSS custom-property overrides meant to affect Puck's canvas-iframe content (ActionBar, selection/drop indicators) must be scoped to `:root`, not a wrapper class — a wrapper-class scope silently fails to reach anything rendered inside the iframe, even with `syncHostStyles: true`. Standing constraint, unchanged.
- **New:** `tailwind-merge` does not cancel a `sm:`-prefixed (or any breakpoint-prefixed) base class with an unprefixed override — the override must repeat the same prefix (e.g. `sm:max-w-none` to cancel a base `sm:max-w-sm`). Standing gotcha for any future full-bleed/full-screen override of a shadcn component built with responsive default classes.
- Known remaining gap, not fixed this task (out of scope — Image/Video background field UI is explicitly deferred per Phase 2D's own scope): `BackgroundConfig.source` supports `"image"`/`"video"` at the type level, but neither has field UI yet; migrated Sections with a V1 `backgroundStyle: "image"` map to `DEFAULT_BACKGROUND` (`source: "none"`) rather than losing the block's content.
- Row/Column nodes generated by `migrate-v1.ts` (V1 never had per-row/per-column backgrounds) don't get an explicit `background` prop written into their migrated data — intentional, not an oversight: `BackgroundLayer`/`BackgroundFieldEditor` both treat a missing/`undefined` background exactly like `DEFAULT_BACKGROUND` (`source: "none"`), so this is honest (never inventing a background V1 never had) and functionally identical to writing the default explicitly.
- Save Draft/Publish are now real and durable as of the Puck Persistence + Publish Foundation task — see that COMPLETED entry above. §18's migration-principles caution (no persistence change without an explicit approved task) is why this waited until that task was explicitly requested, not a reason it's still disabled.
- **New — multi-tab concurrent editing is not solved.** `savePuckDraft`/`publishPuckPage` are plain targeted `.update()` calls with no optimistic-lock/version check — two browser tabs editing the same page could overwrite each other's draft with no warning. Explicitly out of scope per that task's own "document honestly if not solved" instruction, not silently ignored. A future fix would likely compare a client-held `puckDraftUpdatedAt` against the server's before writing, or move to a Firestore transaction.
- **New — Version History does not exist.** `puckPublishedData` is a single frozen snapshot (this Publish's content), not a history of prior snapshots — there is no way to see or restore an earlier published version. No version/revision collection exists anywhere in this codebase to model it on (checked). Next persistence subtask per that task's own explicit deferral.
- **New — `/p` was missing from `src/middleware.ts`'s `PUBLIC_PATHS`,** meaning `/p/[pageId]` (V1-published pages too, not just Puck) was unreachable without a session — found and fixed this task. Any future new public-facing route must be added to that same allowlist or it will silently 307 to `/login` instead of erroring loudly.

**AWAITING USER TEST:** System B's new capabilities await the user's own real-browser click-through — no fixture/harness substitute is a stand-in for that, per this build's own established discipline:

1. Rich Text: add the element, type multiple paragraphs, bold/italicize, add a link, bulleted list, numbered list, blockquote, Undo a format, Save Draft → leave → return → formatting still there, Preview matches, Publish → public page matches.
2. Image: upload, replace, alt text, width/max-width, object-fit, alignment, border/radius/shadow, responsive visibility, Save/leave/return, Preview, public page.
3. Video: a real YouTube URL, a real Vimeo URL if available, aspect ratio, autoplay/muted, controls toggle, loop, border/radius/shadow, responsive width, Preview, public page.
4. Auto Hierarchy: drag a bare Heading/Image/Button etc. onto empty page space and confirm it lands inside a real Section/Row/Column automatically (not floating unwrapped); Undo once and confirm the whole auto-created structure disappears; Redo and confirm it comes back; drop into an existing Column and confirm no extra wrapper is created.

**The Puck Foundation Checkpoint itself is user-confirmed REACHED** (see the Build Status COMPLETED entry above) — this AWAITING USER TEST is System B-specific, not a repeat of that sequence.

**AWAITING USER DECISION:** Approval to begin System C (Booking/Checkout/Funnels/Actions depth per §24.7–§24.11/§24.16) OR Version History (§24.12, still deferred) — whichever the user prioritizes next. Separately: approval of the §24 capability baseline itself if not already given, and the user's own completion of the System B AWAITING USER TEST above.

**NEXT APPROVED TASK:** None — System C and Version History both await explicit user go-ahead per this document's standing rule (§19/§21: each phase requires its own approval, not automatic continuation), and per this task's own explicit "do not begin System C" scope limit. The one concrete next step is the user completing the System B AWAITING USER TEST above.

---

## 1. Product Standard

Magnetix Pages & Funnels is a **core competitive feature** of the platform, not a secondary utility.

The standard is not "can someone make a webpage?" The standard is:

> A digital entrepreneur should be able to realistically build landing pages, sales pages, checkout flows, booking flows, and complete funnels inside Magnetix without feeling that they lost critical page/funnel capabilities compared with mature platforms such as GoHighLevel or ClickFunnels.

GoHighLevel and ClickFunnels are **competitive references**, not blueprints. Magnetix is not a clone of either. Their feature sets inform what "table stakes" looks like for this category; Magnetix's own product judgment (native Forms/Booking/Courses/Offers integration, its own visual identity, its own commerce model) governs everything beyond that baseline.

---

## 2. Approved Editor Engine

**Puck (`@puckeditor/core`) is the approved editor-engine direction**, based on the completed POC and feasibility audits.

**Puck owns:**

- Library/drawer engine
- Drag/drop (top-level and nested)
- Exact insertion positioning
- Selection
- Outline/Layers
- Fields/settings mechanics (the generic field-editing UI)
- Device viewports (Desktop/Tablet/Mobile preview switcher)
- Editor state
- History / Undo/Redo
- Canonical content-tree mechanics (the slot/component data structure)
- Serialization (plain JSON)
- Public `<Render>` engine (server-side rendering of the same config)

**Magnetix owns:**

- Visual design/aesthetic (the actual look of the editor chrome and every rendered element)
- `PageDoc` metadata
- Firestore (schema, rules, persistence)
- Tenancy (agency/sub-account scoping)
- Draft/publish lifecycle
- URLs/domains
- Forms
- Bookings
- Products/offers
- Checkout/payment behavior
- Funnels (orchestration across pages — Puck has no concept of a funnel; see §12)
- Analytics
- A/B testing
- AI page generation
- CRM integrations

This split is the foundation every later section in this document assumes. When in doubt about whether something is "a Puck job" or "a Magnetix job," this list is the tiebreaker.

---

## 3. Puck Implementation Rules

Confirmed findings from the POC, the feasibility audit, and the Insert Undo Blocker investigation — these are binding constraints for Phase 1 onward, not suggestions:

- `@puckeditor/core@0.23.0` was tested successfully; it is the version validated by every finding in this document. Re-validate this section's claims if the production implementation upgrades past it.
- `<Puck>` **must** be client-only. `export const dynamic = "force-dynamic"` alone is **not** sufficient — it still fails at build/prerender time. Use `next/dynamic(() => import(...), { ssr: false })`, and the page component that calls it must itself be a Client Component (`"use client"`) under Next.js 15's App Router rules.
- The public `<Render>` component **can** and should be used server-side for the published/public page route — this was proven working with the real `PublicForm` component nested inside it.
- Use Puck's **`slot`** field type for nested content areas. Do not build on the deprecated `DropZone` architecture.
- Nested slot content needs **explicit, stable `id`s on every node**, at every depth — despite Puck's own types marking `id` optional on nested `ComponentData`. Omitting ids 2+ levels deep caused real crashes/hangs in testing. Always generate and assign ids explicitly when constructing content programmatically (prebuilt-section factories, migrations, etc.).
- The `Section → Row → Column` layout pattern needs **`inline: true` + `puck.dragRef`** on the Column component specifically, so its own root DOM node (not Puck's internal per-slot-item wrapper) is what carries width-related CSS. Without this, per-item width classes (e.g. `col-span-*`) are inert.
- Field-driven Column widths were proven using a 12-column CSS Grid, with the width class computed from the Column's own `width` field and applied via the `inline`/`dragRef` mechanism above.
- Desktop / Tablet / Mobile device-preview behavior is a **native, first-class Puck mechanism** (the `viewports` prop) — do not rebuild this.
- Real `PublicForm` rendering inside Puck's canvas iframe was proven working, including through Puck's `iframe` sandbox.
- `iframe={{ syncHostStyles: true }}` correctly propagates Magnetix/Tailwind styling into the canvas iframe — this is the mechanism for making the _editor canvas_ preview look like the real published page.
- `contentEditable: true` (a field option on `text`/`textarea`/`richtext`/`custom` fields) is Puck's **native inline canvas text editing** mechanism. It updates the same canonical Puck `Data` the Fields panel reads — no parallel/local state needed, and none should be built. Note: enabling it changes the field's render-time value from `string` to `ReactNode`; render functions must stop assuming a string.
- Puck `Data` is plain JSON, directly suitable for Firestore storage — no custom serialization layer is needed between Puck and `PageDoc`.
- **Controlled `<Puck>` props — specifically `iframe` and `metadata` — MUST be referentially stable** (module-level constants or memoized), never inline object literals, when `<Puck>` is used as a controlled component (`data`/`onChange={setData}`). This is not a style preference: on `@puckeditor/core@0.23.0`, an unstable `iframe`/`metadata` reference was confirmed to corrupt `history[0]` such that the **first** insert action of an editor session could not be undone (button state flipped correctly; canvas content did not revert). Every insert after the first was unaffected. Root-caused via a from-scratch minimal stock-Puck reproduction; fixed by hoisting those props to stable references. Treat "all controlled Puck config props are referentially stable" as a standing implementation rule, enforced in code review, not just a one-time POC fix.
- Once that prop-stability rule is followed, **Insert / Move / Field-edit Undo and Redo were all confirmed working**, including the specific case that originally failed (adding a Text element as the first action of a session).
- Puck's `overrides` API is real and typed (not underscore-flagged as experimental in the type system, unlike `_experimentalFullScreenCanvas`), but Puck's **own documentation prose explicitly calls it "highly experimental" and likely to have breaking changes**. Use it sparingly, and only for shell regions ordinary CSS genuinely cannot reach.
- **Prefer CSS-first Magnetix reskinning of Puck's default UI composition.** Puck's own default (uncustomized) layout composition is what actually delivers its polished LEFT-library/CENTER-canvas/RIGHT-fields/Outline grid CSS. Hand-composing `Puck.Components`/`Puck.Preview`/`Puck.Fields`/`Puck.Outline` as custom children loses that grid CSS entirely (renders as stacked plain `<div>`s) and would require rebuilding it by hand — a real, avoidable cost. Reserve `overrides` for the specific regions CSS can't reach, not as the default approach.

---

## 4. Content Architecture

Approved conceptual hierarchy:

```
Page
 └─ Section
     └─ Row
         └─ Column
             └─ Element
```

This maps directly to Puck components/slots: Section, Row, and Column are each real Puck components with exactly one `allow`-restricted slot; Elements (Heading, Text, Button, Image, Video, Form, Booking, etc.) are the leaves.

Keep nesting **intentionally structured** — do not build arbitrary, unlimited freeform nesting (e.g. Sections inside Columns, Rows inside Elements). The fixed 4-level shape is a deliberate constraint, not a current limitation to "fix" later. It's what makes prebuilt sections, migrations, and the eventual reskinned editor UI predictable.

---

## 5. Prebuilt Sections

Hero, Features, Testimonials, FAQ, Pricing, CTA, and similar presets must **not** be indivisible mega-blocks. They are **factories/templates** that insert real, editable native primitives following the Section → Row → Column → Element shape.

Example — inserting "Hero" produces:

```
Section
 └─ Row
     ├─ Column
     │   ├─ Heading
     │   ├─ Text
     │   └─ Button
     └─ Column
         └─ Image
```

After insertion, every primitive (the Heading, the Text, the Button, the Image) is independently selectable, editable, reorderable, and deletable — exactly as if the user had built it by hand from the library. This was proven in the POC via a `buildHeroSection()` factory dispatched as a real `setData` Puck action producing genuine nested `ComponentData` with explicit ids at every level (per §3's id rule).

---

## 6. Editor Experience

Approved principles:

- Retain the **Magnetix aesthetic** — the production editor should not look like stock Puck. See §3 for the CSS-first approach.
- CSS-first Puck reskin, `overrides` used sparingly.
- Inline canvas text editing (double-click or equivalent, per §3's `contentEditable` finding).
- Exact drag/drop placement with visible insertion indicators.
- Layers/Outline panel.
- Contextual settings (Fields panel scoped to the selected component).
- Long-page scrolling.
- Desktop / Tablet / Mobile preview.
- Responsive stacking, with **reverse mobile stacking** as a Very Soon capability (§17), not Launch.
- Undo/Redo (see §3 for the stability rule that makes this actually work).
- **The user should not need to understand Section → Row → Column just to add a Text element.** The builder should auto-create required structural wrappers where appropriate (e.g., dropping a bare Text element onto an empty page area should transparently create the Section/Row/Column scaffolding around it, not force the user to build the scaffolding first).

Proposed customer-facing library taxonomy:

- **LAYOUT**
- **ELEMENTS**
- **PREBUILT SECTIONS**
- **BUSINESS**
- **SAVED** (once reusable content, §14, is implemented)

**Never use "Magnetix" as a block-category label** — the categories should read as generic, professional page-builder categories, not as internal branding.

---

## 7. Core Element Inventory

**Core (Launch):**

- Heading
- Text / Rich Text
- Button
- Image
- Video
- Icon/SVG
- Divider
- Spacer
- Accordion

**Business / conversion:**

- Form
- Booking
- Checkout
- Pricing Table
- Countdown
- Popup / popup trigger
- Navigation

**Commerce:**

- Checkout
- Order Bump
- Upsell / Downsell action
- Order Summary / Confirmation

**Magnetix-native reference components** (these reference existing Magnetix features rather than duplicating them — see §9–§11):

- Form
- Booking
- Offer
- Course CTA
- Community CTA

### Existing elsewhere in Magnetix vs. still needing page-element implementation

| Already exists in Magnetix (needs a page-element _wrapper_, not new infrastructure) | Still needs implementation as a page element                                                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forms (full form builder, submissions, automations)                                 | Heading, Text/Rich Text, Button, Image, Video, Icon/SVG, Divider, Spacer, Accordion (general-purpose Accordion element exists from V2 work and should carry forward) |
| Booking/calendar system                                                             | Checkout (page-element form of it)                                                                                                                                   |
| Offers/Products                                                                     | Pricing Table                                                                                                                                                        |
| Courses (course CTA target)                                                         | Countdown                                                                                                                                                            |
| Community                                                                           | Popup / popup trigger                                                                                                                                                |
| Stripe Connect (per sub-account)                                                    | Navigation element                                                                                                                                                   |
|                                                                                     | Order Bump, Upsell/Downsell action, Order Summary/Confirmation                                                                                                       |

This table should be kept current — when an element ships, move its row; when a new Magnetix feature is built that a page element could reference, add it here rather than duplicating it inside Pages & Funnels.

---

## 8. Shared Action System

This is a **major architecture requirement**, not a per-element convenience.

Clickable/interactive elements (Button, Image-as-link, CTA elements, popup triggers, checkout success, etc.) should use a **shared Action model** rather than each element inventing its own unrelated "destination" field.

Target action vocabulary:

- Go to URL
- Go to Next Funnel Step
- Go to Specific Funnel Step
- Scroll to Section / Element
- Open Popup
- Close Popup
- Show / Hide Elements
- Submit Form
- Download File
- Call
- SMS
- Email
- Purchase / Checkout
- Accept Upsell
- Decline / Continue

Not every element needs every action — the Action system must define **compatibility by element/context** (e.g., "Accept Upsell" only makes sense on an Upsell page's CTA; "Submit Form" only makes sense wired to a Form element). Design this as a single shared field type/config, not copy-pasted per-element action pickers, so new actions and new element types both plug into one system.

---

## 9. Form Behavior

The Form page element **references** a real Magnetix Form — there is no duplicated form builder inside Pages & Funnels.

Target page-builder UX:

- Choose: **Existing Form** or **Create New Form**.
- Eventually: **Edit Form** from within a page-builder modal/drawer, without leaving the page editor.

Post-submit options should support:

- Success message
- Next funnel step
- Selected (specific) funnel step
- Custom URL

All existing CRM contact/automation behavior tied to form submission remains owned by Magnetix Forms — the page element is a rendering + destination-config surface, not a new data owner.

---

## 10. Booking Behavior

The Booking page element **references** a real Magnetix calendar/booking configuration — no duplicated booking infrastructure.

Target post-booking behavior:

- Confirmation
- Next funnel step
- Selected (specific) funnel step
- Custom URL

---

## 11. Checkout / Commerce

Checkout is a **high-priority** Pages & Funnels capability (Launch-scope at the core-checkout level; see §17 for what's deferred to Very Soon/Later).

Target capabilities:

- Choose Offer/Product
- Choose price
- One-time payment
- Recurring payment
- One-step checkout
- Two-step checkout
- Contact fields
- Shipping fields when relevant
- Quantities
- Coupons
- Product image/description
- Checkout CTA
- Order bump
- Post-purchase Success Action

**Success Action** (same shared vocabulary spirit as §8):

- Next funnel step
- Selected funnel step
- Custom URL
- Thank-you state/message

**Terminology — keep these three concepts distinct in code, UI copy, and this document:**

- **CHECKOUT** — the initial transaction.
- **ORDER BUMP** — an optional add-on offered _before_ the initial purchase completes.
- **UPSELL / DOWNSELL** — a _post-purchase_ offer that reuses the already-authorized payment relationship, where the payment provider architecture permits it (i.e., contingent on how Magnetix's Stripe Connect integration supports charging a previously-authorized customer without re-collecting payment details).

---

## 12. Funnel Model

**Puck owns exactly one Page's content. It has no concept of a funnel.** Funnel orchestration is entirely a Magnetix concern.

Conceptually:

```
Funnel
 └─ ordered PageDocs / Funnel Steps
```

Example funnel:

```
Opt-In → Sales → Checkout → Upsell → Thank You
```

A Page may exist **outside** a Funnel (a standalone landing page is valid and does not require funnel membership).

"Next Funnel Step" (§8, §9, §10, §11) resolves at runtime from Magnetix's own funnel-ordering data — Puck's config/components must never be taught what a funnel is. This keeps Puck fully replaceable/upgradable without funnel logic leaking into editor-engine code.

---

## 13. Responsive Requirements

Target:

- Desktop preview
- Tablet preview
- Mobile preview
- Column stacking
- Reverse stacking
- Per-device visibility (show/hide an element on specific breakpoints)
- Responsive typography
- Responsive spacing
- Responsive alignment

**Division of ownership:** Puck's native `viewports` system may provide the preview-switching _mechanics_ (which breakpoint is currently being edited/previewed). **Magnetix owns the actual responsive component behavior/settings** — i.e., what a Column's width or an Element's visibility actually _does_ at each breakpoint is Magnetix field/prop design, not something to inherit from Puck defaults.

---

## 14. Reusable Content

Document future desired levels conceptually (do not build past Launch scope without explicit approval — see §17):

- **Saved reusable copy**: inserting a saved block produces an independent copy; later edits to the saved block do not propagate.
- **Synchronized/global**: inserting a synchronized block keeps a live link; edits to the source propagate to every linked usage.
- **Potential account-wide synchronized reusable assets** — a further-future extension of the synchronized concept across an entire sub-account's page library.

**Advanced synchronized/global assets are explicitly not a Launch blocker.**

---

## 15. Page Settings

Target:

- Page name
- Slug/path
- SEO title
- SEO description
- Social-sharing image
- Draft/publish
- Tracking/scripts
- Custom CSS (later)
- Duplicate
- Template
- Index/crawler controls (later, where appropriate)

---

## 16. Analytics / A-B Testing

Future requirements:

- Page views
- CTA clicks
- Form submissions
- Bookings
- Checkout starts
- Purchases
- Revenue
- Conversion rate
- Revenue per visitor

A/B testing should eventually support page/funnel-step variants and traffic allocation.

**Advanced A/B testing is explicitly not a Launch blocker.**

---

## 17. Priorities

_The user may change these later. Do not silently reprioritize — if a future session believes the priority should change, say so and ask, don't just reorder this list. See §24.20 for the full granular, capability-level priority matrix — the lists below are the section-level summary; §24's additions below are explicit new classifications the user gave directly, not inferred._

### LAUNCH

- Puck production editor
- Magnetix visual styling
- Inline text editing
- Section/Row/Column/Element
- Exact drag/drop
- Outline/Layers
- Desktop/Tablet/Mobile
- Heading
- Text/Rich Text
- Button
- Image
- Video
- Divider/Spacer
- Accordion
- Shared Action architecture
- Form
- Booking
- Checkout
- Next funnel step
- URL redirect
- Scroll action
- Funnel object + ordered steps
- Draft/publish
- Page settings/slug/SEO
- Undo/redo
- Page templates/prebuilt sections
- **Auto hierarchy / auto-wrapping** (§24.1)
- **Rich Text mixed inline formatting** (§24.3.1, §24.6)
- **Shared Spacing system** (margin/padding, linked/unlinked) (§24.3.2)
- **Shared Border/Radius system** (§24.3.3)
- **One box shadow + one text shadow** (§24.3.4)
- **Responsive: per-device visibility, responsive typography/spacing/alignment** (§24.4)
- **Preview architecture** (page-style, new tab, no chrome — already built, Phase 2D) (§24.13)
- **Autosave, explicit Publish, version history** (§24.12)
- **Analytics event plumbing** (the instrumentation itself, not the reporting UI) (§24.17)

### VERY SOON

- Order Bump
- One-click Upsell/Downsell
- Order Summary/Confirmation
- Popups
- Countdown
- Pricing Table
- Show/hide action
- Download action
- Call/SMS/email actions
- Saved sections
- Animations
- Reverse mobile stacking
- **Multiple/inset shadows** (§24.3.4)
- **Deeper responsive sizing overrides** (§24.4)
- **Analytics reporting UI** (page views, opt-in rate, conversion rate, etc. — built on top of the Launch-scope event plumbing) (§24.17)
- **Tracking scripts** (funnel/page head/body scripts, pending a security/sanitization review) (§24.15)
- **Custom meta tags / canonical URL / schema markup** (§24.14)

### LATER

- Synchronized global/universal sections
- A/B testing
- Advanced conditional funnel branching
- Advanced animation systems
- Deep brand/style-guide system
- Deeper commerce/catalog behavior
- **Mega menu** (§24.9)
- **AI-generated schema** (§24.14)
- **Galleries** (not previously scoped in this document — flagged in §24.20's matrix, needs its own explicit prioritization before design work starts)

### SKIP / NOT CURRENTLY PLANNED

_(empty — nothing has been explicitly ruled out yet; add items here only when the user explicitly decides something is out of scope, rather than merely deferred)_

---

## 18. Migration Principles

Existing **V1 Magnetix Pages must not be discarded**. Production Firestore data is currently in the V1 `PageBlock[]` format, and real pages exist in it.

Detailed V1 migration logic already exists as a reference (the V2 architecture work — `migrateBlocksToSections()`, `getPageSections()`, the fixed 4-level tree types).

**If/when Puck becomes canonical, prefer a direct, deterministic migration:**

```
PageBlock[] → Puck Data
```

**rather than permanently maintaining a two-hop chain:**

```
PageBlock[] → SectionNode[] → Puck Data
```

The V2 (`SectionNode[]`) work remains useful as a **migration/design reference** — it already proved the Section→Row→Column→Element shape and a working deterministic migration function — but it should **not become a second permanent canonical schema** living alongside V1 and Puck Data. Production should end up with exactly two schemas in play during migration (V1, and Puck Data), not three.

---

## 19. Build Phases

Each phase requires **explicit manual QA before proceeding to the next.** Do not automatically implement the next phase just because the previous phase compiled — compiling is not the same as validated.

- **PHASE 0** — Master spec / source of truth. _(this document)_
- **PHASE 1** — Production Puck foundation, built alongside the current V1 builder (not replacing it yet).
- **PHASE 2** — Core page-editor experience and primitives (the Launch-scope element inventory from §7, the Magnetix visual reskin from §6).
- **PHASE 3** — Shared Action system (§8).
- **PHASE 4** — Native Business elements: Form, Booking, Checkout (§9, §10, §11).
- **PHASE 5** — Funnel orchestration / ordered steps / Next Step (§12).
- **PHASE 6** — Commerce depth: order bump, upsell/downsell, confirmation, advanced checkout (§11).
- **PHASE 7+** — Popups, countdown, pricing, saved sections, animations, analytics/A-B (§17's Very Soon/Later items).

---

## 20. Current State

_(as of this document's creation)_

- Production **custom V1 builder** exists and is live (`PageBlock[]` model, `Canvas`/`BlocksPanel`/`SettingsPanel`, `@dnd-kit` drag/reorder, draft/publish, `/p/[pageId]` public route).
- **V2 migration/renderer experiments exist** (fixed tree types, deterministic migration, read-only tree renderer wired into Preview and `/p/[pageId]`) — validated as a reference, not shipped as a second canonical schema (§18).
- **Puck POC exists and passed core technical validation** — drag/drop, nesting, selection, Outline, device previews, real Form rendering, serialization, server-side `<Render>`, and (after the Insert Undo Blocker fix) working Undo/Redo, all live-tested.
- **Puck is not yet wired into production Pages & Funnels.** All Puck work to date lives under `src/app/docs/design-prototypes/puck-poc/`, isolated, unauthenticated, unlinked from production nav, with zero Firestore/PageDoc/production-route changes.
- **Current production Firestore format remains V1.** No production migration has started.
- **GoHighLevel/ClickFunnels teardown has informed this specification** (the element inventory, Action system, checkout/commerce vocabulary, and funnel model in §7–§12 reflect that research), without Magnetix being built as a clone of either.

---

## 21. Document Discipline

_(restated from the top for scannability — see the header of this document for the full list)_

Read before changing architecture. Preserve decisions unless the user changes them. Keep Build Status current. Record new constraints here. Don't silently reprioritize. Don't implement ahead of the current approved task.

**Strengthened after the §24 capability baseline was added:** future implementation agents must:

- Read the full §24 capability matrix before scoping any Pages & Funnels implementation task — not just this document's top-level sections.
- Never silently omit a Launch requirement from a shared system (§24.3's Typography/Spacing/Border/Shadow/Background) just because a single task only asked for one element type — if a task asks for "Button borders," check whether that means building the _shared_ border system (§24.3.3) that Section/Row/Column/Image/etc. will also need, not a Button-only implementation.
- Never downgrade expected functional depth merely to minimize work for the current task. If a target genuinely can't be hit this task, say so explicitly (see below) rather than quietly shipping a shallower version.
- When a deliberate scope reduction is made, identify it explicitly in the task's report (a "Deferred" or "Not built this task" note, matching the pattern Phase 2C/2D's reports already established) — never let a gap be discovered later with no record of why it exists.
- Update §24.20's STATUS column (and this document's Build Status COMPLETED entries) as capabilities are actually built, so the matrix never drifts stale against the real codebase.
- Avoid discovering predictable builder basics (borders, shadows, device visibility, rich text, autosave, etc.) through user QA when they are already documented requirements in §24. **User QA exists for usability, correctness, taste, and unforeseen defects — it should not be the primary mechanism for discovering that expected basic builder controls were never specified.** If §24 already names a requirement, a future session omitting it is a planning failure, not a discovery.

---

## 22. Related Documents / Prior Art

This spec is the **synthesis**; it does not replace the detailed technical findings it draws from. For deeper detail than this document carries, the following should still be treated as accurate technical reference (not conflicting sources of truth — this document's product/architecture decisions govern; those documents' technical findings supply the "why"):

- The Puck integration architecture audit, Puck POC, Puck UX feasibility audit, and Puck Insert Undo Blocker investigation (all conducted this project; findings summarized in §3).
- `src/types/pages-funnels.ts` / `src/lib/pages-funnels/*` — V1 production types and logic.
- `src/types/pages-funnels-v2.ts` / `src/lib/pages-funnels/v2/*` — V2 reference types, fixtures, migration, tree utilities.
- `src/app/docs/design-prototypes/puck-poc/` — the isolated Puck POC and minimal reproductions, including code comments documenting exact findings inline.

---

## 23. Next Approved Task

_(filled in once the user authorizes Phase 1 — left intentionally blank at document creation)_

---

## 24. GoHighLevel Capability Baseline and Magnetix Requirements Matrix

_Added after a deeper audit of the current GoHighLevel Pages/Funnels builder, to convert that research into a binding, structured capability baseline before further implementation proceeds. This section does not change any decision made in §1–§23 — it makes the existing Launch-scope element/system inventory (§7, §8, §13, §14) concrete enough that implementation agents can work system-by-system from an approved matrix instead of discovering basic builder controls piecemeal through user QA._

**GoHighLevel is a competitive functional reference.** Magnetix is not intended to visually copy GoHighLevel — its layout, iconography, and visual language are not a target. The purpose of this baseline is narrower and more specific: to avoid accidentally shipping a page and funnel builder that omits capabilities users of any mature builder in this category would expect by default (borders, shadows, per-device visibility, rich text, autosave, an event-tracking foundation, and so on). Where this section gives a concrete depth target ("2–10 color stops," "linked/unlinked padding," "one box shadow at Launch"), that target is the expected functional floor, not a prescription for how the resulting UI should look.

### 24.1 Editor Structure

Expected editor capabilities, consistent with §2/§3/§6:

- Section → Row → Column → Element hierarchy
- Exact drag/drop (top-level and nested)
- Reorder
- Visible drop indicators
- Layers
- Undo/Redo
- Zoom
- Inline editing
- Desktop/Tablet/Mobile
- Auto hierarchy / auto wrapper creation — dropping an ordinary element into empty page space should transparently create the Section/Row/Column scaffolding around it (already stated as a target in §6; not yet built)
- In-editor page switcher (navigate between a funnel's pages without leaving the builder) — eventual, not Launch-blocking on its own

**Magnetix status:**

| Capability                                | Status             |
| ----------------------------------------- | ------------------ |
| Hierarchy (Section/Row/Column/Element)    | Built (foundation) |
| Drag/drop                                 | Built              |
| Layers                                    | Built              |
| Undo/Redo                                 | Built              |
| Viewport controls (Desktop/Tablet/Mobile) | Built              |
| Inline editing                            | Built              |
| Auto hierarchy / auto-wrapping            | Built              |
| In-editor page switcher                   | Missing            |

**Auto hierarchy/auto-wrapping is classified LAUNCH** — see §17's updated LAUNCH list.

### 24.2 Right Sidebar Organization

The Settings panel's future organization is locked as three top-level groups, applied consistently across every component type:

**GENERAL**

- Identity/name
- Content
- Source/reference selection (e.g. which Form, which Offer)
- Type-specific behavior
- Action

**STYLES**

- Layout
- Typography
- Colors
- Background
- Spacing
- Border
- Radius
- Shadow
- Responsive/device controls

**ANIMATIONS**

- Type
- Duration
- Delay
- Easing
- Scale (where applicable)
- Mobile behavior

**Built** (System A Closeout, superseding the note this paragraph used to carry): `settings-panel.tsx`'s `MagnetixSettingsPanel` now renders real General/Styles/Animations tabs for every selectable element, bucketing Puck's own rendered field elements by name via the public `overrides.fields` override point — see the Build Status COMPLETED entry for the technical basis and KNOWN BUGS history. Within the Styles tab, fields are further organized into the collapsible groups System A already built (Layout/Typography/Spacing/Border & Radius/Shadow/Responsive/Visibility). Animations is an honest empty placeholder — no animation controls exist yet (§24.19).

### 24.3 Shared Style Systems

These are **shared systems**, not per-component reimplementations. Every component that needs typography, spacing, border, shadow, or background support consumes the same field/helper/render primitive — exactly the pattern Phase 2D already established for Background (`BackgroundConfig` / `background.ts` / `BackgroundLayer` / `background-field.tsx`, one model and one renderer shared by Section, Row, and Column). Do not implement a second copy of any of these per element type.

#### 24.3.1 Typography

Target Launch controls:

- Font family
- Font size
- Font weight
- Font style
- Line height
- Letter spacing
- Alignment
- Text color
- Opacity
- Text transform

Where appropriate: link color, icon color.

Rotation/skew (present in HighLevel) is **Very Soon**, not Launch, unless the user later changes this.

**Rich Text is classified LAUNCH.** It must support mixed formatting within one text node (bold, italic, underline, links, headings/paragraphs, lists, nested lists, highlight, quote — strikethrough where appropriate) rather than forcing the user to create a separate Text element for every visual change. See §24.6's Text/Rich Text entry — a candidate implementation path is Puck's own `richtext` field type or a Tiptap-backed custom field; this needs its own technical investigation before implementation, matching how Background's `CustomField` approach was investigated in Phase 2D before being built.

#### 24.3.2 Spacing

One shared spacing control, used everywhere padding/margin appears:

**Margin:** top, right, bottom, left, linked/unlinked toggle.
**Padding:** top, right, bottom, left, linked/unlinked toggle.

Responsive overrides (per-breakpoint values) come later, within this same architecture — not as a second spacing system.

**Classified LAUNCH.**

#### 24.3.3 Border

Shared border editor:

- **Style:** none, solid, dashed, dotted
- **Color:** real color picker (reuse `ColorInput`, per the Phase 2D precedent)
- **Width:** linked, or independent top/right/bottom/left
- **Radius:** linked, or independent four corners

**Classified LAUNCH.**

#### 24.3.4 Shadow

Target:

- **Box shadow:** X, Y, blur, spread, color
- **Text shadow** where appropriate: X, Y, blur, color

**Launch:** one box shadow, one text shadow where applicable.
**Very Soon:** multiple layered shadows, inset shadow.

#### 24.3.5 Background

Phase 2D is the current foundation for this system — see the Build Status COMPLETED entry for that phase, and `background.ts`/`background-layer.tsx`/`background-field.tsx`.

The shared `BackgroundConfig` applies to Section, Row, Column, and Hero (where relevant — Hero reuses `SectionRender`, so it inherits Section's background automatically).

Top-level source: None, Color, Image, Video.
Color: Solid, Gradient.
Gradient: Linear, Radial, Angular; 2–10 color stops; stop position; angle; color picker; blur.

**Phase 2D already implemented most of Color/Gradient/Blur behavior** (confirmed live, see Build Status). **Image and Video background behavior still needs full product treatment** — the type-level shape exists (`source: "image"|"video"`, `image?.url`/`video?.url` on `BackgroundConfig`) but there is no field UI, no upload/media picker, and no real `<video>`-element background renderer yet. Treat this as its own scoped piece of future work, not an incidental follow-up.

### 24.4 Responsive System

**Target Launch:**

- Desktop / Tablet / Mobile
- Per-device visibility (show/hide an element at a given breakpoint)
- Responsive typography
- Responsive spacing
- Responsive alignment
- Responsive column stacking

**Very Soon:**

- Reverse stacking
- Deeper sizing overrides

Use **sparse responsive overrides** layered on top of each shared style system (§24.3) rather than duplicate per-breakpoint copies of a whole component's settings.

**Current status:**

| Capability                                         | Status            |
| -------------------------------------------------- | ----------------- |
| Viewport preview (Desktop/Tablet/Mobile switching) | Built             |
| Basic mobile stacking                              | Built             |
| Device visibility                                  | Missing           |
| Responsive style override system                   | Partial / missing |

### 24.5 Layout Controls

Current Section/Row/Column implementation (Phase 1–2D) is **foundation, not final** — it proves the shape and now carries background support, but does not yet carry the full target field set below.

**SECTION target:** full-width background, content max width, inner padding, min height, background, border, radius, shadow, responsive visibility.

**ROW target:** column structure, gap, horizontal alignment, vertical alignment, width/max width, background, border, radius, shadow, responsive behavior.

**COLUMN target:** width, alignment, gap/content spacing where applicable, background, border, radius, shadow, responsive stacking/order.

Once §24.3's shared Border/Shadow/Spacing systems exist, Section/Row/Column should each adopt them the same way they adopted `BackgroundConfig` in Phase 2D — one shared field/helper/renderer, applied to all three, not three separate implementations.

### 24.6 Core Element Requirements

Expected settings depth per major element. **Inline editing is required** wherever text is involved (already true for Heading/Text since Phase 1's `contentEditable` finding, §3).

**Heading** — GENERAL: text, semantic level, element name. STYLES: typography, alignment, color, spacing, width, responsive, text shadow where supported.

**Text / Rich Text** — GENERAL: rich content, links. Rich formatting target: bold, italic, underline, strike where appropriate, links, headings/paragraphs, lists, nested lists, highlight, quote. Potential implementation: Puck's `richtext` field type or Tiptap. See §24.3.1 — Rich Text is Launch.

**Button** — GENERAL: text, PageAction. STYLES: typography, text color, background, hover state, spacing, width, alignment, border, radius, shadow, responsive.

**Image** — GENERAL: media source, alt text, PageAction. STYLES: width, max width, height/object-fit where appropriate, alignment, border, radius, shadow, spacing, responsive.

**Video** — GENERAL: source/provider, URL/media, playback behavior. Target later/where relevant: autoplay, muted, controls, loop, poster/thumbnail. STYLES: size, aspect ratio, border, radius, shadow, spacing.

**Divider** — width, thickness, style, color, alignment, spacing.

**Spacer** — height, responsive height.

**Accordion** — GENERAL: items, allow multiple open, default-open behavior. STYLES: typography, icon, colors, background, border, radius, spacing.

### 24.7 Shared Action System — Compatibility Concept

PageAction (§8) remains a major Launch architecture requirement — this subsection adds one concept the original §8 didn't yet formalize: **action compatibility by element/context**. Not every action applies to every component; the Action system needs an explicit compatibility notion, not an implicit one enforced only by what the Fields panel happens to show.

Target action vocabulary is unchanged from §8: URL, Next Funnel Step, Specific Funnel Step, Scroll to Section/Element, Open Popup, Close Popup, Show/Hide Elements, Submit Form, Download File, Call, SMS, Email, Purchase/Checkout, Accept Upsell, Decline/Continue.

Examples of compatibility-by-element:

- **Button** — most/all of the vocabulary applies.
- **Image** — URL, Scroll, Open Popup, Call, SMS, Email, etc. (not "Submit Form" — an Image isn't a form-submit trigger).
- **Navigation item** — URL, page reference, section/scroll.
- **Upsell CTA** — Purchase, Accept Upsell, Decline/Continue.

This compatibility list should be designed as part of the shared Action field/config itself (which action options are offered given the calling element/context), not copy-pasted per-element allow-lists.

### 24.8 Business Elements

**Form** — references the existing Magnetix Form (§9). Target: choose existing, create new, eventually edit existing without leaving the builder. Post-submit: success message, next step, selected step, URL. **Status: partial/foundation built** (Form element exists and references real `LeadForm`s; edit-in-place and full post-submit routing are not built).

**Booking** — references the existing Magnetix calendar (§10). Confirmation behavior, next step, selected step, URL. **Status: missing** — no Booking page element exists yet.

**Checkout** — target per §11: Offer/Product selection, price, one-time, recurring, one-step checkout, two-step checkout, contact fields, shipping where relevant, quantity, coupons, order bump, CTA, success action. **Status: missing.**

**Order Bump** — distinct from Upsell (§11's terminology rule still applies: keep these three concepts — Checkout, Order Bump, Upsell/Downsell — separate in code, UI copy, and this document).

**Upsell / Downsell** — post-purchase offer flow using the already-authorized payment relationship, where the payment provider architecture supports it (contingent on Stripe Connect's charge-without-recollecting-details capability, §11).

**Order Confirmation** — a dedicated confirmation/order-summary capability, distinct from a generic "thank you" page.

### 24.9 Navigation

**Launch or Very Soon:** page links, external URL, scroll to section, dropdowns, nested items, mobile responsive menu.

**Later:** mega menu.

No Navigation page element exists yet.

### 24.10 Popups

**Very Soon:** popup built from the same primitives (Section/Row/Column/Element) as a page, Open Popup / Close Popup actions, delayed display, page-entry display.

**Later:** exit intent (if not included immediately), advanced conditions.

### 24.11 Reusable Content

§14 already distinguishes "saved reusable copy" from "synchronized/global" conceptually — this subsection makes the terminology and hierarchy explicit so future work never conflates a copied template with a synchronized reference:

- **SAVED TEMPLATE** — copy becomes independent after insertion; later edits to the saved source do not propagate.
- **GLOBAL / LINKED** — updates to the source sync across every linked usage.

Potential hierarchy:

- **Very Soon:** Save Element, Save Section (saved-copy behavior only).
- **Later:** Global Section, Universal Section, Universal Element (synchronized behavior).

Per §14, advanced synchronized/global assets remain explicitly not a Launch blocker.

### 24.12 Autosave / Publish / History

Upgraded to explicit **Launch** requirements (previously only "Draft/publish" appeared in §17's Launch list without this level of detail):

- Real-time draft autosave
- "Saving…" / "Saved" status indicator
- Published version kept separate from the current draft
- Explicit Publish action
- Version history / checkpoints
- Restore a prior version

**Current status (as of the Puck Persistence + Publish Foundation task):**

- Puck Data persistence is wired and durable — `puckDraftData`/`puckPublishedData` on `PageDoc`, via `pages-funnels-puck-service.ts` (Admin SDK, targeted `.update()` writes) and two authenticated API routes. See the Build Status COMPLETED entry for the full model.
- Save Draft (manual + 2s-debounced autosave, one shared save code path) and Publish (atomic draft+published snapshot in one write) are both real and durably wired in the New Builder.
- "Saving…" / "Saved" / error status indicator is built and live-confirmed (`use-puck-persistence.ts`, `editor-shell.tsx`'s `SaveStateIndicator`).
- Published version is kept genuinely separate from the current draft — confirmed live via the mandatory draft-vs-published integrity sequence (Build Status entry, §11 of that task).
- V1 still has its own separate persistence (`updatePageBlocks`, etc.) — untouched, not merged with Puck's.
- **Version history does not exist yet** — `puckPublishedData` is a single frozen snapshot, not a history of them. Explicitly deferred this task (see Known Bugs) — no version/revision collection exists anywhere in this codebase yet to build on.
- **Multi-tab concurrent-editing conflict resolution does not exist yet** — no optimistic lock/version check on write. See Known Bugs.

### 24.13 Preview

Phase 2D's Preview architecture is the **correct direction** and is retroactively classified **Launch**:

- Page-style (not a modal/dialog)
- New tab
- No editor chrome
- Uses the current unsaved Puck Data (session-scoped hand-off, not a Firestore write)
- Real responsive browser width
- Same `<Render>`/component-renderer pipeline a published page will use
- No modal/dialog preview of any kind

See the Build Status Phase 2D entry for the concrete implementation (`preview-session.ts`, `.../new-builder/preview` route).

### 24.14 Page Settings / SEO

**Launch target:** page name, slug/path, SEO title, meta description, sharing image, index/noindex, domain assignment where appropriate, favicon at the site/domain level where appropriate.

**Very Soon:** custom meta tags, canonical URL, schema markup.

**Later:** AI-generated schema.

### 24.15 Tracking Scripts

**Target Launch/Very Soon:** funnel-wide head script, funnel-wide body/footer script, page/step head script, page/step body/footer script.

Must account for security/sanitization/permissions before shipping — raw script injection is a real security surface (XSS, third-party script trust) and needs an explicit review pass as part of implementation, not an afterthought.

### 24.16 Funnel Model

Magnetix owns orchestration (§12 — Puck remains unaware of funnels).

**Launch:** create funnel, add steps, reorder steps, page assignment, next-step resolution, selected-step routing, step slug/path, product/offer association where appropriate.

None of this is built yet — §12 documents the conceptual model (`Funnel → ordered Funnel Steps → Page reference`) but no funnel CRUD, ordering, or resolution logic exists in production.

### 24.17 Analytics Event Plumbing

**This architecture must exist before deep analytics UI is built — it is not something to defer until "after launch."**

**Launch instrumentation target** (the event architecture itself):

- `page_view`
- `unique_visitor`
- `action_click`
- `form_submit`
- `booking_completed`
- `checkout_started`
- `order_completed`
- `funnel_step_view`
- `funnel_step_transition`

**Very Soon** (the reporting UI built on top of that instrumentation): page views, unique visitors, opt-ins, opt-in rate, bookings, purchases, revenue, conversion rate, revenue per visitor, time on page, funnel drop-off.

The distinction matters: the **event plumbing** (emitting and durably recording these events) is Launch-scope even though the **reporting dashboards** reading them back are Very Soon. Building reporting UI against ad hoc/missing event data, then having to retrofit the event architecture afterward, is exactly the piecemeal pattern this whole document exists to prevent.

### 24.18 A/B Testing

**Soon/Later:** variants per Funnel Step, traffic allocation, control/variation, stats per variant, winner selection.

The Funnel Step data model (§24.16) must be designed so it does not preclude variants later — e.g., a step referencing a single `pageId` today should be extensible to a step referencing multiple variant `pageId`s with a traffic-split config, without a breaking schema change.

### 24.19 Animations

**Classified VERY SOON / SOON** — not a Launch blocker unless the user later changes this priority.

Target: type, duration, delay, easing, scale where relevant, mobile behavior.

Applicable eventually to: Elements, Sections, Rows, Columns — one shared animation field/system, matching the "shared system, not per-component copy" rule from §24.3.

### 24.20 HighLevel Capability Matrix

_Maintained table — update the STATUS column as capabilities are built; do not silently change the PRIORITY column (§17's "don't silently reprioritize" rule applies here identically). **Every Status cell and every Priority cell must contain exactly ONE token from its enum** (`BUILT`/`PARTIAL`/`MISSING`/`DEFERRED`/`SKIP` for Status; `LAUNCH`/`VERY SOON`/`LATER`/`SKIP` for Priority) — never a compound value like "BUILT (foundation)" or "LAUNCH (core); VERY SOON (rest)". Qualifying detail belongs in Notes/Gaps. This was reconciled once already (see Build Status) after compound cells caused a real miscount in a summary report — do not reintroduce them._

| Capability                     | HighLevel Behavior / Expected Depth                                               | Magnetix Status | Priority  | Magnetix Implementation System                                          | Notes / Gaps                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------- | --------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Puck engine                    | Proprietary drag/drop canvas engine                                               | BUILT           | LAUNCH    | `@puckeditor/core`, `clientPuckConfig`/`serverPuckConfig`               | Engine proven stable (§2/§3); remaining work is Magnetix's own registry/config on top                                                                                                                                                                                                                                                                       |
| Magnetix shell                 | Proprietary editor UI                                                             | BUILT           | LAUNCH    | `editor-shell.tsx`, `magnetix-theme.css`, blocks/layers/settings panels | Settings panel shows a real, collapsible-grouped "Styles" field per compatible component (System A) AND the literal top-level General/Styles/Animations tab split (§24.2) — resolved this closeout task via `overrides.fields`'s keyed children array; see Known Bugs history.                                                       |
| Section/Row/Column             | Nested container model                                                            | PARTIAL         | LAUNCH    | `layout.tsx`, `config.tsx`, `auto-hierarchy.ts`                         | Hierarchy, the shared Phase 2D background system, System A's shared border/radius/box-shadow/spacing/responsive/visibility, min-height, full-width-background independent of contained max-width content, AND (System B) auto hierarchy/auto-wrapping are now built. Still PARTIAL against the full §24.5 target — reverse mobile stacking (Very Soon, not Launch) is the one remaining gap. Kept as one row — all three still share identical implementation depth. |
| Exact drag/drop                | Precise drop-position indicators, nested drag                                     | BUILT           | LAUNCH    | Puck core + `blocks-panel.tsx`                                          | Confirmed live across Phase 2A/2B                                                                                                                                                                                                                                                                                                                           |
| Auto hierarchy / auto-wrapping | Bare element dropped on empty page auto-wraps in Section/Row/Column               | BUILT           | LAUNCH    | `auto-hierarchy.ts`, `auto-hierarchy-watcher.tsx`, Puck `SetDataAction`  | A reactive watcher (mounted inside `<Puck>`'s tree) auto-wraps any bare root-level node via Puck's real `dispatch`; scoped to the root zone specifically, since Row/Column slots are already `allow`-restricted at the Puck drag/drop level and can't receive a mismatched drop in the first place. Live-confirmed (real `dispatch`, not simulated drag): Heading/Row/Column all correctly wrapped with the minimal necessary scaffolding; Hero/Section pass through untouched; Undo removes the whole auto-created structure in one step; Redo restores it. |
| Layers                         | Layer/outline tree                                                                | BUILT           | LAUNCH    | `layers-panel.tsx` wrapping Puck's real Outline                         | —                                                                                                                                                                                                                                                                                                                                                           |
| Undo/Redo                      | Standard undo/redo                                                                | BUILT           | LAUNCH    | Puck native history (§3)                                                | Stable-prop-reference rule (§3) is load-bearing                                                                                                                                                                                                                                                                                                             |
| Preview                        | Page-style, real-URL preview                                                      | BUILT           | LAUNCH    | `preview-session.ts`, `.../new-builder/preview`                         | Built in Phase 2D; awaiting real authenticated-route user QA                                                                                                                                                                                                                                                                                                |
| Rich text                      | Mixed inline formatting in one text node                                          | BUILT           | LAUNCH    | Puck native `richtext` field (Tiptap), `RichTextRenderElement`          | A genuinely separate `RichText` element alongside Heading/Text (Decision A — zero migration risk to existing Text content). Bold/italic/underline/strike/links/bulleted+numbered nested lists/blockquote/code/code block/headings all live-confirmed via real Tiptap keyboard shortcuts and input rules, both in the editor canvas and the server `<Render>`/Preview path. Text highlight deliberately not built — not part of Puck's default extension set, would need a custom Tiptap fork. |
| Typography (shared system)     | Font/size/weight/style/line-height/letter-spacing/align/color/opacity/transform   | BUILT           | LAUNCH    | `style.ts`, `style-field.tsx` (System A)                                | Full target field set implemented; font-size/weight/opacity/text-transform confirmed live with exact computed values. Rotation/skew deferred to Very Soon, as scoped.                                                                                                                                                                                       |
| Spacing (shared system)        | Linked/unlinked margin + padding, all sides                                       | BUILT           | LAUNCH    | `style.ts`, `style-field.tsx` (System A)                                | Linked AND independent/unlinked per-side values (margin + padding) confirmed live this closeout task on Section, Button, and Heading, exact computed values matching what was entered.                                                                                                     |
| Border                         | Style/color/width/radius, independent per side                                    | PARTIAL         | LAUNCH    | `style.ts`, `style-field.tsx` (System A)                                | Style (none/solid/dashed/dotted) confirmed live; color (reuses `ColorInput`) and independent per-side width implemented but not independently live-confirmed this task.                                                                                                                                                                                     |
| Radius                         | Linked/independent four corners                                                   | BUILT           | LAUNCH    | `style.ts`, `style-field.tsx` (System A)                                | Linked + 4 independent corners confirmed live this closeout task on Button and Section, exact computed values. Image shares the identical code path but wasn't independently drag-inserted and live-clicked — see Known Bugs.                                                                                                                                                                                                                                                  |
| Shadow                         | Box shadow + text shadow                                                          | BUILT           | LAUNCH    | `style.ts`, `style-field.tsx` (System A)                                | Box shadow enable/customize/disable/re-enable AND text shadow enable/customize/disable/re-enable both confirmed live this closeout task — disabling then re-enabling restores the exact prior custom values, not defaults. Multiple/inset shadows correctly out of scope (Very Soon).                                                                                                                            |
| Backgrounds                    | Source/Color/Gradient/Image/Video, blur                                           | PARTIAL         | LAUNCH    | `background.ts`, `background-field.tsx`, `BackgroundLayer`              | Unchanged this task (files confirmed byte-identical via `git diff`) — Color/Gradient/Blur fully built (Phase 2D); Image/Video source still needs full product treatment (§24.3.5). System A additionally wired the same shared system onto Button.                                                                                                          |
| Responsive overrides           | Sparse per-breakpoint style overrides                                             | BUILT           | LAUNCH    | `style.ts` `resolveResponsiveCss` (System A)                            | Font-size/text-align/spacing tablet AND mobile overrides confirmed live with exact generated `@media` CSS. Per-device Column width override built and confirmed live this closeout task (Tablet 1/2+1/2, Mobile full+full, exact generated `grid-column` CSS). Reverse stacking remains Very Soon, unbuilt.                                                                                                                                                 |
| Device visibility              | Show/hide per breakpoint                                                          | BUILT           | LAUNCH    | `style.ts` `resolveResponsiveCss` (System A)                            | Confirmed live for Desktop and Mobile with exact generated `@media` CSS (Tablet is the identical code path); confirmed the hidden component remains in Data/Layers, not deleted. Applied to Section/Row/Column and every core element except Spacer (deliberately excluded, §24.3).                                                                         |
| Image (element depth)          | Sizing/object-fit/border/radius/shadow/responsive                                 | BUILT           | LAUNCH    | `elements.tsx` `ImageRender`, `media-size.ts`, shared style systems     | Upload/replace/alt/PageAction (prior task) plus width/max-width/height/object-fit/object-position/alignment (`ImageSizeConfig`, System B) layered additively on top of the existing shared spacing/border/radius/shadow/responsive/visibility system. Live-confirmed via `getComputedStyle` (width/height/object-fit/object-position simultaneously correct). |
| Video (element depth)          | Provider/embed, playback options, sizing/border/shadow                            | BUILT           | LAUNCH    | `elements.tsx` `VideoRender`, `video.ts`, `media-size.ts`               | Real provider auto-detection (YouTube/Vimeo/direct-file) from the pasted URL, one shared `resolveVideoEmbed()` resolver for editor/Preview/public alike, autoplay/muted/loop/controls/poster (playback), width/max-width/aspect-ratio (size). Browser-autoplay-restriction coercion (`autoplay` always forces `muted`) and the YouTube `loop`+`playlist` param quirk both live-confirmed via the real generated embed URL. |
| PageAction                     | Rich action vocabulary with per-element compatibility                             | PARTIAL         | LAUNCH    | `types/pages-funnels-puck.ts`, `action.ts`                              | Foundation type covers the full vocabulary (§8); only `url` resolves at runtime. Compatibility-by-element concept newly formalized, §24.7.                                                                                                                                                                                                                  |
| Form                           | Reference existing form builder, post-submit routing                              | PARTIAL         | LAUNCH    | `form-client.tsx`/`form-server.tsx`                                     | References real LeadForms; edit-in-place and full post-submit routing not built. Post-submit next/selected-step routing depends on Funnel Model, §24.16.                                                                                                                                                                                                    |
| Booking                        | Reference existing calendar, post-booking routing                                 | MISSING         | LAUNCH    | TBD — new element referencing existing Booking feature                  | —                                                                                                                                                                                                                                                                                                                                                           |
| Checkout                       | Full checkout depth (§11)                                                         | MISSING         | LAUNCH    | TBD                                                                     | Core checkout is Launch scope; order bump/upsell-downsell are their own Very Soon rows below. Contingent on the Stripe Connect per-sub-account architecture already shipped.                                                                                                                                                                                |
| Funnel ordered steps           | Funnel object, ordered steps, page assignment                                     | MISSING         | LAUNCH    | TBD, Magnetix-owned (Puck stays unaware, §12)                           | —                                                                                                                                                                                                                                                                                                                                                           |
| Next-step routing              | "Next step"/"specific step" resolve at runtime                                    | MISSING         | LAUNCH    | `action.ts` + future funnel service                                     | Resolution logic not implemented; vocabulary already reserved on `PageAction`                                                                                                                                                                                                                                                                               |
| Navigation                     | Page links, external URL, scroll, dropdowns, nested items, mobile menu, mega menu | MISSING         | VERY SOON | TBD, new element                                                        | Core nav (links/URL/scroll/dropdowns/mobile menu) not yet committed to Launch — §24.9 leaves it "Launch or Very Soon"; mega menu is Later regardless                                                                                                                                                                                                        |
| Autosave                       | Real-time draft autosave, Saving/Saved indicator                                  | BUILT           | LAUNCH    | `use-puck-persistence.ts`, `pages-funnels-puck-service.ts`               | 2s-debounced, one shared save code path with the manual Save Draft button; Saving…/Saved/error indicator confirmed live. No save-on-every-keystroke, no save-before-initial-load, no redundant identical-data saves.                                                                                                                                       |
| Publish                        | Explicit publish, separate from draft                                             | BUILT           | LAUNCH    | `editor-shell.tsx` (UI), `pages-funnels-puck-service.ts` (persistence)  | Real, durable, atomic (draft+published snapshot in one write). Draft-vs-published integrity confirmed live via direct Admin-SDK tests against real Firestore — editing/saving after Publish does not change the public page until Publish is clicked again.                                                                                               |
| Version history                | Checkpoints, restore prior version                                                | MISSING         | LAUNCH    | TBD                                                                     | Explicitly deferred by the Puck Persistence + Publish Foundation task's own "don't let this block the core loop" permission — `puckPublishedData` is one frozen snapshot, not a history. No version/revision collection precedent exists anywhere in this codebase yet.                                                                                    |
| SEO / page settings            | Title/meta/slug/sharing image/index/domain/favicon                                | PARTIAL         | LAUNCH    | TBD                                                                     | Core page settings exist in V1 but are not migrated to the Puck Data model. Custom meta tags/canonical URL/schema markup are Very Soon; AI-generated schema is Later.                                                                                                                                                                                       |
| Tracking scripts               | Funnel-wide + per-page/step head/body scripts                                     | MISSING         | VERY SOON | TBD                                                                     | Needs a security/sanitization review before shipping                                                                                                                                                                                                                                                                                                        |
| Analytics event plumbing       | Event architecture underlying all reporting                                       | MISSING         | LAUNCH    | TBD                                                                     | The event architecture itself (not the reporting UI) is Launch scope — see §24.17                                                                                                                                                                                                                                                                           |
| Order bump                     | Pre-purchase add-on                                                               | MISSING         | VERY SOON | TBD, part of Checkout                                                   | Keep distinct from Upsell, §11                                                                                                                                                                                                                                                                                                                              |
| Upsell/downsell                | Post-purchase offer, reused authorization                                         | MISSING         | VERY SOON | TBD                                                                     | Contingent on Stripe Connect capability                                                                                                                                                                                                                                                                                                                     |
| Order confirmation             | Dedicated confirmation/order-summary element                                      | MISSING         | VERY SOON | TBD                                                                     | —                                                                                                                                                                                                                                                                                                                                                           |
| Popup                          | Built from same primitives, open/close/delay/entry triggers                       | MISSING         | VERY SOON | TBD — reuses Section/Row/Column inside an overlay + Show/Hide action    | Exit intent/advanced conditions = LATER                                                                                                                                                                                                                                                                                                                     |
| Countdown                      | Countdown timer element                                                           | MISSING         | VERY SOON | TBD, new element                                                        | —                                                                                                                                                                                                                                                                                                                                                           |
| Pricing table                  | Pricing/plan comparison element                                                   | MISSING         | VERY SOON | TBD, likely references Offers/Products                                  | —                                                                                                                                                                                                                                                                                                                                                           |
| Saved elements/sections        | Save reusable copy (independent after insertion)                                  | MISSING         | VERY SOON | TBD                                                                     | Distinct from Global/Universal (LATER), §24.11                                                                                                                                                                                                                                                                                                              |
| Animation                      | Type/duration/delay/easing/scale/mobile behavior                                  | MISSING         | VERY SOON | TBD, proposed shared `animationField`                                   | Not a Launch blocker unless reprioritized                                                                                                                                                                                                                                                                                                                   |
| Global/Universal content       | Synchronized content across usages                                                | MISSING         | LATER     | TBD                                                                     | Conceptually documented, §14/§24.11                                                                                                                                                                                                                                                                                                                         |
| A/B testing                    | Variants per Funnel Step, traffic allocation, winner selection                    | MISSING         | LATER     | TBD                                                                     | Funnel Step model must not preclude this, §24.18                                                                                                                                                                                                                                                                                                            |
| Galleries                      | Image gallery/carousel element                                                    | MISSING         | LATER     | TBD                                                                     | Not previously scoped elsewhere in this document; needs explicit user prioritization before further design                                                                                                                                                                                                                                                  |
| Mega menu                      | Multi-column dropdown navigation                                                  | MISSING         | LATER     | TBD, part of Navigation                                                 | —                                                                                                                                                                                                                                                                                                                                                           |

**Totals (verified by direct row count via `grep`/`awk` over the table, not narrative summary — recomputed after System B): 44 rows total. BUILT: 18. PARTIAL: 6. MISSING: 20. DEFERRED: 0. SKIP: 0. 18 + 6 + 20 + 0 + 0 = 44.** (This task: Auto hierarchy/auto-wrapping and Rich text moved MISSING → BUILT; Image (element depth) and Video (element depth) moved PARTIAL → BUILT. Section/Row/Column stays PARTIAL (reverse mobile stacking, Very Soon, is its one remaining gap). No other row's status changed.)

### 24.21 Current Magnetix Status

Consistent with the Build Status section at the top of this document — restated here as the capability-baseline snapshot:

**Already built/foundation:**

- Puck production foundation
- Custom Magnetix editor shell
- Icon-based Blocks panel
- Layers
- Exact Puck drag/drop
- Nested selection
- Inline Heading/Text editing
- Responsive viewport previews
- Undo/Redo
- Hero factory
- Form reference foundation
- Page-style unsaved Preview
- Shared `BackgroundConfig` (Solid/Gradient, Linear/Radial/Angular gradients, color picker, 2–10 stops, stop positions, angle, blur, Section/Row/Column support)
- Direct V1 → Puck migration foundation

**Still intentionally NOT wired:**

- Persistence
- Publish
- Funnel orchestration
- Booking page element
- Checkout
- Full PageAction behavior (only `url` resolves)
- Analytics
- Advanced style systems (typography/spacing/border/shadow shared fields, responsive overrides, device visibility)

### 24.22 Implementation Order

_A planning sequence only — approving this baseline does NOT authorize starting any of these phases. Each still requires its own explicit user go-ahead and QA gate, per §19's standing rule._

**A. Core shared style system** — typography, spacing, border/radius, shadow, responsive overrides, device visibility, Background completion (Image/Video source).

**B. Core content elements** — Rich Text, Image depth, Video depth, auto hierarchy.

**C. Shared Action system** — full compatibility-by-element implementation (§24.7).

**D. Persistence / autosave / draft-publish / versions** (§24.12).

**E. Form + Booking business integration** (§24.8).

**F. Funnel orchestration** (§24.16).

**G. Checkout / commerce** (§24.8, §11).

**H. Analytics instrumentation / reporting** (§24.17).

**I. Very Soon features** — popup, countdown, pricing, saved content, animations, order bump, upsell/downsell, and the remaining Very Soon items from §24.20's matrix.

Do not implement any item from this ordering without an explicit, separately-approved task — this section documents a _sequence_, not a standing authorization.
