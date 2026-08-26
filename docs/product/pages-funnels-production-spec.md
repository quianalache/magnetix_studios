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

**CURRENT PHASE:** Phase 2A — CRM-integrated Magnetix-styled Puck editor. Built and QA'd this task; broader Phase 2 (full core page-editor experience/primitives) not yet started or approved.

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

**IN PROGRESS:** Nothing — Phase 2A complete pending manual user QA of the real authenticated route; broader Phase 2 scope not started or approved.

**KNOWN BUGS:**
- None found in Phase 2A itself (0 browser console errors across the full QA pass).
- The Insert Undo Blocker (Puck 0.23.0 corrupting `history[0]` when a controlled `<Puck>`'s `iframe`/`metadata` props are inline object literals) has a confirmed, supported-API-only fix: hoist those props to stable references. Carried into Phase 2A the same way as Phase 1 (`constants.ts`'s `IFRAME_CONFIG`/`VIEWPORTS`, the shell's `useMemo`'d `metadata`) — standing implementation rule (§3), enforced in review, for every future controlled `<Puck>` usage.
- Puck's own `overrides` API is documented by Puck itself as "highly experimental." Phase 2A uses exactly two override keys (`header`, `headerActions`) — the minimum needed for the approved top-bar UX; everything else stays native.
- CSS custom-property overrides meant to affect Puck's canvas-iframe content (ActionBar, selection/drop indicators) must be scoped to `:root`, not a wrapper class — a wrapper-class scope silently fails to reach anything rendered inside the iframe, even with `syncHostStyles: true`. Recorded here as a standing constraint for any future Puck theming work, not just `magnetix-theme.css`.
- Save Draft/Publish are intentionally non-functional (disabled) — Puck Data persistence has not been approved/built yet (§18 of the master spec's migration principles still applies: no persistence change without an explicit future task).

**AWAITING USER TEST:** Manual QA of the REAL authenticated route, now via the obvious card-level button — go to Marketing → Pages & Funnels → click **"Try New Builder"** directly on any page card (no menu needed). Confirm on arrival: the "New Builder Preview" badge is visible in the top bar, the left library reads LAYOUT/ELEMENTS/PREBUILT SECTIONS/BUSINESS (not BASIC/SECTIONS), and dragging/inline-editing work. This session could not drive that route directly (no Firebase Auth credentials available); QA was performed against a fixture-fed harness rendering the identical `MagnetixPuckEditorShell` component, plus static verification that the route/link code actually wires to it — strong evidence, not a substitute for the user seeing the real route with a real page.

**AWAITING USER DECISION:** Approval to begin further Phase 2 work (deeper settings-panel taxonomy, additional prebuilt sections, persistence design) once the real route is manually verified.

**NEXT APPROVED TASK:** None yet. See §23 below once the user authorizes it.

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

*The user may change these later. Do not silently reprioritize — if a future session believes the priority should change, say so and ask, don't just reorder this list.*

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

### LATER
- Synchronized global/universal sections
- A/B testing
- Advanced conditional funnel branching
- Advanced animation systems
- Deep brand/style-guide system
- Deeper commerce/catalog behavior

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
