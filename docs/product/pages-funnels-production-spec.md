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

*Update this block whenever a meaningful milestone changes. Keep it short and current — it is the first thing a future session reads.*

**CURRENT PHASE:** Requirements consolidation after Phase 2D — a deeper GoHighLevel capability audit has been converted into a binding baseline (§24: GoHighLevel Capability Baseline and Magnetix Requirements Matrix). Documentation only; no builder code changed this task.

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
  - `src/app/(builder)/sa/[subAccountId]/layout.tsx` — gained `<AppAccent/>` (previously mounted only in `(dashboard)`'s layout). Fixes a real, pre-existing gap affecting the V1 editor too: a direct/refreshed load of any `(builder)` route rendered with the wrong (non-Magnetix) theme, since `<html>`'s theme class only survives *client-side* navigation, not a fresh document load.
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
  - **Two real bugs found and fixed during live QA** (both caught via the QA pass itself, not reported beforehand): (1) `addStop()`'s "widest gap" placement logic only considered gaps *between* existing stops, so with exactly one existing stop it always fell back to a hardcoded 50% — clicking "Add Color Stop" twice from an empty gradient silently produced two stops stacked at the same 50% position (an invisible, degenerate gradient). Fixed by measuring gaps across `[0, ...existing positions, 100]` uniformly, so 0/1/2+ stops all place sensibly with no special case. (2) Toggling Background Blur "on" left `intensity` at its 0 default, so the toggle visibly did nothing until the user also dragged the slider — fixed by seeding a sensible non-zero intensity (12px) the moment the toggle flips on with intensity still at 0 (never overwrites an already-chosen intensity).
  - **Section/Row/Column support.** Confirmed live (Playwright + computed-style/DOM inspection against the fixture harness): Section, Hero, Row, and Column each show the identical Background field in Settings, and each independently renders its own live gradient/blur via the one shared `BackgroundLayer`.
  - **V1 migration.** `migrateBackgroundStyle()` (migrate-v1.ts) now emits the new `BackgroundConfig` shape, preserving only the real V1 `backgroundStyle` INTENT (mode: solid vs. gradient) — `solid: ""` / `stops: []` respectively, never inventing colors V1 never had (V1 only ever stored the enum, confirmed again this phase). A migrated gradient Section now opens with "Gradient" already selected and an empty, ready-to-fill stop list, rather than reverting to "None."
  - Full regression pass (drag/drop, inline editing, Undo/Redo, Layers, Blocks panel, Desktop/Tablet/Mobile, Hero, Form) confirmed unaffected; 0 unexpected browser console errors.
  - **Deferred, not built this task (explicitly out of scope per the task):** Image/Video background source field UI (types exist, ready for a future phase); alpha/transparency on colors; Checkout/Booking/funnel-orchestration Actions; popups; pricing/countdown elements; A/B testing; Puck Data persistence/cutover; a brand-board system.
- **Requirements consolidation — GoHighLevel capability baseline (documentation only, no code changed):** a deeper audit of GoHighLevel's Pages/Funnels builder was converted into §24 (GoHighLevel Capability Baseline and Magnetix Requirements Matrix) — a binding, structured capability matrix so future implementation proceeds system-by-system from an approved baseline instead of piecemeal ("add borders" this session, "add shadows" a later one). Locks the future Settings panel organization (General/Styles/Animations, §24.2), documents five shared style systems (Typography, Spacing, Border, Shadow, Background — §24.3) that must be built once and reused across every component rather than per-element, and adds a maintained 44-row capability matrix (§24.20) with STATUS/PRIORITY/IMPLEMENTATION SYSTEM columns. Newly classified LAUNCH this task (added to §17): auto hierarchy/auto-wrapping, Rich Text mixed formatting, shared Spacing/Border/Radius, one box+text shadow, per-device visibility + responsive typography/spacing/alignment, the Preview architecture (already built), autosave/Publish/version history, and analytics event plumbing (the instrumentation itself, ahead of the reporting UI). No existing architecture decision (§1–§23) was changed or reprioritized — this is additive documentation, not a rewrite of prior history.
- **Capability matrix reconciliation (documentation only, no code changed):** a summary report on the §24.20 matrix miscounted its rows (compound Status/Priority cells like "BUILT (foundation)" or "LAUNCH (core); VERY SOON (rest)" led to an inconsistent narrative tally that didn't match the table). Audited every row directly (verified programmatically, not by eye) and corrected two things: (1) every Status and Priority cell now holds exactly one enum token, with all qualifying detail moved into Notes/Gaps — this was a real documentation defect, not just a reporting error, since a future session scanning the table for a plain "BUILT" match could have been misled the same way; (2) **Section/Row/Column's status changed from BUILT to PARTIAL** — hierarchy and the Phase 2D background system are genuinely built, but the §24.5 layout-control target (border/radius/shadow/min-height/responsive-visibility) isn't, so BUILT overstated it. Verified final totals directly from the table: **44 rows — BUILT: 6, PARTIAL: 9, MISSING: 29, DEFERRED: 0, SKIP: 0 (6+9+29+0+0=44)**. No priority (Launch/Very Soon/Later) was changed for any capability that already had a single, unambiguous value; two previously-ambiguous compound-priority rows (Navigation, Tracking scripts) were resolved to their already-documented single value (Navigation → Very Soon per §24.9's own "Launch or Very Soon" hedge with no Launch commitment elsewhere; Tracking scripts → Very Soon, matching what §17 already said).

**IN PROGRESS:** Nothing — the §24 capability baseline is complete and awaiting user approval before any of its items are implemented; Phase 2D itself remains pending manual user QA of the real authenticated route.

**KNOWN BUGS:**
- None outstanding from Phase 2D — the two real bugs found during this task's own QA (gradient stop placement collision, Background Blur toggle with no visible effect at 0 intensity) were both fixed within the same task; see the Phase 2D COMPLETED entry above for detail. 0 unexpected browser console errors across the full QA pass.
- The Insert Undo Blocker (Puck 0.23.0 corrupting `history[0]` when a controlled `<Puck>`'s `iframe`/`metadata` props are inline object literals) has a confirmed, supported-API-only fix: hoist those props to stable references. Carried forward unchanged since Phase 1 — standing implementation rule (§3), enforced in review, for every future controlled `<Puck>` usage.
- Puck's own `overrides` API is documented by Puck itself as "highly experimental." Still exactly the five override keys from Phase 2B (`header`, `headerActions`, `drawer`, `outline`, `fields`) — Phase 2C added no new override keys, only a new `resolveFields` component-level option (Section/Hero) and an `onAction` prop, both separate, real, documented parts of the supported API surface.
- CSS custom-property overrides meant to affect Puck's canvas-iframe content (ActionBar, selection/drop indicators) must be scoped to `:root`, not a wrapper class — a wrapper-class scope silently fails to reach anything rendered inside the iframe, even with `syncHostStyles: true`. Standing constraint, unchanged.
- **New:** `tailwind-merge` does not cancel a `sm:`-prefixed (or any breakpoint-prefixed) base class with an unprefixed override — the override must repeat the same prefix (e.g. `sm:max-w-none` to cancel a base `sm:max-w-sm`). Standing gotcha for any future full-bleed/full-screen override of a shadcn component built with responsive default classes.
- Known remaining gap, not fixed this task (out of scope — Image/Video background field UI is explicitly deferred per Phase 2D's own scope): `BackgroundConfig.source` supports `"image"`/`"video"` at the type level, but neither has field UI yet; migrated Sections with a V1 `backgroundStyle: "image"` map to `DEFAULT_BACKGROUND` (`source: "none"`) rather than losing the block's content.
- Row/Column nodes generated by `migrate-v1.ts` (V1 never had per-row/per-column backgrounds) don't get an explicit `background` prop written into their migrated data — intentional, not an oversight: `BackgroundLayer`/`BackgroundFieldEditor` both treat a missing/`undefined` background exactly like `DEFAULT_BACKGROUND` (`source: "none"`), so this is honest (never inventing a background V1 never had) and functionally identical to writing the default explicitly.
- Save Draft/Publish are intentionally non-functional (disabled) — Puck Data persistence has not been approved/built yet (§18 of the master spec's migration principles still applies: no persistence change without an explicit future task).

**AWAITING USER TEST:** Manual QA of the REAL authenticated route — go to Marketing → Pages & Funnels → click **"Try New Builder"** on any page card. Confirm: (1) selecting a Section, Row, or Column shows the same Background field (None/Color/Image/Video), and choosing Color → Gradient shows a real color picker, gradient type switcher (Linear/Radial/Angular), an add/remove/reposition stop list, an angle control (hidden for Radial), and a Background Blur toggle + intensity slider — all updating the canvas live; (2) clicking Preview opens a genuine new browser tab with no dialog, no close button, no editor chrome, showing the exact same unsaved content, at real browser width; (3) a long page scrolls to a fully-visible bottom in that tab. This session could not drive that route directly (no Firebase Auth credentials available); QA was performed against a fixture-fed harness rendering the identical `MagnetixPuckEditorShell` component plus its matching docs-scoped Preview route — strong evidence, not a substitute for the user seeing the real route with a real page.

**AWAITING USER DECISION:** Approval of the expanded §24 capability baseline (the shared style systems, the Settings-panel General/Styles/Animations organization, the newly-classified LAUNCH items in §17, and the §24.22 implementation order) before any further implementation begins. Separately, approval to begin further Phase 2 work (deeper settings-panel taxonomy, additional prebuilt sections, persistence design) once the real authenticated route is manually verified for Phase 2D.

**NEXT APPROVED TASK:** None until the user approves the §24 baseline. See §23 above once authorized.

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
- `iframe={{ syncHostStyles: true }}` correctly propagates Magnetix/Tailwind styling into the canvas iframe — this is the mechanism for making the *editor canvas* preview look like the real published page.
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

| Already exists in Magnetix (needs a page-element *wrapper*, not new infrastructure) | Still needs implementation as a page element |
|---|---|
| Forms (full form builder, submissions, automations) | Heading, Text/Rich Text, Button, Image, Video, Icon/SVG, Divider, Spacer, Accordion (general-purpose Accordion element exists from V2 work and should carry forward) |
| Booking/calendar system | Checkout (page-element form of it) |
| Offers/Products | Pricing Table |
| Courses (course CTA target) | Countdown |
| Community | Popup / popup trigger |
| Stripe Connect (per sub-account) | Navigation element |
| | Order Bump, Upsell/Downsell action, Order Summary/Confirmation |

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
- **ORDER BUMP** — an optional add-on offered *before* the initial purchase completes.
- **UPSELL / DOWNSELL** — a *post-purchase* offer that reuses the already-authorized payment relationship, where the payment provider architecture permits it (i.e., contingent on how Magnetix's Stripe Connect integration supports charging a previously-authorized customer without re-collecting payment details).

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

**Division of ownership:** Puck's native `viewports` system may provide the preview-switching *mechanics* (which breakpoint is currently being edited/previewed). **Magnetix owns the actual responsive component behavior/settings** — i.e., what a Column's width or an Element's visibility actually *does* at each breakpoint is Magnetix field/prop design, not something to inherit from Puck defaults.

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

*The user may change these later. Do not silently reprioritize — if a future session believes the priority should change, say so and ask, don't just reorder this list. See §24.20 for the full granular, capability-level priority matrix — the lists below are the section-level summary; §24's additions below are explicit new classifications the user gave directly, not inferred.*

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
*(empty — nothing has been explicitly ruled out yet; add items here only when the user explicitly decides something is out of scope, rather than merely deferred)*

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

- **PHASE 0** — Master spec / source of truth. *(this document)*
- **PHASE 1** — Production Puck foundation, built alongside the current V1 builder (not replacing it yet).
- **PHASE 2** — Core page-editor experience and primitives (the Launch-scope element inventory from §7, the Magnetix visual reskin from §6).
- **PHASE 3** — Shared Action system (§8).
- **PHASE 4** — Native Business elements: Form, Booking, Checkout (§9, §10, §11).
- **PHASE 5** — Funnel orchestration / ordered steps / Next Step (§12).
- **PHASE 6** — Commerce depth: order bump, upsell/downsell, confirmation, advanced checkout (§11).
- **PHASE 7+** — Popups, countdown, pricing, saved sections, animations, analytics/A-B (§17's Very Soon/Later items).

---

## 20. Current State

*(as of this document's creation)*

- Production **custom V1 builder** exists and is live (`PageBlock[]` model, `Canvas`/`BlocksPanel`/`SettingsPanel`, `@dnd-kit` drag/reorder, draft/publish, `/p/[pageId]` public route).
- **V2 migration/renderer experiments exist** (fixed tree types, deterministic migration, read-only tree renderer wired into Preview and `/p/[pageId]`) — validated as a reference, not shipped as a second canonical schema (§18).
- **Puck POC exists and passed core technical validation** — drag/drop, nesting, selection, Outline, device previews, real Form rendering, serialization, server-side `<Render>`, and (after the Insert Undo Blocker fix) working Undo/Redo, all live-tested.
- **Puck is not yet wired into production Pages & Funnels.** All Puck work to date lives under `src/app/docs/design-prototypes/puck-poc/`, isolated, unauthenticated, unlinked from production nav, with zero Firestore/PageDoc/production-route changes.
- **Current production Firestore format remains V1.** No production migration has started.
- **GoHighLevel/ClickFunnels teardown has informed this specification** (the element inventory, Action system, checkout/commerce vocabulary, and funnel model in §7–§12 reflect that research), without Magnetix being built as a clone of either.

---

## 21. Document Discipline

*(restated from the top for scannability — see the header of this document for the full list)*

Read before changing architecture. Preserve decisions unless the user changes them. Keep Build Status current. Record new constraints here. Don't silently reprioritize. Don't implement ahead of the current approved task.

**Strengthened after the §24 capability baseline was added:** future implementation agents must:

- Read the full §24 capability matrix before scoping any Pages & Funnels implementation task — not just this document's top-level sections.
- Never silently omit a Launch requirement from a shared system (§24.3's Typography/Spacing/Border/Shadow/Background) just because a single task only asked for one element type — if a task asks for "Button borders," check whether that means building the *shared* border system (§24.3.3) that Section/Row/Column/Image/etc. will also need, not a Button-only implementation.
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

*(filled in once the user authorizes Phase 1 — left intentionally blank at document creation)*

---

## 24. GoHighLevel Capability Baseline and Magnetix Requirements Matrix

*Added after a deeper audit of the current GoHighLevel Pages/Funnels builder, to convert that research into a binding, structured capability baseline before further implementation proceeds. This section does not change any decision made in §1–§23 — it makes the existing Launch-scope element/system inventory (§7, §8, §13, §14) concrete enough that implementation agents can work system-by-system from an approved matrix instead of discovering basic builder controls piecemeal through user QA.*

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

| Capability | Status |
|---|---|
| Hierarchy (Section/Row/Column/Element) | Built (foundation) |
| Drag/drop | Built |
| Layers | Built |
| Undo/Redo | Built |
| Viewport controls (Desktop/Tablet/Mobile) | Built |
| Inline editing | Built |
| Auto hierarchy / auto-wrapping | Missing |
| In-editor page switcher | Missing |

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

The current Settings panel (`settings-panel.tsx`, Phase 2B) is still **foundation-level** — it wraps Puck's real field inputs with a header, but the fields themselves are not yet organized into General/Styles/Animations tabs or sub-groups. Evolving toward this three-group organization is Launch-scope work, tracked in §24.20's matrix under "Magnetix shell."

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

| Capability | Status |
|---|---|
| Viewport preview (Desktop/Tablet/Mobile switching) | Built |
| Basic mobile stacking | Built |
| Device visibility | Missing |
| Responsive style override system | Partial / missing |

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

**Current status:**
- Puck Data persistence is not wired.
- Save Draft/Publish in the New Builder are intentionally disabled (Phase 2A onward) — real UI, no backing persistence yet.
- V1 has its own persistence (`updatePageBlocks`, etc.), but that is a separate system from the target Puck Data persistence path and is not the thing being extended here.
- Version history does not exist in either system.

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

*Maintained table — update the STATUS column as capabilities are built; do not silently change the PRIORITY column (§17's "don't silently reprioritize" rule applies here identically). **Every Status cell and every Priority cell must contain exactly ONE token from its enum** (`BUILT`/`PARTIAL`/`MISSING`/`DEFERRED`/`SKIP` for Status; `LAUNCH`/`VERY SOON`/`LATER`/`SKIP` for Priority) — never a compound value like "BUILT (foundation)" or "LAUNCH (core); VERY SOON (rest)". Qualifying detail belongs in Notes/Gaps. This was reconciled once already (see Build Status) after compound cells caused a real miscount in a summary report — do not reintroduce them.*

| Capability | HighLevel Behavior / Expected Depth | Magnetix Status | Priority | Magnetix Implementation System | Notes / Gaps |
|---|---|---|---|---|---|
| Puck engine | Proprietary drag/drop canvas engine | BUILT | LAUNCH | `@puckeditor/core`, `clientPuckConfig`/`serverPuckConfig` | Engine proven stable (§2/§3); remaining work is Magnetix's own registry/config on top |
| Magnetix shell | Proprietary editor UI | BUILT | LAUNCH | `editor-shell.tsx`, `magnetix-theme.css`, blocks/layers/settings panels | Settings panel is foundation-level, not yet General/Styles/Animations (§24.2) |
| Section/Row/Column | Nested container model | PARTIAL | LAUNCH | `layout.tsx`, `config.tsx` | Hierarchy and the shared Phase 2D background system are fully built; the §24.5 layout-control target (border, radius, shadow, min height, responsive visibility) is not yet built on any of the three. Kept as one row — all three currently share identical implementation depth, not split per-component. |
| Exact drag/drop | Precise drop-position indicators, nested drag | BUILT | LAUNCH | Puck core + `blocks-panel.tsx` | Confirmed live across Phase 2A/2B |
| Auto hierarchy / auto-wrapping | Bare element dropped on empty page auto-wraps in Section/Row/Column | MISSING | LAUNCH | TBD — likely a custom insert-time handler over Puck's insert action | Not yet scoped |
| Layers | Layer/outline tree | BUILT | LAUNCH | `layers-panel.tsx` wrapping Puck's real Outline | — |
| Undo/Redo | Standard undo/redo | BUILT | LAUNCH | Puck native history (§3) | Stable-prop-reference rule (§3) is load-bearing |
| Preview | Page-style, real-URL preview | BUILT | LAUNCH | `preview-session.ts`, `.../new-builder/preview` | Built in Phase 2D; awaiting real authenticated-route user QA |
| Rich text | Mixed inline formatting in one text node | MISSING | LAUNCH | TBD — Puck `richtext` field or Tiptap-backed custom field | Needs its own technical investigation before implementation |
| Typography (shared system) | Font/size/weight/style/line-height/letter-spacing/align/color/opacity/transform | MISSING | LAUNCH | TBD — proposed shared `typographyField`, mirrors Background's pattern | No shared system exists yet; rotation/skew deferred to Very Soon |
| Spacing (shared system) | Linked/unlinked margin + padding, all sides | PARTIAL | LAUNCH | TBD — proposed shared `spacingField` | Ad hoc per-component padding fields exist (e.g. Section paddingTop/paddingBottom); no shared linked/unlinked margin+padding system yet. Responsive overrides layered on later. |
| Border | Style/color/width/radius, independent per side | MISSING | LAUNCH | TBD — proposed shared `borderField` | Likely reuses `ColorInput` |
| Radius | Linked/independent four corners | MISSING | LAUNCH | Folded into the Border system | — |
| Shadow | Box shadow + text shadow | MISSING | LAUNCH | TBD — proposed shared `shadowField` | Launch scope is one box shadow + one text shadow; multiple layered/inset shadows are Very Soon |
| Backgrounds | Source/Color/Gradient/Image/Video, blur | PARTIAL | LAUNCH | `background.ts`, `background-field.tsx`, `BackgroundLayer` | Color/Gradient/Blur fully built (Phase 2D); Image/Video source needs full product treatment (§24.3.5) |
| Responsive overrides | Sparse per-breakpoint style overrides | MISSING | LAUNCH | TBD — extends each shared style field with an optional per-breakpoint map | — |
| Device visibility | Show/hide per breakpoint | MISSING | LAUNCH | TBD — proposed shared `visibility` field | — |
| Image (element depth) | Sizing/object-fit/border/radius/shadow/responsive | PARTIAL | LAUNCH | `elements.tsx` `ImageRender` + shared style systems | Only src/alt/PageAction implemented; sizing/border/radius/shadow/responsive controls from §24.6 not yet built |
| Video (element depth) | Provider/embed, playback options, sizing/border/shadow | PARTIAL | LAUNCH | `elements.tsx` `VideoRender` | Only url/caption implemented; provider/sizing/border/radius/shadow controls not yet built. Playback options (autoplay/muted/controls/loop/poster) are Very Soon/Later. |
| PageAction | Rich action vocabulary with per-element compatibility | PARTIAL | LAUNCH | `types/pages-funnels-puck.ts`, `action.ts` | Foundation type covers the full vocabulary (§8); only `url` resolves at runtime. Compatibility-by-element concept newly formalized, §24.7. |
| Form | Reference existing form builder, post-submit routing | PARTIAL | LAUNCH | `form-client.tsx`/`form-server.tsx` | References real LeadForms; edit-in-place and full post-submit routing not built. Post-submit next/selected-step routing depends on Funnel Model, §24.16. |
| Booking | Reference existing calendar, post-booking routing | MISSING | LAUNCH | TBD — new element referencing existing Booking feature | — |
| Checkout | Full checkout depth (§11) | MISSING | LAUNCH | TBD | Core checkout is Launch scope; order bump/upsell-downsell are their own Very Soon rows below. Contingent on the Stripe Connect per-sub-account architecture already shipped. |
| Funnel ordered steps | Funnel object, ordered steps, page assignment | MISSING | LAUNCH | TBD, Magnetix-owned (Puck stays unaware, §12) | — |
| Next-step routing | "Next step"/"specific step" resolve at runtime | MISSING | LAUNCH | `action.ts` + future funnel service | Resolution logic not implemented; vocabulary already reserved on `PageAction` |
| Navigation | Page links, external URL, scroll, dropdowns, nested items, mobile menu, mega menu | MISSING | VERY SOON | TBD, new element | Core nav (links/URL/scroll/dropdowns/mobile menu) not yet committed to Launch — §24.9 leaves it "Launch or Very Soon"; mega menu is Later regardless |
| Autosave | Real-time draft autosave, Saving/Saved indicator | MISSING | LAUNCH | TBD — likely debounced Firestore writes to a Puck-Data `PageDoc` field | — |
| Publish | Explicit publish, separate from draft | PARTIAL | LAUNCH | `editor-shell.tsx` (UI) + TBD persistence service | Save Draft/Publish buttons exist in the editor UI but are intentionally disabled; no backing persistence service yet |
| Version history | Checkpoints, restore prior version | MISSING | LAUNCH | TBD | — |
| SEO / page settings | Title/meta/slug/sharing image/index/domain/favicon | PARTIAL | LAUNCH | TBD | Core page settings exist in V1 but are not migrated to the Puck Data model. Custom meta tags/canonical URL/schema markup are Very Soon; AI-generated schema is Later. |
| Tracking scripts | Funnel-wide + per-page/step head/body scripts | MISSING | VERY SOON | TBD | Needs a security/sanitization review before shipping |
| Analytics event plumbing | Event architecture underlying all reporting | MISSING | LAUNCH | TBD | The event architecture itself (not the reporting UI) is Launch scope — see §24.17 |
| Order bump | Pre-purchase add-on | MISSING | VERY SOON | TBD, part of Checkout | Keep distinct from Upsell, §11 |
| Upsell/downsell | Post-purchase offer, reused authorization | MISSING | VERY SOON | TBD | Contingent on Stripe Connect capability |
| Order confirmation | Dedicated confirmation/order-summary element | MISSING | VERY SOON | TBD | — |
| Popup | Built from same primitives, open/close/delay/entry triggers | MISSING | VERY SOON | TBD — reuses Section/Row/Column inside an overlay + Show/Hide action | Exit intent/advanced conditions = LATER |
| Countdown | Countdown timer element | MISSING | VERY SOON | TBD, new element | — |
| Pricing table | Pricing/plan comparison element | MISSING | VERY SOON | TBD, likely references Offers/Products | — |
| Saved elements/sections | Save reusable copy (independent after insertion) | MISSING | VERY SOON | TBD | Distinct from Global/Universal (LATER), §24.11 |
| Animation | Type/duration/delay/easing/scale/mobile behavior | MISSING | VERY SOON | TBD, proposed shared `animationField` | Not a Launch blocker unless reprioritized |
| Global/Universal content | Synchronized content across usages | MISSING | LATER | TBD | Conceptually documented, §14/§24.11 |
| A/B testing | Variants per Funnel Step, traffic allocation, winner selection | MISSING | LATER | TBD | Funnel Step model must not preclude this, §24.18 |
| Galleries | Image gallery/carousel element | MISSING | LATER | TBD | Not previously scoped elsewhere in this document; needs explicit user prioritization before further design |
| Mega menu | Multi-column dropdown navigation | MISSING | LATER | TBD, part of Navigation | — |

**Totals (verified by direct row count, not narrative summary — see Build Status for the reconciliation note): 44 rows total. BUILT: 6. PARTIAL: 9. MISSING: 29. DEFERRED: 0. SKIP: 0. 6 + 9 + 29 + 0 + 0 = 44.**

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

*A planning sequence only — approving this baseline does NOT authorize starting any of these phases. Each still requires its own explicit user go-ahead and QA gate, per §19's standing rule.*

**A. Core shared style system** — typography, spacing, border/radius, shadow, responsive overrides, device visibility, Background completion (Image/Video source).

**B. Core content elements** — Rich Text, Image depth, Video depth, auto hierarchy.

**C. Shared Action system** — full compatibility-by-element implementation (§24.7).

**D. Persistence / autosave / draft-publish / versions** (§24.12).

**E. Form + Booking business integration** (§24.8).

**F. Funnel orchestration** (§24.16).

**G. Checkout / commerce** (§24.8, §11).

**H. Analytics instrumentation / reporting** (§24.17).

**I. Very Soon features** — popup, countdown, pricing, saved content, animations, order bump, upsell/downsell, and the remaining Very Soon items from §24.20's matrix.

Do not implement any item from this ordering without an explicit, separately-approved task — this section documents a *sequence*, not a standing authorization.
