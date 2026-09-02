# YouTube Content Studio — Magnetix Migration Specification

**This is the source-of-truth document for the YouTube Content Studio migration.**

Future implementation agents (Claude, Codex, or otherwise) must:

1. Read this document before writing any YouTube Content Studio code.
2. Preserve the product exactly as specified here unless the user explicitly changes a decision.
3. Treat every item under **UNRESOLVED DECISIONS** as genuinely open — do not invent an answer to close one.
4. Update **CURRENT STATUS** and **DATA MIGRATION STATUS** after any meaningful phase completes.
5. Not implement any phase without explicit user go-ahead — this document is a specification, not a build authorization.

If this document and the live app, the dossier, or the real export ever disagree after this document was written, treat that as a signal to re-run reconciliation, not to silently pick one.

---

## CURRENT STATUS

**Phase 0** (import architecture + data rescue), **Business Brain** (shared sub-account architecture + its Settings UI), **YTCS Phase 1** (Content nav, module shell, Dashboard, project foundation, Input step for all 6 starting points), **YTCS Phase 2** (Deep Dive + Script Prompt Builder), **YTCS Phase 3A** (Create Video), **YTCS Phase 3B** (Titles + Publish), the **YTCS Final Completion Phase** (full Saved Ideas, full Video Library, YTCS Settings), and **In-App Script Generation** (Generate Script inside Script Prompt Builder) are all **COMPLETE and live in production** at `crm.magnetixstudios.com`. **YouTube Content Studio is now a complete, end-to-end product with in-app AI script generation**: users are no longer required to copy the assembled prompt into an external AI tool — Script Prompt Builder can now generate the script directly (Sonnet 4.6 via the existing OpenRouter client), reviewable/editable, with the original copy-paste prompt workflow preserved as a secondary/power-user option. Only **Content Alchemy Lab** remains future/not built, per instruction. See the Phase 0/Business Brain/Business Brain UI/**YTCS Phase 1**/**YTCS Phase 2**/**YTCS Phase 3A**/**YTCS Phase 3B**/**YTCS Final Completion Phase**/**In-App Script Generation** addenda (after §26) for full details.

## SOURCE MATERIAL

Three source-of-truth inputs were reconciled to produce this document, per the precedence model below.

| # | Source | What it's authoritative for | Location used |
|---|---|---|---|
| 1 | **Live App Audit** — "YouTube Content Studio → Magnetix" (19-section migration audit) | What is visibly/live-functionally present; screen organization; current live behavior; captured templates and checklists; localStorage/export data shape as observed | Prior session, live-tested against `preview-1777763101064776781.vibepreview.com` |
| 2 | **Original ChatGPT Build Handoff** — "YouTube Content Studio Migration Dossier" | Original product decisions; intent not recoverable from the live UI; exact Product Showcase / Signature Offer Video prompt text and methods; rejected decisions; planned-but-unverified features | `~/Downloads/youtube_content_studio_migration_dossier.md` (1,754 lines) |
| 3 | **Real Export All Data JSON** — the owner's actual exported data | Real persisted user data; actual field names; populated vs. unused schema; fields no UI walkthrough reached | `~/Downloads/youtube-studio-backup-2026-09-01.json` (1.9MB — Channel Brain fully populated, 2 real Saved Ideas, 15 real Video Projects across every pipeline stage) |

### Precedence model

- **Actual user data (Source 3)** is authoritative for what is genuinely persisted and for real field names — it is ground truth for the *shape* of the data model.
- **Live App Audit (Source 1)** is authoritative for what currently exists and works on screen.
- **Original Build Handoff (Source 2)** is authoritative for original intent, naming decisions, and features hidden from or not reached by the live audit.

Where sources disagreed, this document does not silently pick a winner — see **§24 Contradiction Resolution** for every case, each labeled as current-behavior-changed-from-intent, unbuilt feature, stale/legacy field, hidden/unreached UI, or a genuinely unresolved contradiction.

## RESOLVED DECISIONS

- Product identity: strategic-context + prompt-assembly + production-checklist + publishing-workflow system — not a one-click AI script generator. (§1)
- Nav placement: `Content › Social Planner, Content Library, YouTube Content Studio, Content Alchemy Lab`, own module, not merged into Content Library. (§2)
- Titles: final product uses **Title Prompt Builder only** — no in-app AI title generator going forward. Real historical in-app-generated titles exist in the export and must be preserved as read-only legacy data, not deleted, not resurrected as an active feature. (§12, §18)
- Script Prompt Builder stays deterministic prompt assembly, never an in-app script writer; regenerating a prompt must never overwrite the Final Script Draft (`compiledScript`). (§9)
- Positioning stays optional, never blocks video creation, and is **not** injected into Script Prompt Builder in this migration. (§17)
- **Channel Brain is now Business Brain** — a shared, sub-account-owned strategic context layer, not YouTube-specific. Canonical path: `subAccounts/{subAccountId}/businessBrain/main`. See the **Business Brain Architecture** section after §26 for the full rationale, service layer, and compatibility strategy.

## UNRESOLVED DECISIONS

Kept genuinely open:

1. Whether to rebuild the partially-designed in-app structured script sub-flow (`hookOptions`, `expectationSetup`, `earlyCtaType`, `generatedOutline`, `dominantPositioning`/`secondaryPositioning`, `topicClarity`) as an active feature, or preserve it as read-only legacy data only. (§20)
2. Whether `communityPost` is a standalone Publish-step field or belongs to a future Content Alchemy Lab / Social Planner integration. (§20)
3. Whether "Balanced" and "Concise" Depth Preference values (asserted only by the dossier) are real, ever-shipped options — **still open after Phase 2**; only "Detailed" is exposed in the UI, since it's the only value ever confirmed by real data or live testing. See the **YTCS Phase 2** addendum.
4. Whether voice-note transcription is genuinely implemented anywhere — **still open after Phase 2**; Phase 2 implements recording/playback/manual-typed-answers only, no automatic transcription, per instruction not to fake infrastructure that doesn't exist.
5. Whether an optional Offer/CTA Context picker exists for non-Product/Offer starting points in Script Prompt Builder — no confirmed real field name was found for this (unlike Story/Framework selection, which have confirmed fields), so Phase 2 does not build one; Offer/CTA context is auto-included only for real Product/Offer projects. See the **YTCS Phase 2** addendum.

**RESOLVED in Phase 2** (previously unresolved item 2, "the exact backend mechanism/prompt behind Deep Dive Questions"): the *mechanism* is still unknown, but the *output* is not — a real-data investigation across all 15 migrated projects found the Generic Deep Dive's 9-question set reproduced identically across 7 independent real/live observations, and a distinct, real 10-question Signature Offer Video set cross-confirmed by two separate real projects. Both are now implemented as fixed sets, no AI call needed. See the **YTCS Phase 2** addendum for the full evidence trail.

## DATA MIGRATION STATUS

**Live migration executed 2026-09-01 against `subAccounts/xvnedVCmQpEvHrcPhEDI` ("Main").** Written: 1 Channel Brain (originally `ytcs/brain`), 2 Saved Ideas (`ytcsIdeas/{id}`), 15 Video Projects (`ytcsVideos/{id}`), 7 voice-note audio files in Firebase Storage under `ytcs/xvnedVCmQpEvHrcPhEDI/voice-notes/{voiceNoteId}.webm` with only Storage references (never inline base64) left on the Firestore records. Full read-back verification against the source export passed. Rerun idempotency proven directly (a second live run produced identical Firestore doc counts and exactly 7 Storage objects, not 14). The original export file (`~/Downloads/youtube-studio-backup-2026-09-01.json`) is unmodified — md5 confirmed identical before and after every run. Full results in the Phase 0 addendum.

**Same day, second migration:** the Channel Brain portion of that data was moved to its new canonical location, `subAccounts/xvnedVCmQpEvHrcPhEDI/businessBrain/main`. Source (`ytcs/brain`) retained, unmutated except additive `deprecated`/`supersededBy` markers. 25 field-level/count/no-duplicate checks passed. Saved Ideas and Video Projects are unaffected — still exactly 2 and 15 respectively, still at their original YTCS-specific paths. Full results in the **Business Brain Architecture** section after §26.

## NEXT APPROVED TASK

None yet. In-App Script Generation is done and live in production — YouTube Content Studio is now complete end to end, including in-app AI script generation, except Content Alchemy Lab, which has no approval and should not start automatically. Open items carried forward: (1) a genuine interactive click-through QA pass is still owed from a real authenticated browser session — Phase 1's UI was since visually verified by the owner in production, but every later phase's UI (Phase 2 through In-App Script Generation) has only been QA'd via direct Firestore/logic testing plus one controlled real AI call (script generation itself), not clicked through live — the module is now ready for the owner's own end-to-end visual QA pass; (2) the Depth Preference and Offer/CTA-for-non-offer-projects questions noted above remain open product decisions, not silently resolved; (3) cost/usage visibility beyond raw token telemetry is explicitly deferred (no credits, no billing, no dollar-cost calculation) — a future pricing/cost-architecture decision, not silently resolved either.

---

# 1. Product Identity

YouTube Content Studio is, in order of what it actually is:

1. A **strategic context system** (Channel Brain) — persistent audience/voice/offer/framework/story/topic/positioning context that every later step draws from.
2. A **project workflow** (Video Workspace's 6-step pipeline) — one video moves through a fixed sequence with gating between steps.
3. A **prompt-assembly system** — Script Prompt Builder and Title Prompt Builder build large, well-engineered, deterministic prompts for an *external* AI tool (ChatGPT/Claude). This is confirmed VERIFIED by the live audit: the generated prompt text mirrors form state character-for-character with zero paraphrasing.
4. A **production checklist system** — Create Video and Publish are built around real, hand-tuned checklists (18+ items in Create Video, 35 items across Publish's three checklists), not AI output.
5. A **YouTube publishing workflow** — Publish assembles upload-ready assets (description, tags, pinned comment) and tracks the video through to "Mark as Published," feeding a Video Library ecosystem view.

It is explicitly **not** "click AI and get a finished script." All three sources agree on this. The dossier states it as an original design decision (§"Script Prompt Builder... Purpose: Build a copy-paste prompt, not generate the full script inside the app"); the live audit independently verified it behaviorally; the real export confirms it structurally (`generatedScriptPrompt` and `compiledScript` are separate fields — the app assembles the prompt, the human pastes the AI's script back in).

**Preserve the external-AI workflow exactly as designed.** Do not add an in-app "write my script" button. Do not restore the in-app title generator (§12).

---

# 2. Final Navigation

```
Content
├─ Social Planner
├─ Content Library
├─ YouTube Content Studio   ← this migration, own module
└─ Content Alchemy Lab      ← future, not this migration
```

Confirmed by live audit: Magnetix's `src/components/dashboard/sidebar.tsx` `SUB_ACCOUNT_NAV_GROUPS` already has a `"Content"` group with `Social Planner` (`/social`) and `Content Library` (`/content`). Add YouTube Content Studio as the third entry, in this position, `enabled: true`. Do not merge into Content Library — different data model, different workflow, explicitly rejected by the user for this migration.

---

# 3. Final Top-Level Screens

## Dashboard

**Purpose:** home base and quick entry point.

**Controls/actions (live-verified):** "Set Up My Channel Brain" → Channel Brain, "Create New Video" → Video Workspace, "Save an Idea" → Saved Ideas.

**Counters (live-verified, all real and computed from the underlying collections, not cached):** Total Saved Ideas, Total Video Projects, Videos In Progress, Published Videos.

**Cross-links:** all three CTAs route into their respective modules.

## Channel Brain

**Purpose:** persistent, shared strategic context. See §4 for full field-level spec.

**States:** Setup Progress (0–100%), section-by-section save. Dossier's expected progress copy ("Your Channel Brain is 42% loaded." / "You don't need 100% to start creating.") is dossier-only — not independently confirmed live or in export; carry forward as the intended copy since nothing contradicts it.

**Top-level controls:** Save Brain, "Open AI Setup Prompts" (consolidated modal, all 8 templates), per-section "Copy setup prompt," per-section "Advanced Details" collapsible (contents not captured this pass — build from whatever fields the section needs beyond its primary ones; do not invent).

## Video Workspace

**Purpose:** the 6-step per-project pipeline. See §6.

**Entry states:** "Start New Video" (opens Starting Point picker) / "Resume Saved Video" (routes into Video Library).

## Saved Ideas

**Purpose:** lightweight idea capture, launchable into a Video Workspace project. See §14.

## Video Library

**Purpose:** project management + ecosystem analytics. See §15.

## Settings

**Purpose:** studio-wide defaults and data tools. See §16.

---

# 4. Channel Brain — Final Field-Level Schema

Real field names below are taken from the export (Source 3, ground truth). Where the export uses a different name than the dossier's conceptual name, the export name is what to build against; the dossier name is noted for traceability. Live-audit setup-prompt behavior is VERIFIED for all 8 sections (full templates in §5).

### 4.1 Creator Vision — singleton (`brain.vision`)

| Real field | Type | Notes |
|---|---|---|
| `statement` | text | Creator Vision Statement / Main Brand Belief |
| `knownFor` | text | What you want your content known for |
| `feelRealize` | text | What people should feel/realize after watching |
| `believe` | text | What you fundamentally believe |
| `against` | text | What you stand against |
| `transformation` | text | The transformation you care about most |
| `different` | text | What makes your POV different |
| `returnTo` | text | What your content should keep returning to |

Downstream consumer: automatically included in Script Prompt Builder ("Creator Vision" auto-included badge).

### 4.2 Audience — singleton (`brain.audience`)

| Real field | Type | Notes |
|---|---|---|
| `help` | text | Who you help |
| `struggling` | text | What they're struggling with |
| `want` | text | What they want instead |
| `understandBeforeTrust` | text | What they need to understand before trusting you |
| `tired` | text | What they're tired of hearing |
| `wrong` | text | What they believe is wrong with them |
| `identity` | text | Identity they're trying to step into |
| `objections` | text | Objections/hesitations |
| `unaware` | text | Awareness Stages: Unaware |
| `problemAware` | text | Awareness Stages: Problem Aware |
| `solutionAware` | text | Awareness Stages: Solution Aware |
| `productAware` | text | Awareness Stages: Product Aware |
| `mostAware` | text | Awareness Stages: Most Aware |

Downstream consumer: auto-included in Script Prompt Builder; drives the "audience" context block in generated prompts.

### 4.3 Offers — repeatable list (`brain.offers[]`)

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Offer Name |
| `price` | text | Free text, e.g. `"$27"` |
| `who` | text | Who it's for |
| `transformation` | text | |
| `problem` | text | What problem this offer solves |
| `when` | text | When to mention it in content |
| `viewerStage` | text | Best-fit viewer stage — real values seen: `"Problem Aware"`, `"Not Sure"`, `""` |
| `link` | text\|null | Offer link |
| `notes` | text | |

**Reconciliation:** dossier proposed `Primary CTA` and `Soft CTA` fields — real export confirms these do **not** exist anywhere in any of the 3 real offers. Confirmed REMOVED, do not restore.

Downstream consumer: Video Workspace's Product/Offer starting point (`productOfferInput.selectedOfferId`/`selectedOfferDetails`); Script Prompt Builder's optional "Offer / CTA Context" picker.

**Future architecture note (2026-09-02, factual only — not acted on):** Business Brain → Offers exists because the original standalone YouTube Content Studio had no access to CRM business data and had to store offer information itself. Now that YTCS lives inside Magnetix, CRM-native business/product/offer data may eventually become the primary source for factual offer information, with Business Brain retaining only strategic/contextual offer framing where useful. This is a documented future direction only — Phase 2 does not redesign, expand, or migrate Offer ownership again; existing Business Brain Offer records and every project's existing offer references are used exactly as they are today.

### 4.4 Frameworks — repeatable list (`brain.frameworks[]`)

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Framework Name |
| `type` | enum | Framework Type — see below |
| `helpDo` | text | What it helps people do |
| `who` | text | Who it's for |
| `steps` | text | Main steps/phases/principles |
| `different` | text | Differentiator |
| `misunderstand` | text | What people misunderstand |
| `transformation` | text | How it creates transformation |
| `when` | text | When to use in content |
| `relatedOffer` | text | free-text, not a real relation id in the export |
| `relatedPillar` | text | **legacy name** — see §24; a Topics-era field |
| `ideas` | text | Example video ideas |
| `notes` | text | |

Framework Type enum (VERIFIED, live audit + dossier agree exactly): Signature Method, Teaching Framework, Content Framework, Client Process, Step-by-Step Method, Decision-Making Framework, Mindset Framework, Offer Framework, Messaging Framework, Visibility Framework, Creative Process, Other.

**Reconciliation:** the legacy singleton `brain.method` (fields: `haveMethod`, `steps`, `different`, `misunderstand`, `helpDo` — all empty in the real export) is the pre-rename "Signature Method" single-record shape. `brain.frameworks[]` is the current, populated, repeatable replacement. Dossier confirms this exact rename ("Deprecated: Signature Method → Frameworks"). **`brain.method` is LEGACY/STALE — do not migrate its (empty) content; migrate `brain.frameworks[]` only.**

### 4.5 Stories + Proof — repeatable list (`brain.stories[]`)

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Story Name |
| `type` | enum | Story Type — see below (real value seen: `"identity"`, lowercase slug) |
| `problem` | text | Problem |
| `pursuit` | text | Pursuit |
| `payoff` | text | Payoff |
| `lesson` | text | Key Lesson |
| `rawTranscript` | text | Raw Story Transcript / Notes |
| `useful` | text | **present but always empty** — see §24 |
| `relatedOffer` | text | **present but always empty** — see §24 |
| `relatedPillar` | text | **present but always empty** — see §24 |

Story Type enum (VERIFIED live audit + dossier): Origin Story, Client Transformation, Personal Lesson, Behind-the-Scenes, Mistake/Lesson, Hot Take, Proof Story, Identity Shift, Other. Real export stores the *slug* form (e.g. `"identity"` for Identity Shift) — build the enum with slug values, display the full labels.

**Reconciliation:** dossier's §"Decisions Rejected" explicitly lists these three fields as removed from the UI ("Where this story could be useful in content," "Related Offer or CTA," "Related Content Pillar"). Real export confirms the underlying keys still exist in storage but are **always empty** — zero real data to lose. **Classification: LEGACY/STALE. Do not rebuild inputs for `useful`/`relatedOffer`/`relatedPillar`; drop them from the new schema.**

Downstream consumer: Script Prompt Builder's "Stories + Proof to Include" multi-select; Video Workspace's Story Bank starting point snapshots these fields onto the video project (`storyId`, `storyName`, `storyProblem`, `storyPursuit`, `storyPayoff`, `storyLesson`, `storyType`).

### 4.6 Brand Voice — singleton (`brain.voice`)

| Real field | Type | Notes |
|---|---|---|
| `sound` | text | How content should sound |
| `wordsOften` | text | Words/phrases used often |
| `wordsAvoid` | text | Words/phrases to avoid |
| `feelLikeYou` | text | What makes the voice feel like "me" |
| `tone` | text | Tone preferences |
| `rules` | text | Style rules |

Downstream consumer: auto-included in every generated Script Prompt; "high priority" per dossier's style rules.

### 4.7 Topics + Subtopics — two repeatable lists (`brain.topics[]`, `brain.subtopics[]`)

Topics:

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Topic Name |
| `means` | text | What this topic means |
| `why` | text | Why it matters |
| `relatedOffer` | text | free text, e.g. `"Magnetic Visibility Circle (Premium)"` |
| `notes` | text | |

Subtopics:

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Subtopic Name |
| `parentTopic` | uuid | FK to a Topic `id` |
| `covers` | text | |
| `questions` | text | Common viewer questions |
| `relatedOffer` | text | |
| `notes` | text | |

**Reconciliation:** `brain.pillars[]` (legacy "Content Pillars," fields `name`/`means`/`belong`/`notBelong`/`connects`/`ideas`/`id`) exists in the real export with **one record whose `id` is byte-identical to `brain.topics[0].id`**, but every field on the `pillars` record is empty while the matching `topics[0]` record ("Identity") is fully populated. This is direct proof of an in-place rename/migration: Content Pillars → Topics, same id carried forward, old key left behind empty. Dossier confirms this exact rename. **`brain.pillars` is LEGACY/STALE — migrate `brain.topics[]`/`brain.subtopics[]` only; do not surface `pillars` in the rebuilt UI, but do not delete the historical id linkage silently — see §21.**

### 4.8 Positioning — singleton + 3 grouped lists (`brain.positioning`)

| Real field | Type | Notes |
|---|---|---|
| `mostUsed` | string[] | slugs, e.g. `"root-cause"` |
| `practiceMore` | string[] | slugs |
| `notFit` | string[] | slugs |
| `notes` | text | free-form positioning notes |

The 12 Positioning Elements™ (slug ↔ full name, VERIFIED live from Settings → Positioning Elements Library, cross-checked against real slugs in the export):

| Slug | Full name | Definition (VERIFIED, live audit) |
|---|---|---|
| `root-cause` | The Root Cause Element™ | Reveals the deeper issue behind the surface-level problem. |
| `unpopular-truth` | The Unpopular Truth Element™ | Says the honest thing my audience needs to hear, even if it challenges common advice. |
| `desire-expansion` | The Desire Expansion Element™ | Helps the viewer want more and see a bigger possibility. |
| `myth-busting` | The Myth-Busting Element™ | Dismantles false beliefs, outdated advice, or confusing industry noise. |
| `elevated-strategy` | The Elevated Strategy Element™ | Shows the deeper strategy behind why something actually works. |
| `belief-shift` | The Belief Shift Element™ | Reframes the internal belief that is blocking action. |
| `simplified-solution` | The Simplified Solution Element™ | Makes the path feel cleaner, simpler, and less overwhelming. |
| `mistake-expose` | The Mistake Exposé Element™ | Reveals the subtle mistake costing the viewer results. |
| `results-pathway` | The Results Pathway Element™ | Shows the sequence, roadmap, or process to get the result. |
| `doing-the-most` | The You're Doing the Most Element™ | Calls out over-efforting, wasted energy, or unnecessary complexity. |
| `behind-the-strategy` | The Behind-the-Strategy Element™ | Reveals the reasoning behind a strategy, decision, or method. |
| `decision-maker` | The Decision-Maker Element™ | Helps the viewer compare options and make an aligned choice. |

Gated behind a "Premium Members" lesson link (VERIFIED live; URL from dossier: `https://portal.quianalache.com/courses/products/9de44cdb-a926-42f5-9e11-bf48b47c7eae/...` — carry forward, not independently re-verified this pass).

**Locked rules (explicit in this task and confirmed by dossier's "Decisions Rejected"):** Positioning is optional. Positioning must never block video creation. Positioning must **not** be injected into Script Prompt Builder in this migration (real export shows `dominantPositioning`/`secondaryPositioning` on some video projects and Positioning Elements referenced inside legacy `generatedTitles` — both are part of the §18/§24 legacy cluster, not the current Script Prompt Builder flow).

---

# 5. Channel Brain Setup Prompts — Verbatim

All 8 are **external-AI setup prompts** (user copies into ChatGPT/Claude to organize messy notes before typing into the form) — **distinct from internal AI calls** (§8 below covers the one confirmed internal call). None of these are rewritten; captured live, byte-for-byte.

### Creator Vision Setup Prompt

> You are helping me organize my Creator Vision for my YouTube Content Studio Channel Brain.
>
> My Creator Vision is the bigger belief behind my content. It is not just a niche, slogan, bio, or content pillar. It is the lens my videos should keep returning to.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize my answers into the exact sections below.
> Do not invent details.
> If something is unclear, write "Needs clarification."
> Keep my language natural and specific.
>
> Organize the output like this:
>
> Creator Vision Statement:
> What I Fundamentally Believe:
> What I Stand Against:
> The Transformation I Care About Most:
> What Makes My Point of View Different:
> What My Content Should Keep Returning To:
>
> Ask me or help me answer these questions:
> 1. What do I believe about my work, my audience, or my industry that shapes everything I create?
> 2. What do I stand against?
> 3. What transformation do I care about most?
> 4. What do I see differently than most people in my space?
> 5. What should someone understand about my worldview after watching several of my videos?
> 6. What do I never want my content to become?

### Audience Setup Prompt

> You are helping me organize my Audience section for my YouTube Content Studio Channel Brain.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize my answers into the exact sections below.
> Do not invent details.
> If something is unclear, write "Needs clarification."
> Keep the language emotionally specific, but not dramatic or generic.
>
> Organize the output like this:
>
> Who I Help:
> What They Are Struggling With Right Now:
> What They Want Instead:
> What They Need to Understand Before They Trust My Work:
> What They Are Tired of Hearing:
> What They Believe Is Wrong With Them:
> The Identity They Are Trying to Step Into:
> Objections or Hesitations Before Working With Me:
>
> Awareness Stages:
> Unaware Stage:
> Problem Aware Stage:
> Solution Aware Stage:
> Product Aware Stage:
> Most Aware Stage:
>
> Ask me or help me answer these questions:
> 1. Who do I help?
> 2. What are they struggling with right now?
> 3. What do they want instead?
> 4. What do they need to understand before they trust my work?
> 5. What are they tired of hearing in my industry?
> 6. What do they secretly believe is wrong with them?
> 7. What identity are they trying to step into?
> 8. What objections or hesitations do they have before working with me?
> 9. Before they know they have the problem, what are they experiencing?
> 10. Once they know the problem, what are they searching for?
> 11. What solutions have they already tried or considered?
> 12. What do they need to understand before they consider my offer?
> 13. What do they already believe or trust when they are most ready to buy?

### Offers Setup Prompt

> You are helping me organize the Offers section for my YouTube Content Studio Channel Brain.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize each offer into the exact structure below.
> Do not invent offer details.
> If something is unclear, write "Needs clarification."
> Keep the CTA language natural, clear, and non-pushy.
>
> For each offer, organize the output like this:
>
> Offer Name:
> Price:
> Who It's For:
> Transformation:
> What Problem This Offer Solves:
> When This Offer Should Be Mentioned In Content:
> Best-Fit Viewer Stage:
> Offer Link:
> Notes:
>
> Ask me or help me answer these questions:
> 1. What is the name of the offer?
> 2. What is the price, if you want to include it?
> 3. Who is this offer for?
> 4. What does it help them do, become, create, or understand?
> 5. What problem does this offer solve?
> 6. When does it make sense to mention this offer in a video?
> 7. What type of viewer is most ready for this offer?
> 8. What awareness stage does this offer best fit?
> 9. Is there a link people should go to for this offer?
> 10. Anything else the studio should know about this offer?

### Frameworks Setup Prompt

> You are helping me organize the Frameworks section for my YouTube Content Studio Channel Brain.
>
> Frameworks can include my signature method, teaching frameworks, content formulas, client processes, mindset frameworks, visibility frameworks, messaging frameworks, offer frameworks, creative processes, or any repeatable way I explain transformation.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize each framework into the exact structure below.
> Do not invent steps or frameworks.
> If something is unclear, write "Needs clarification."
> Keep the wording clear, specific, and connected to how I actually help people.
>
> Framework Type options:
> Signature Method
> Teaching Framework
> Content Framework
> Client Process
> Step-by-Step Method
> Decision-Making Framework
> Mindset Framework
> Offer Framework
> Messaging Framework
> Visibility Framework
> Creative Process
> Other
>
> For each framework, organize the output like this:
>
> Framework Name:
> Framework Type:
> What This Framework Helps People Do:
> Who This Framework Is For:
> Main Steps, Phases, or Principles:
> What Makes This Framework Different:
> What People Misunderstand About This Topic:
> How This Framework Creates the Transformation:
> When This Framework Should Be Used In Content:
> Related Offer:
> Related Content Pillar:
> Example Video Ideas From This Framework:
> Notes:
>
> Ask me or help me answer these questions:
>
> 1. Do I have a named signature method, framework, formula, process, or philosophy?
> 2. Are there smaller frameworks I teach often?
> 3. What does each framework help people do?
> 4. Who is each framework for?
> 5. What are the steps, phases, or principles?
> 6. What makes this framework different from common advice?
> 7. What do people misunderstand about this topic?
> 8. How does this framework create transformation?
> 9. When would it make sense to mention or teach this framework in a video?
> 10. What offer or content pillar does it connect to?
> 11. What video ideas could come from this framework?
>
> If I'm not sure what type a framework is, recommend the best-fit Framework Type and explain why.

### Stories + Proof Setup Prompt

> You are helping me organize a story for the Stories + Proof section of my YouTube Content Studio Channel Brain.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize the story into the exact sections below.
> Use the Problem → Pursuit → Payoff structure.
> Do not invent details.
> If something is unclear, write "Needs clarification."
> Keep my natural voice and preserve the emotional truth of the story.
>
> Story Type options:
> Origin Story
> Client Transformation
> Personal Lesson
> Behind-the-Scenes
> Mistake / Lesson
> Hot Take
> Proof Story
> Identity Shift
> Other
>
> Organize the output like this:
>
> Story Name:
> Story Type:
> Problem:
> Pursuit:
> Payoff:
> Key Lesson:
> Raw Story Transcript / Notes Summary:
>
> Possible Topic:
> Possible Subtopic:
> Possible Positioning Elements:
> Possible Video Directions:
> Possible Viewer Shift:
>
> Do not lock this story into one use case. A story can be reused in multiple videos depending on the topic, positioning element, and viewer shift.
>
> Ask me or help me answer these questions:
> 1. What happened?
> 2. What was the problem, tension, or struggle before the shift?
> 3. What did I do, decide, try, realize, or change?
> 4. What changed because of it?
> 5. What lesson should the viewer take away?
> 6. What type of story is this?

### Brand Voice Setup Prompt

> You are helping me organize the Brand Voice section for my YouTube Content Studio Channel Brain.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize my brand voice into the exact sections below.
> Do not make me sound generic.
> Do not over-polish my language.
> Preserve my natural phrasing, energy, and point of view.
> If something is unclear, write "Needs clarification."
>
> Organize the output like this:
>
> How My Content Should Sound:
> Words or Phrases I Use Often:
> Words or Phrases to Avoid:
> What Makes My Voice Feel Like Me:
> Tone Preferences:
> Style Rules:
> Examples of Lines That Sound Like Me:
> Examples of Lines That Do NOT Sound Like Me:
>
> Ask me or help me answer these questions:
> 1. How should my content sound?
> 2. What words or phrases do I naturally use?
> 3. What words, phrases, or styles do I hate?
> 4. What makes my voice feel like me?
> 5. Should my tone be direct, playful, educational, intimate, bold, spiritual, strategic, or something else?
> 6. What writing or speaking rules should the studio follow?
> 7. What does generic AI content sound like in my world?
> 8. What should the studio never do to my voice?

### Topics + Subtopics Setup Prompt

> You are helping me organize the Topics + Subtopics section for my YouTube Content Studio Channel Brain.
>
> Topics are the bigger lanes my channel returns to.
> Subtopics are the smaller themes that live inside each topic.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Your job:
> Extract and organize my channel topics and subtopics into the exact structure below.
> Do not invent topics that are not supported by what I say.
> If something is unclear, write "Needs clarification."
> Keep the topics practical, clear, and useful for organizing YouTube videos.
>
> Organize the output like this:
>
> Topics:
>
> Topic Name:
> What This Topic Means:
> Why This Topic Matters To My Channel:
> Related Offer:
> Notes:
>
> Subtopics:
>
> Subtopic Name:
> Parent Topic:
> What This Subtopic Covers:
> Common Viewer Questions:
> Related Offer:
> Notes:
>
> Ask me or help me answer these questions:
>
> 1. What are the main topics my channel naturally returns to?
> 2. What do I want to be known for teaching, modeling, or talking about?
> 3. What smaller themes live inside each topic?
> 4. What questions does my audience ask around each subtopic?
> 5. Which topics are most connected to my offers?
> 6. Which topics are more about connection, trust, lifestyle, or personality?
> 7. Which topics have I already created videos about?
> 8. Which topics do I want to create more videos about?

### Positioning Preferences Setup Prompt

> You are helping me organize the Positioning Preferences section for my YouTube Content Studio Channel Brain.
>
> Positioning Elements are strategic lenses that shape how a topic is presented, explained, framed, titled, taught, scripted, and connected to a CTA.
>
> If I already understand the Positioning Elements, help me identify which ones naturally fit my content.
>
> If I do not understand them yet, ask me simpler questions about how I naturally teach, frame ideas, and lead my audience. Then recommend possible Positioning Elements based on my answers, but clearly label them as recommendations.
>
> Do not force every element.
> Do not make random recommendations.
> Do not assume I understand the full framework.
> Do not invent preferences I did not express.
> If something is unclear, write "Needs clarification."
>
> The 12 Positioning Elements are:
>
> 1. Root Cause: Reveals the deeper issue behind the surface-level problem.
> 2. Unpopular Truth: Says the honest thing my audience needs to hear, even if it challenges common advice.
> 3. Desire Expansion: Helps the viewer want more and see a bigger possibility.
> 4. Myth-Busting: Dismantles false beliefs, outdated advice, or confusing industry noise.
> 5. Elevated Strategy: Shows the deeper strategy behind why something actually works.
> 6. Belief Shift: Reframes the internal belief that is blocking action.
> 7. Simplified Solution: Makes the path feel cleaner, simpler, and less overwhelming.
> 8. Mistake Exposé: Reveals the subtle mistake costing the viewer results.
> 9. Results Pathway: Shows the sequence, roadmap, or process to get the result.
> 10. You're Doing the Most: Calls out over-efforting, wasted energy, or unnecessary complexity.
> 11. Behind-the-Strategy: Reveals the reasoning behind a strategy, decision, or method.
> 12. Decision-Maker: Helps the viewer compare options and make an aligned choice.
>
> You can either ask me the questions one at a time, or I may paste a messy voice-note transcript below.
>
> Ask me or help me answer these questions:
>
> 1. When I create content, do I naturally reveal root causes, challenge myths, simplify things, expose mistakes, tell stories, teach strategy, or help people make decisions?
> 2. Which types of videos feel easiest for me to create?
> 3. Which types of videos feel powerful but underused?
> 4. Which types of videos do not feel like my voice?
> 5. Do I prefer bold truths, deep teaching, simple steps, emotional identity shifts, strategic breakdowns, or story-led content?
> 6. What kinds of videos do I want to become known for?
> 7. What kind of framing feels most aligned with my audience?
> 8. What kind of framing feels most aligned with my offers?
> 9. Where do I tend to lose people when I teach?
> 10. Where do I feel strongest when explaining my work?
>
> Organize the output like this:
>
> My Most-Used Positioning Elements:
> Positioning Elements I Want to Practice Using More:
> Positioning Elements That Do NOT Fit My Voice:
> Recommended Positioning Elements Based on My Answers:
> Notes About How I Like to Position My Content:
> Examples of Video Topics + Best-Fit Positioning Elements:
> Needs Clarification:

---

# 6. Video Workspace

Final step order (all 3 sources agree exactly): **Input → Deep Dive → Script Prompt Builder → Create Video → Titles → Publish.**

## Gating (VERIFIED live)

- Titles is locked until `compiledScript` (Final Script Draft) has real content. Guard message (VERIFIED verbatim): *"Add your final script first so the title prompt can be based on the actual video… not a vague idea wearing a blazer."* With a "Go to Script Prompt Builder" link back.
- No other step-to-step gate was found live-tested this pass (Input → Deep Dive → Script Prompt Builder → Create Video all advanced freely with a "Continue to X" button).

## Backward compatibility for older projects

Real export evidence: `scriptOutputType` and `depthPreference` are `None`/unset on several older video records — the app must treat a missing value as "inherit the current Settings default at render time," not crash or show blank. `createVideoStatus` is unset (`None`) on several records too — default should render as an empty/unset state, not force "Ready to Record."

## Voice-note behavior (VERIFIED live via real recordings in the export)

Real, populated voice-note fields on Video Projects: `brainDumpVoiceNotes`, `scriptBuilderVoiceNotes`, `productOfferDeepDiveVoiceNotes` — each an array of `{ id, audioBase64 }` objects, audio stored as inline `data:audio/webm;base64,...` — **no transcription text was found attached to any of the 7 real recordings across the export.** This means: voice-note *recording and storage* is CONFIRMED ACTIVE; voice-note *transcription* is UNVERIFIED — the dossier describes transcription behavior ("Voice note transcription:" label, "append not overwrite") but the real export shows only raw audio, never a resulting transcript merged into a text field. Treat transcription as a documented **intended** behavior, not a confirmed-working one. Full spec in §19.

**Critical technical flag:** storing raw base64 audio inline inside the record (rather than a separate blob reference) is workable in `localStorage`/a JSON export but is a **hard blocker for storing voice notes as fields on a Firestore document** — Firestore has a 1MB per-document limit and inline base64 audio can exceed that alone. Voice notes must migrate to Firebase Storage with the Firestore field holding a reference/URL, not inline audio. See §21.

---

# 7. Starting Points

Six starting points (all 3 sources agree): **Brain Dump, Coaching Call / Client Conversation, Short-Form Post, Story Bank, Framework, Product / Offer.**

Real `startingPointType` values in the export (ground truth): `brain_dump`, `conversation`, `framework`, `productOffer`, `story`. `short_form` did not appear in any of the 15 real projects but the field `shortFormType` (real value seen: `"reel"`) exists in the schema — confirms Short-Form Post is a real, built starting point, just not sampled in this export.

| Starting point | Connects to Channel Brain via | Real snapshot fields on the video project |
|---|---|---|
| Brain Dump | none (raw input only) | `rawTranscript`, `selectedInputQuestion` (one of the 7 canned prompt questions, VERIFIED live) |
| Coaching Call / Client Conversation | none (raw input only) | `rawTranscript` (real `startingPointType: "conversation"`) |
| Short-Form Post | none | `shortFormType` (e.g. `"reel"`) |
| Story Bank | `brain.stories[]` | `storyId`, `storyName`, `storyProblem`, `storyPursuit`, `storyPayoff`, `storyLesson`, `storyType` — full story snapshotted onto the project at selection time |
| Framework | `brain.frameworks[]` | `framework` (full object snapshot), `frameworkId` |
| Product / Offer | `brain.offers[]` | `productOfferInput: { selectedOfferId, selectedOfferName, selectedOfferDetails, productOfferVideoFormat }` — nested object, **not** flat top-level fields as the dossier's conceptual data model proposed |

## Product / Offer formats

Two formats, both VERIFIED via dossier's exact captured prompt openings and methods (not independently re-verified live this pass — dossier is the authoritative capture here, and it's explicit that these are "EXACT / FINAL APPROVED"):

- **Product Showcase** — teaches and builds need before showing the product. 15-step method (verbatim from dossier, §"Product Showcase method"): (1) Relatable viewer struggle hook, (2) Remove shame or pressure, (3) Name the hidden missing piece, (4) Teach the framework or concept before showing the product, (5) Challenge the old model or common advice, (6) Establish creator credibility, (7) Introduce the product as the natural solution, (8) Show what is inside, (9) Connect each product feature to viewer value, (10) Use proof where available, (11) Restate the transformation, (12) Address hesitation naturally, (13) Make the CTA clear, (14) Optional secondary next step, (15) YouTube-friendly close.
- **Signature Offer Video** — the offer is substance, not a 30-second tack-on. 14-step method (verbatim from dossier, §"Signature Offer Video method"): (1) Relatable tension or exhaustion hook, (2) Simple thesis or core mechanism, (3) Problem layering, (4) Reframe the real issue, (5) Lived authority or founder credibility, (6) Proof layering throughout the video, (7) Teach the new model or better way, (8) Explain why the new model works, (9) Introduce the offer as the implementation path, (10) Explain the offer clearly, (11) Address objections naturally, (12) Who this is for/not for, only if natural, (13) Relational CTA, (14) YouTube-friendly close.

Prompt openings for both are reproduced verbatim in §9.

## Fallback for older projects missing format

Real export: 6 real `productOffer` projects, all with `productOfferInput.selectedOfferId` populated, but only some have `productOfferVideoFormat` set (`"signatureOfferVideo"` confirmed present on at least one). Where `productOfferVideoFormat` is missing on an older project, the rebuilt app must prompt the user to choose a format before proceeding to Deep Dive/Script Prompt Builder — do not silently default to one format, since Product Showcase and Signature Offer Video produce structurally different prompts.

---

# 8. Deep Dive

## A. Generic Deep Dive

Trigger: "Generate Deep Dive Questions" button (VERIFIED live — a real AI call; output was genuinely tailored to the test input, not boilerplate).

**The exact original AI prompt is NOT preserved by any of the three sources.** Do not fabricate a historical prompt. Document instead:

- **Expected inputs/context:** the project's raw source material (`rawTranscript` or equivalent per starting point), Channel Brain Audience + Brand Voice + Creator Vision, and — per the dossier's stated intent — should factor in whatever starting-point-specific context exists (story snapshot, framework snapshot, etc.), though this was not independently confirmed live.
- **Expected output format (VERIFIED live):** approximately 9 open-ended strategic questions, written in second person, specific to the input's actual content (confirmed by testing: a test input about content-to-sales conversion produced questions like "What is the viewer's real problem underneath the surface symptom?" — not generic filler).
- **Required quality behavior:** questions should surface "the real video inside the raw idea" (live-verified UI copy) — i.e., push past the surface topic toward belief, tension, and CTA placement.
- **Channel Brain inputs:** Audience + Brand Voice, at minimum (both auto-included elsewhere in the product; reasonable to assume Deep Dive follows the same pattern, but this is INFERRED, not verified for this specific action).
- **Video Project inputs:** the raw source material for the chosen starting point.
- **Brand Voice requirement:** should shape question phrasing, per the product's stated Brand Voice priority (dossier: "Brand Voice is high priority" for script rules generally).
- **Likely implementation:** Magnetix's existing OpenRouter client (`src/lib/comms/ai/openrouter.ts`) — a single `aiChatCompletion`-style call with a system prompt built from the inputs above.

**Label the future internal prompt explicitly as: `TO BE RECONSTRUCTED FROM DOCUMENTED BEHAVIOR` — not a ported exact prompt.** This is an open implementation task, not a migration task.

Real export confirms the output shape: `generatedDeepDiveQuestions` is a flat array of 9 question strings; `deepDiveAnswers` is a single free-text field the user fills in (not per-question structured answers) — so the UI is "read the questions, then write one combined answer block," not "answer each question in its own box." This matches the live audit's captured UI (questions rendered as a numbered list, each with an inline "Record Voice Note," then one shared textarea below: "Paste your Deep Dive answers or transcript here").

## B. Product / Offer Deep Dive

Separate from generic Deep Dive — dynamic by selected format (Product Showcase vs. Signature Offer Video), per dossier and confirmed structurally by the real export's separate `productOfferDeepDiveAnswers` field.

**The exact question sets were not captured verbatim by any of the three sources this pass** — the dossier describes the *existence* of dynamic Product/Offer Deep Dive questions but does not reproduce the literal question text for either format, and the live audit never exercised the Product/Offer starting point. The real export's `productOfferDeepDiveAnswers` field contains only the *user's answers* prefixed with the literal question text for two real projects — this is real, partial evidence, reproduced verbatim below since it is genuine captured data, not a fabrication:

> From `productOfferDeepDiveAnswers` on one real project (Signature Offer Video):
> "Question 9: Who is this product best for, and who is it not for?
> Voice note transcription:
> this product is best for whoever wants it"

> From another real project:
> "Question 5: What belief needs to shift before this offer makes sense?
> Voice note transcription:
> the shift that knee or the belief that needs to shift before this offer makes sense is that YouTube is not just a social media platform..."

This confirms at least a Question 5 and a Question 9 exist for at least one of the two formats, and that voice-note transcription **was** working at some point for this specific field (contradicting the general voice-note transcription uncertainty noted in §6 — worth resolving directly with the owner, since this is the one piece of real evidence transcription ever ran end-to-end anywhere in the product).

**Do not fabricate the full Product/Offer Deep Dive question sets.** Flag as `NEEDS OWNER INPUT — ORIGINAL QUESTION SETS NOT RECOVERED` and request them directly from the owner (she may still have the original ChatGPT build conversation open, or the live app itself can be walked through the Product/Offer starting point in a follow-up audit pass).

## Fields (real, confirmed)

- `productOfferDeepDiveAnswers` — free text, format above.
- `productOfferInput.productOfferVideoFormat` — `"signatureOfferVideo"` or (inferred) `"productShowcase"`; see §7 fallback behavior for missing values.
- `productOfferDeepDiveVoiceNotes` — array of `{id, audioBase64}`, same shape as other voice-note fields.

---

# 9. Script Prompt Builder

Preserved exactly as **deterministic prompt assembly** — confirmed VERIFIED, not an in-app script writer, by all three sources independently.

## Script Ingredients (VERIFIED live)

- **Automatically Included** (no user action): Audience, Brand Voice, Creator Vision.
- **Offer / CTA Context** — optional single-offer picker from `brain.offers[]`.
- **Stories + Proof to Include** — multi-select from `brain.stories[]`, shown as visual cards (dossier: "not plain dropdowns," "collapsible by default"). Dossier recommends a soft max of 3 selections.
- **Frameworks to Include** — multi-select from `brain.frameworks[]`, same card treatment. Dossier recommends a soft max of 2.
- **Extra Script Notes** — free text + voice note, "high-priority creator direction" per dossier.
- **Source material** — the starting-point-specific raw input, always included.
- **Deep Dive answers** — `deepDiveAnswers`, always included when present.

## Script Output Settings

See §10 for the full enum spec.

## The exact template — verbatim (VERIFIED live, matches dossier's independently-reconstructed opening and method outline word-for-word — see §24 for the reconciliation note)

> You are helping me create a strong YouTube script draft.
>
> Use the video context I provide below to create a natural, on-camera YouTube script.
>
> This should feel like a real video, not a blog post, essay, or generic content outline.
>
> Use the source material, Deep Dive answers, Channel Brain context, selected stories/proof, selected frameworks, offer context if provided, and extra script notes to shape the video.
>
> The script should be useful, specific, conversational, and aligned with the creator's voice.
>
> Do not invent unsupported details.
> Do not write generic advice.
> Do not over-polish the creator's voice.
> Do not flatten the creator's personality.
> Do not turn this into a blog post.
> Do not use bracketed placeholders like [insert story here].
> If something important is missing, write "Needs more detail" and tell me exactly what is missing.
>
> SCRIPT OUTPUT TYPE:
> {scriptOutputType}
>
> DEPTH PREFERENCE:
> {depthPreference}
>
> {depth-preference-specific instruction — e.g. for Detailed: "Err on the side of giving me more depth, language, examples, transitions, and usable phrasing than less. I can condense a rich draft later. Do not give me thin content unless I specifically selected Talking Point Outline."}
> Create a structured recording draft with clear sections, strong phrasing, key talking points, suggested lines, and recording notes. It should support natural delivery without feeling like a rigid teleprompter script.
>
> SOURCE MATERIAL
>
> Starting Point: {startingPointType label}
>
> Raw Input / Transcript / Notes:
> {rawTranscript or equivalent}
>
> HOW TO USE THIS CONTEXT
>
> Use the Source Material as the raw material for the video.
> Do not ignore it.
> Do not replace it with generic advice.
> Use it to identify:
> The core idea
> The strongest tension
> The most useful teaching points
> The natural story or proof moments
> The main viewer shift
> The most relevant examples
>
> If the Source Material is messy, organize it.
> If the Source Material is too thin, write "Needs more detail" and explain what is missing.
>
> Because this is a regular YouTube video, use the context to create a strong teaching, storytelling, belief-shifting, or authority-building video.
> Use Audience context to make the hook and teaching feel specific.
> Use Deep Dive answers to find the real video underneath the raw idea.
> Use Brand Voice to make the script sound like the creator.
> Use selected Stories + Proof to make the video more credible and memorable.
> Use selected Frameworks to organize the teaching when helpful.
> Use Offer / CTA Context only if it was selected.
> If an offer was selected, weave it in naturally.
> Do not make a normal YouTube video feel like a heavy sales video unless the project type calls for it.
>
> YOUTUBE SCRIPT METHOD
>
> Use this structure to build the video:
>
> 1. Hook Options
>
> Create 3 hook options that match the actual video context.
>
> The hook should create immediate recognition, curiosity, tension, relief, or desire.
>
> Avoid generic hooks.
>
> 2. Recommended Hook
>
> Choose the strongest hook and briefly explain why it fits the viewer, topic, and video goal.
>
> 3. Anchor & Expectation Setup
>
> After the hook, ground the viewer.
>
> Clarify what this video is really about, why it matters, and what the viewer will understand by the end.
>
> Do not over-explain.
>
> Do not make this sound like a school essay introduction.
>
> 4. Early Light CTA, only if natural
>
> If an offer or next step is provided, include a light early CTA only if it fits naturally.
>
> This should not interrupt the video.
>
> It can be soft and conversational.
>
> If no offer or CTA context exists, skip this.
>
> 5. Deep Dive / Teaching Body
>
> Build the main body around 2 to 4 strong points.
>
> For each point, include:
>
> Point title
> Viewer tension
> Creator point of view
> Teaching notes
> Story, proof, or framework integration if selected
> Viewer shift
> Momentum transition to the next point
>
> The body should not feel like random tips.
>
> Each point should move the viewer toward a clearer belief, decision, or understanding.
>
> 6. Main CTA
>
> If an offer or next step was provided, create a clear CTA that feels connected to the video.
>
> The CTA should feel like the natural next step, not a random pitch.
>
> If no offer or CTA was provided, create a general engagement CTA or write "Needs CTA detail" if a specific CTA is clearly needed.
>
> 7. Watch This Next Setup
>
> Include a YouTube-native watch-next bridge if it fits.
>
> The watch-next bridge should make the viewer want to continue watching another related video.
>
> It should not feel like an abrupt ending.
>
> 8. Final Draft
>
> Create the final draft based on the selected Script Output Type and Depth Preference.
>
> 9. Recording Notes
>
> Add notes for delivery, pacing, emphasis, energy, examples, and places where the creator should slow down or let a point breathe.
>
> MOMENTUM TRANSITIONS
>
> Between each major section, include momentum transitions.
>
> Momentum transitions are the small re-hooks between sections.
>
> They should:
>
> Connect what came before to what comes next
> Remind the viewer why the next section matters
> Create curiosity for what comes next
> Keep the video from feeling like disconnected points
> Help the viewer stay oriented and emotionally engaged
>
> Momentum transitions should move the viewer between teaching points, story moments, belief shifts, and the CTA.
>
> Avoid transition phrases like:
>
> Now that you understand everything…
> So that's it…
> Now you know everything you need…
>
> Use transitions that move the viewer forward.
>
> RETURN STRUCTURE
>
> 1. Hook Options
>
> Generate 3 hook options.
>
> Each hook should create immediate recognition, tension, curiosity, relief, or desire.
>
> 2. Recommended Hook
>
> Choose the strongest hook and explain why it fits this viewer, video, and goal.
>
> 3. Strategic Video Flow
>
> Give the full section-by-section outline before writing the draft.
>
> For each section, include:
>
> Section Title
> Purpose of This Section
> Key Point
> Story, Proof, or Framework to Use, if available
> Offer Connection, if relevant
> Momentum Transition
>
> 4. CTA Plan
>
> If offer or CTA context exists, explain how the CTA should show up and why it belongs there. If no CTA context exists, suggest the most natural CTA type based on the video.
>
> 5. Proof Integration Plan
>
> If stories or proof were selected, identify where they should appear throughout the video. Use only provided proof. If proof is missing but the video would benefit from proof, name what type of proof would help.
>
> 6. Final Draft
>
> Create the final draft based on the selected Script Output Type and Depth Preference.
>
> 7. Recording Notes
>
> Add notes for delivery, pacing, emphasis, examples, screen share moments if relevant, and places where the creator should slow down, add energy, or let a point breathe.
>
> STYLE RULES
>
> Do not write generic advice.
> Do not invent proof, results, numbers, testimonials, revenue, client stories, screenshots, or claims.
> Do not use bracketed placeholders like [insert story here].
> Do not over-polish the creator's voice.
> Do not flatten the creator's personality.
> Do not turn this into a blog post.
> Do not make every section sound like a formal section heading when spoken aloud.
> Use the Brand Voice context if available.
> Make the script conversational, clear, emotionally specific, and useful.
> Make the script feel like it belongs on YouTube.
> Make the CTA feel connected to the video.
> If something important is missing, write "Needs more detail" and explain exactly what is missing.

This is the **regular YouTube video** prompt. The dossier additionally specifies exact, separately-approved prompt openings for the two Product/Offer formats — reproduced verbatim:

**Product Showcase opening:**

> You are helping me create a YouTube-native Product Showcase Video.
>
> This is not a generic product demo.
>
> This is not just a screen recording of what is inside the product.
>
> The goal is to create a useful YouTube video that teaches, shifts a belief, builds the need for the product, and then shows how the product helps.
>
> The viewer should understand the problem before the product appears.
>
> The product should feel like the natural solution to the tension, frustration, or desire introduced earlier in the video.
>
> This video should feel conversational, specific, human, and valuable even before the product is shown.

**Signature Offer Video opening:**

> You are helping me create a YouTube-native Signature Offer Video.
>
> This is not a standard teaching video with a quick CTA at the end.
>
> The goal is to create a video that teaches, builds trust, layers the viewer's real problems, shifts the viewer's beliefs, explains why the offer exists, uses proof throughout, and makes the offer feel like the natural next step.
>
> This video should still feel like useful YouTube content. It should feel human, conversational, emotionally specific, and valuable even before the offer is introduced.
>
> But it should also spend more time on the offer than a normal YouTube video would.
>
> The offer should not be saved for the last 30 seconds. The offer should become part of the substance of the video once the viewer understands the problem, the belief shift, and the better way forward.

Both formats then follow their own method (§7) in place of the regular video's "YouTube Script Method" section, but share the same "How To Use This Context," "Momentum Transitions," "Return Structure," and "Style Rules" scaffolding — per dossier §"Script Prompt generation logic": *"Must be fully resolved. Final generated prompts should not contain cross-format logic such as 'For Product Showcase videos…' inside a Signature Offer prompt."*

## Generated Script Prompt vs. Final Script Draft

Real field names (ground truth): `generatedScriptPrompt` (the assembled prompt) vs. `compiledScript` (the pasted-back finished script — this is the real field name for what the dossier and live-audit UI both call "Final Script Draft" / "Save Final Script"). **These are separate fields. Regenerating the prompt must overwrite only `generatedScriptPrompt`, never `compiledScript`.** This is both an explicit dossier requirement and independently sensible given the real export shows `compiledScript` holding genuinely irreplaceable content (one real record's `compiledScript` is a verbatim recording transcript, not a rewrite of the generated prompt).

## Regeneration behavior on old projects

Dossier: clicking Generate Script Prompt on an old project should use the newest prompt logic and replace the old `generatedScriptPrompt`, but this should happen only on explicit user action — never silently in the background — and must never touch `compiledScript`. No live-tested confirmation UX was observed or described in enough detail to specify exact copy; build a simple confirmation ("Regenerating will replace your current Script Prompt. Your Final Script Draft won't be touched.") rather than inventing more.

---

# 10. Script Settings

**Script Output Type** (VERIFIED — all 4 real values confirmed present in the export, though the live audit only ever observed "Structured Recording Draft" on screen):

- Full Script
- Structured Recording Draft
- Talking Point Outline
- Hybrid Script + Talking Points

Default: **Structured Recording Draft**.

**Depth Preference:**

- Detailed — CONFIRMED (only value ever seen in the real export; also the only one live-tested).
- Balanced — dossier-only, not confirmed by live audit or real data. **INFERRED, not VERIFIED.**
- Concise — dossier-only, not confirmed. **INFERRED, not VERIFIED.**

Default: **Detailed**.

`defaultScriptOutputType` / `defaultDepthPreference` live in Settings (VERIFIED live: "Default Script Settings" section). New projects inherit these at creation time; existing projects keep their own project-level `scriptOutputType`/`depthPreference` — confirmed necessary by real export evidence (older projects have these fields `null`, meaning "inherit current default at render time," not "locked to whatever the default was on the day they were created").

---

# 11. Create Video

**Recording Checklist** (VERIFIED live, verbatim, 9 items):
Review your script or recording draft · Make sure your background is distraction-free · Record your hook · Record the main teaching/body section · Record your CTA · Record your Watch Next bridge if using one · Check lighting · Check audio · Check camera framing.

**Editing Checklist** (VERIFIED live, verbatim, 9 items):
Import your footage · Arrange clips in order · Remove long pauses · Clean up obvious mistakes · Add simple zooms or emphasis moments if desired · Add captions if desired · Check audio levels · Color grade or adjust the video look if needed · Export the final video.

**Recording Notes / Editing Notes** — free text fields, VERIFIED live.

**Status** — real field `createVideoStatus`. Only "Ready to Record" was ever observed live or found populated in the real export. Per this migration's explicit instruction, the final enum is:

- Ready to Record
- Editing
- Ready for Titles

"Editing" and "Ready for Titles" are not independently confirmed by the live audit or the real export — build them as specified here since this is a direct instruction for this migration, but flag internally that only the first value has real precedent.

**Edits Lab resource card** (VERIFIED live + dossier): a gated "Premium Resource" cross-sell, not part of this tool's core function. URL (dossier): `https://quianalache.com/the-edits-lab`.

**Removed, not future requirements** (dossier's "Decisions Rejected," confirmed by zero real data): nothing was found removed specifically from Create Video beyond what's already excluded above — Create Video is the one screen where dossier, live audit, and real export are in full agreement with no orphan fields.

---

# 12. Titles

**Locked decision (this migration's instruction, corroborated by dossier's own "Decisions Rejected" list — "Do not keep old in-app title generation sections"): the final product does not use an in-app AI title generator. The feature is the Title Prompt Builder.**

Spec (VERIFIED live + dossier agreement):

- Primary source: Final Script Draft (`compiledScript`).
- Context: Audience, Brand Voice.
- Missing-script guard (VERIFIED verbatim): *"Add your final script first so the title prompt can be based on the actual video… not a vague idea wearing a blazer."*
- Generate Title Prompt → Generated Title Prompt → Copy Title Prompt → Save Title Prompt to Project.
- Your Chosen Title: Selected Title + Backup Title, both with live character counts (VERIFIED live).
- Notes field.
- Continue to Publish.

**Preserved title-generation instructions to build the future template from** (dossier, §"Title Prompt Builder" — these are requirements for the prompt's content, not a literal captured template; **do not invent a missing exact final template, build from these requirements**):

- Ask for 10 title options.
- Mix of title types: Benefit-Focused, Question-Based, Controversial/Bold, How-To/Tutorial, Authority/Expertise, Curiosity/Viral, Emotional/Story, Search-Driven, Positioning-Led, Trend-Jacking only if appropriate.
- At least 2 SEO/search-friendly titles when supported by the script.
- For each: Title Type, Title, Character Count.
- Top 3 labeled "Top Pick" with explanation.
- 3 thumbnail text ideas from the strongest title options.
- Rules: no generic titles, no repeats, no invented results/numbers/timelines/years/claims, no outdated years, no placeholders, no vague titles.

**Mark REMOVED/LEGACY (per this migration's instruction — confirmed by real data, see §18):** Generate 12 Title Options, Top Picks, More Options, Legacy In-App Generated Titles, Thumbnail Curiosity Angle. Real fields `generatedTitles`/`top3Titles` contain actual historical output matching this exact legacy shape (title/type/primaryElement/characterCount/reason/thumbnailAngle, tied to Positioning Elements) in 2 of 15 real projects — **this is real user data and must be preserved read-only per §18/§21, not deleted, but not resurrected as an active generator.**

---

# 13. Publish

**Publish Assets** (VERIFIED live): Final Title, YouTube Description (with "Copy Description," CTA-first default template — captured verbatim below), Tags/Keywords, Pinned Comment, Upload Notes, YouTube Link, Publish Date.

Default YouTube Description template (VERIFIED, captured from a real export record):

> [PRIMARY CTA LINK FIRST]
> Add the most important next step here. This should usually be your offer, lead magnet, community, booking link, or resource mentioned in the video.
>
> Helpful links:
> [Relevant link]
> [Relevant link]
>
> Watch next:
> [Related video link]
>
> What you'll learn:
> 00:00 Intro
> 00:00 [Main point 1]
> 00:00 [Main point 2]
> 00:00 [Main point 3]
> 00:00 Next step

**Upload Checklist** (VERIFIED live, verbatim, 14 items): Final title added · YouTube description added · Primary CTA link is the first link in the description · Helpful links added · Watch Next link added if available · Thumbnail uploaded · Thumbnail text is short and readable · Tags / keywords added · Pinned comment added · Playlist selected if relevant · End screen added · Cards added to relevant videos if needed · Visibility setting checked · Publish date and time confirmed.

**Optimization Checklist** (VERIFIED live, verbatim, 12 items): Title clearly matches the video · Title includes a strong keyword or searchable phrase if relevant · Thumbnail supports the title instead of repeating it · Thumbnail text is 3 to 5 words max when possible · Description clearly explains what the video helps the viewer understand · Description includes the title or main keyword naturally · Description includes the main CTA or next step · Pinned comment includes an engagement question or next step · Video is added to the best-fit playlist if available · End screen points to a relevant next video or playlist · Cards are placed where they naturally support the viewer journey · Tags are relevant and not stuffed with random keywords.

**Final Review** (VERIFIED live, verbatim, 9 items): Video plays correctly after upload · Audio sounds clear · Thumbnail looks good on mobile · Title is readable on mobile · Description links work · Pinned comment is posted · End screen and cards work · Publish settings are correct · YouTube link copied and saved.

**Mark as Published** — advances `status`, appears in Video Library's Published tab.

**`communityPost`** — real field, populated in 1/15 projects with a genuine, on-brand social-repost caption ("Just dropped a new video on something I've been thinking about a lot lately..."). Not documented in the live audit (screen not reached) or the dossier's explicit feature list. **Reconciliation supports keeping it as a real, optional Publish-adjacent field** — see §18/§20's UNRESOLVED note on whether it belongs to this module or a future Social Planner/Content Alchemy Lab hookup.

**Thumbnail Concept / Thumbnail Text / Thumbnail Curiosity Angle** — dossier explicitly rejects keeping these in Publish ("Do not keep Thumbnail Concept/Text in Publish," "Do not keep Thumbnail Curiosity Angle"). Real export shows `thumbnailConcept`/`thumbnailText` **were** populated on one real project (legacy, from before this decision), and `thumbnailCuriosityAngle` was never populated anywhere (0/15) — confirms it's safe to drop with zero data loss, while `thumbnailConcept`/`thumbnailText` need the same "LEGACY — PRESERVE DATA ONLY" treatment as generatedTitles (§18).

---

# 14. Saved Ideas

Real schema (ground truth, from 2 real ideas — this is meaningfully **smaller** than either the dossier's proposed schema or this migration's suggested field list):

| Real field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | dossier called this `ideaTitle` |
| `type` | text | dossier called this `ideaType`; real value seen: `"Random Thought"` |
| `notes` | text | dossier called this `ideaNotes`; real content includes voice-note transcription text prefixed with "Voice note transcription:" |
| `priority` | text | real value seen: `"Medium"` |
| `status` | text | real value seen: `"Someday"` |
| `lastUpdated` | timestamp | |
| `ideaVoiceNotes` | array | `{id, audioBase64}[]`, same shape as Video Project voice notes |

**Fields proposed by the dossier and by this migration's own instruction that do NOT exist in the real data — do not invent them:** `whatSparkedThis`, `relatedTopicId`/`relatedTopic/Subtopic`, `relatedOfferId`/`relatedOffer`. **Classification: UNBUILT.** These may be genuinely intended future fields (both the dossier and this migration's instruction independently proposed them) but there is zero real evidence they were ever implemented. Build the schema from real data (`id, title, type, notes, priority, status, lastUpdated, ideaVoiceNotes`); treat the relational fields as a documented future enhancement, not part of this migration's baseline.

Live-audit-confirmed UI: search field, "All Ideas" filter, Add New Idea / Save an Idea CTAs, empty state "Your idea vault is waiting." Actions (dossier, not independently live-verified): Edit, Duplicate, Delete, Turn Into Video. Pagination (dossier only): last 10 by default, newest first, filters reset to page 1 — not contradicted by anything, carry forward.

---

# 15. Video Library

VERIFIED live: stat counters (Total / Published / In Progress / Archived), status filter tabs (In Progress / Published / Archived), search, per-row actions (Resume, Rename, Duplicate, Archive, Delete, Mark as Published).

**Ecosystem Snapshot** (VERIFIED live): Top Topics / Top Subtopics rollups from `brain.topics[]`/`brain.subtopics[]`, "Missing Data" nudges (e.g. "1 video missing Watch Next"). Given the real export has only 1 real topic/subtopic, this feature's rollup behavior at scale is unverified — build it as a straightforward count/group-by over `topic`/`subtopic` fields on published videos.

**Watch Next** — only supported at the level of a "missing data" nudge (VERIFIED live: "videos missing Watch Next" appeared as a counter). There is no evidence anywhere in the three sources of an actual watch-next *recommendation* engine — do not build one. The dossier's "Binge Map" language belongs to §"Later enhancements," explicitly future, not this migration.

---

# 16. Settings

**Default Script Settings** — `defaultScriptOutputType`, `defaultDepthPreference` (§10).

**Data Management** — Export All Data (VERIFIED live and independently reproduced from the owner's own real export this pass) and Clear All Data (not tested, destructive, correctly avoided both times).

**PDF / Brand Vision Support** — "Generate PDF-Enhanced Prompt" button (VERIFIED live to exist; its output content was not captured). **The exact prompt is NOT preserved. Do not fabricate it. Status: `PARTIALLY SPECIFIED / REQUIRES RECONSTRUCTION`** — build from its stated purpose only (dossier + live copy: help a user with an existing brand document paste the most important sections into Channel Brain) unless a follow-up live capture supplies more.

**Positioning Elements Library** — read-only reference list of the 12 elements (§4.8), VERIFIED live, duplicated intentionally from Channel Brain → Positioning for quick reference.

---

# 17. Positioning Elements

Preserved exactly — see the full table with slugs, names, and verbatim definitions in §4.8.

Recorded rules (explicit, all 3 sources agree or don't contradict):

- Positioning is optional.
- Positioning should not block video creation.
- Positioning Elements should **not** be included in Script Prompt Builder in this migration (real `dominantPositioning`/`secondaryPositioning`/legacy `generatedTitles.primaryElement` usage is part of the separate legacy cluster in §18, not the current Script Prompt Builder).

---

# 18. Advanced / Orphan Fields — Reconciled Against Real Data

| Field | Real data evidence | Classification | Notes |
|---|---|---|---|
| `preferredFormat` | Populated 15/15, values include `"Full Script"`, `"Structured Recording Draft"` | **CONFIRMED ACTIVE** | Appears to duplicate/precede `scriptOutputType` per-project — likely an earlier or parallel field for the same concept. Needs a direct owner question: is this the same setting as `scriptOutputType`, or a distinct one? Keep both field names when migrating (§21) rather than guessing they're identical. |
| `videoLengthGoal` | Populated 15/15, e.g. `"20+ minutes"`, `"5 to 8 minutes"` | **CONFIRMED ACTIVE** | Not surfaced anywhere in the live-audit UI walkthrough — likely set during project creation (a step the live audit's one test project may have skipped past). Real, must be preserved and its input UI located/rebuilt. |
| `recordingStyle` | Populated 15/15, e.g. `"Face to camera"`, `"Screenshare / teaching"` | **CONFIRMED ACTIVE** | Same as above — real, undiscovered-live UI surface. |
| `energyStyle` | Populated 15/15, e.g. `"Calm and grounded"`, `"Bold and direct"` | **CONFIRMED ACTIVE** | Same as above. |
| `communityPost` | Populated 1/15, real on-brand caption text | **CONFIRMED ACTIVE**, scope UNRESOLVED | See §13 — real and intentional, but its home (Publish vs. a future Social Planner hookup) is an open question. |
| `generatedTitles`, `top3Titles` | Populated 2/15, real structured in-app title-generation output tied to Positioning Elements | **LEGACY — PRESERVE DATA ONLY** | This migration's own instruction already directs removing the in-app generator; real data confirms it existed and was used. Migrate as read-only historical records attached to their project; do not resurrect the generator. |
| `thumbnailConcept`, `thumbnailText` | Populated 1/15 | **LEGACY — PRESERVE DATA ONLY** | Dossier explicitly rejects keeping these in the rebuilt Publish step; real data proves they were used once. Same treatment as titles above. |
| `thumbnailCuriosityAngle` | Populated 0/15 | **LEGACY — SAFE TO DROP** | Zero real data exists to lose. Confirms dossier's rejection cleanly. |
| `hookOptions`, `expectationSetup`, `earlyCtaType`, `customEarlyCta`, `selectedEarlyCta`, `generatedOutline`, `dominantPositioning`, `secondaryPositioning`, `topicClarity` | Populated 2–3/15, structured, high-quality, AI-generated-looking content that maps almost exactly onto the dossier's "Regular YouTube script method" section names (Hook Options, Anchor & Expectation Setup, Early CTA...) | **PARTIALLY DESIGNED — genuinely unresolved, see §20** | This looks like a real, once-active, more granular in-app script-construction sub-flow — effectively a structured, step-by-step version of what Script Prompt Builder now does as one big external-AI prompt. Neither the dossier's feature list nor the live audit describes an in-app UI for these fields. Two explanations are equally plausible and neither is confirmed: (a) an earlier, now-superseded build phase where the app itself generated hooks/outline/CTA in-app before the product pivoted to "build one prompt, use external AI," or (b) a still-live but unreached UI surface (e.g. behind an "Advanced Details" panel the live audit never opened). **Do not guess which.** Preserve the real data read-only; ask the owner directly before deciding whether to rebuild this as an active feature. |
| `scriptMode` | Real values: `"full"`, `"section"` | **CONFIRMED ACTIVE, UNDOCUMENTED elsewhere** | Not mentioned in the dossier or live audit at all. Likely controls whether Script Prompt Builder assembles one full-script prompt or a section-by-section prompt. Needs a short follow-up live check before Phase 2 to confirm its UI control and behavior. |
| `relatedOffer`, `relatedPillar`, `storyUseful` (video-level) | Populated 0/15 | **LEGACY — SAFE TO DROP** | Dead fields at the video-project level, mirroring the same-named dead fields at the Channel Brain Stories entity level (§4.5). |
| `scriptBuilderSelectedFrameworkIds` | Populated 0/15 | **UNKNOWN** | Never populated despite `scriptBuilderSelectedStoryProofIds` being populated once — could mean framework selection in Script Prompt Builder wasn't exercised in these 15 real projects, or the field is dead. Not enough evidence either way; treat as CONFIRMED ACTIVE (it's clearly the framework-selection counterpart to the populated story-selection field) pending a follow-up check. |

---

# 19. Voice Notes

Intended surfaces (dossier + confirmed by real populated fields where noted):

| Surface | Real field | Status |
|---|---|---|
| Brain Dump Input | `brainDumpVoiceNotes` | CONFIRMED ACTIVE (populated in real export) |
| Deep Dive (generic) | *(no distinct field found)* | UNRESOLVED — dossier expects `deepDiveVoiceNotes`; this exact key never appears in any real video record. Either unbuilt, or generic Deep Dive voice notes are folded into a different field not identified this pass. |
| Product / Offer Deep Dive | `productOfferDeepDiveVoiceNotes` | CONFIRMED ACTIVE (populated) |
| Script Prompt Builder → Extra Script Notes | `scriptBuilderVoiceNotes` | CONFIRMED ACTIVE (populated) |
| Saved Ideas | `ideaVoiceNotes` | CONFIRMED ACTIVE (populated on a real idea) |

**Recording format (VERIFIED from real data):** each voice note is `{ id: uuid, audioBase64: "data:audio/webm;base64,..." }` — WebM audio, inline base64, no separate blob storage, no timestamp, no location-in-app field, no question/label linkage field, and **no transcription field ever populated** on any of the 7 real recordings found in the export (one exception: `productOfferDeepDiveAnswers`' free text shows a transcript-like line prefixed "Voice note transcription:" appearing to have been produced once for that specific field — see §8B — but this is text embedded in a different field, not a `transcription` key on the voice-note object itself).

**Reconciling the dossier's fuller voice-note spec** (append-not-overwrite behavior, "Voice note transcription:" label, Transcribe to Answer behavior, date/time, location, question/label linkage): these are **documented intent, not confirmed implementation**. Only recording + storage is confirmed real. Build the storage/recording layer first (confirmed, low-risk); treat transcription and the richer metadata (date/time, location, question linkage) as **PARTIALLY DESIGNED**, to be built new rather than "ported."

**Critical technical constraint (§6, repeated here for visibility):** inline base64 audio must not be stored as a Firestore document field. Migrate to Firebase Storage with a download URL/reference stored on the Firestore record instead. This is a required architecture change, not optional — Firestore's 1MB/document limit makes the current shape non-portable as-is.

**Reuse check:** `[[project_voice_notes_phase1]]` — Magnetix already has a shared record/upload/playback foundation (shipped 2026-08-18, not yet integrated into DMs/posts). This is the first strong candidate consumer for that foundation — recommend reusing it directly rather than building a second recorder, pending a quick compatibility check (its storage target, its playback component API) before Phase 2.

---

# 20. Final Data Model — Direction

Firestore, scoped by sub-account, following the confirmed repo convention (`subAccounts/{subAccountId}/{collectionName}` — verified via `src/lib/community/*.ts`'s existing pattern):

```
subAccounts/{subAccountId}/ytcs/brain              — singleton doc
subAccounts/{subAccountId}/ytcsIdeas/{ideaId}       — collection
subAccounts/{subAccountId}/ytcsVideos/{videoId}     — collection
```

`brain` as a single doc inside a small `ytcs` collection (rather than a bare field on the sub-account root doc) mirrors the existing pattern of keeping feature-scoped data in its own subcollection, and leaves room for a sibling `subAccounts/{id}/ytcs/settings` doc for §16's Default Script Settings without cluttering the sub-account root document.

This direction supersedes the prior audit's proposal of flat `ytcsBrain`/`ytcsSettings` top-level collections — a nested `ytcs/{brain|settings}` pair is cleaner for two true singletons and matches repo convention better than two nearly-empty top-level collections. `ytcsIdeas` and `ytcsVideos` stay top-level collections since they're genuinely repeatable, matching the `members`/`content-items`-style convention seen elsewhere.

Voice notes: `audioBase64` fields become `audioStorageRef: string` (Firebase Storage path) + `audioUrl: string` (signed/download URL, or resolved at read time) on each voice-note object, per §19's hard constraint.

This section states a **direction**, not a locked schema — exact Firestore field types (string vs. array vs. map) for each of the ~70 real fields found across Brain/Ideas/Videos should be finalized during Phase 1/2 implementation planning, using the real field tables in §4, §14, and §18 as the source of truth.

---

# 21. Data Import / Migration — Specification (not run this pass)

**One-time import flow, to validate and import the owner's real export (`youtube-studio-backup-2026-09-01.json`):**

1. **Validate JSON schema** — confirm top-level `{brain, ideas, videos}` shape; confirm each `videos[]`/`ideas[]` record has a real `id`; reject/report anything that doesn't parse.
2. **Preview counts before import** — surface to the user: "1 Channel Brain (X of 8 sections filled), 2 Saved Ideas, 15 Video Projects (breakdown by `currentStep`/`status`)" before committing anything.
3. **Preserve ids where safe** — reuse the real `id` values from the export for offers/frameworks/stories/topics/subtopics/ideas/videos, so the historical `pillars[0].id === topics[0].id` linkage (§4.7) and any cross-references (`storyId`, `frameworkId`, `scriptBuilderSelectedStoryProofIds`) resolve correctly post-import.
4. **Idempotency / duplicate protection** — key the import on the real `id`; re-running the same import file should upsert, not duplicate.
5. **Sub-account scoping** — all writes go under the target sub-account's `subAccounts/{id}/...` path; never write without an explicit sub-account selected.
6. **Import Brain** — write `topics`/`subtopics` from the real `brain.topics[]`/`brain.subtopics[]` (not `brain.pillars[]` — legacy, see §4.7); write `frameworks[]` from `brain.frameworks[]` (not `brain.method` — legacy, see §4.4); write `vision`/`audience`/`offers`/`stories`/`voice`/`positioning` directly, dropping the confirmed-dead `useful`/`relatedOffer`/`relatedPillar` sub-fields from stories (§4.5).
7. **Import Ideas** — direct field mapping per §14's real schema; voice notes go through the audio-migration step below.
8. **Import Videos** — direct field mapping per §4 (starting-point snapshots), §9 (`generatedScriptPrompt`/`compiledScript`), §18 (orphan fields, each per its classification — CONFIRMED ACTIVE fields migrate normally, LEGACY fields migrate into a clearly-marked read-only "legacy data" area of the record, not into any active-feature UI).
9. **Audio migration** — for every `audioBase64` value found (Brain: none in this export; Ideas: 1; Videos: 7 across `brainDumpVoiceNotes`/`scriptBuilderVoiceNotes`/`productOfferDeepDiveVoiceNotes`), decode and upload to Firebase Storage under the target sub-account's path, then store the resulting reference/URL in place of the inline base64.
10. **Report failures clearly** — per-record success/failure, with the specific field that failed (e.g. "video `ec006b5a`: audio upload failed for `productOfferDeepDiveVoiceNotes[0]`") rather than a single pass/fail for the whole import.

**Do not run this import during this task**, per explicit instruction — this is the specification for Phase 0's implementation.

---

# 22. AI Implementation

Use Magnetix's existing OpenRouter client (`src/lib/comms/ai/openrouter.ts`) for the one confirmed genuine internal AI action, Deep Dive Questions generation (§8A). It already exposes a model-selectable chat-completions call, used elsewhere for Comms/AI Suite.

**Before implementation:** inspect existing Magnetix AI usage metering and sub-account cost tracking (not yet located as of this document — flagged as a needed follow-up in the prior audit's §9 and still open). **Do not ship an unmetered AI call if the platform already meters AI elsewhere** — Deep Dive Questions should plug into whatever metering exists for AI Suite/Comms, not bypass it.

The exact historic Deep Dive model/provider was not preserved by any of the three sources — do not claim an exact migration of that detail; this is new design work, explicitly labeled as such in §8A.

---

# 23. Built / Partial / Planned Reconciliation

| Feature | Live Audit Status | Original Build Intent | Real JSON Evidence | Final Migration Classification | Notes |
|---|---|---|---|---|---|
| Dashboard | Built, live-verified | Built conceptually | — | **BUILD AS-IS** | |
| Channel Brain (8 sections) | Built, fully live-verified | Built | Fully populated real record | **BUILD AS-IS** | |
| Channel Brain progress bar | Not independently verified live this pass | Planned/built conceptually | — | **BUILD FROM DOCUMENTED INTENT** | Copy from dossier, not contradicted |
| 8 setup prompts | Fully captured live | Discussed/planned | — | **BUILD AS-IS** | Verbatim in §5 |
| Video Workspace 6-step pipeline | Built, live-verified end to end | Built | 15 real projects across every step | **BUILD AS-IS** | |
| 6 Starting Points | 1 of 6 live-tested (Brain Dump) | Built | All 5 real `startingPointType` values seen except `short_form` (field evidence only) | **BUILD AS-IS** | |
| Product Showcase / Signature Offer Video methods | Not live-tested | Built, exact approved prompts | 6 real productOffer projects, 1 confirmed format | **BUILD AS-IS** | Verbatim prompts in §9; question sets NOT recovered, see §8B |
| Generic Deep Dive AI call | Live-verified as real AI | Built | `generatedDeepDiveQuestions` populated | **BUILD FROM DOCUMENTED BEHAVIOR** | Exact prompt not recoverable, §8A |
| Product/Offer Deep Dive | Not live-tested | Built, dynamic by format | Partial real answers, question text not recovered | **PARTIAL / NEEDS DECISION** | Need owner's original question sets |
| Script Prompt Builder | Live-verified, template captured | Built, heavily refined | Fully matches dossier + live capture | **BUILD AS-IS** | Verbatim in §9 |
| In-app structured script builder (hookOptions/outline/etc.) | Not found live | Not described as a feature | Real, populated, structured data | **PARTIAL / NEEDS DECISION** | §18, §20 unresolved item 1 |
| Create Video | Live-verified, checklists captured | Built | No orphan fields | **BUILD AS-IS** | |
| Titles — Title Prompt Builder | Live-verified | Built, refined, final decision locked | `generatedTitlePrompt` real | **BUILD AS-IS** | |
| Titles — in-app generator | Not found live (locked-out UI) | Explicitly rejected | Real historical output found | **LEGACY — PRESERVE DATA ONLY** | §12, §18 |
| Publish | Live-verified, checklists captured | Built, refined | Description template confirmed | **BUILD AS-IS** | |
| Publish — thumbnail fields | Live-verified as present in one export | Explicitly rejected for rebuild | 1/15 populated | **LEGACY — PRESERVE DATA ONLY** (Concept/Text); **DO NOT BUILD** (Curiosity Angle, 0 data) | §13, §18 |
| `communityPost` | Not found live | Not described | 1/15 populated, real content | **PARTIAL / NEEDS DECISION** | Scope unresolved, §18 |
| Saved Ideas | Live-verified shell, form not opened | Built, richer schema proposed | Real schema much smaller than proposed | **BUILD AS-IS from real schema**; relational fields **FUTURE / NOT THIS MIGRATION** | §14 |
| Video Library + Ecosystem Snapshot | Live-verified | Built conceptually / partially conceptual | 15 real projects, 1 topic | **BUILD AS-IS** | |
| Watch Next / Binge Map | Nudge-level only, live-verified | Explicitly future | No evidence of a recommendation engine | **FUTURE / NOT THIS MIGRATION** | §15 |
| Settings — Default Script Settings | Live-verified | Built | scriptOutputType/depthPreference null on old projects confirms inheritance need | **BUILD AS-IS** | |
| Settings — Export/Clear All Data | Export live-verified working; Clear untested | Planned/recommended | The real export itself is proof this works | **BUILD AS-IS** (export); Clear is destructive, spec only, don't test | §16 |
| Settings — PDF/Brand Vision prompt | Button exists live, content uncaptured | Not detailed | — | **PARTIAL / NEEDS DECISION** | §16 |
| Positioning Elements Library | Live-verified, full text captured | Matches exactly | mostUsed/practiceMore/notFit slugs confirm | **BUILD AS-IS** | §4.8, §17 |
| Voice notes — recording/storage | Not live-tested (no mic interaction attempted) | Requested, "requires live verification" | Confirmed real, 7 real recordings | **BUILD AS-IS (storage architecture changed, §19/§21)** | |
| Voice notes — transcription | Not live-tested | Requested, described in detail | Zero confirmed transcriptions found | **PARTIAL / NEEDS DECISION** | §19 |
| Real login / cloud sync | N/A (client-side only, confirmed via direct localStorage inspection in prior audit) | Explicitly deferred, "do not build fake login" | Confirms no auth in the export | **BUILD AS-IS as Magnetix auth** | Not fake — real Magnetix auth replaces client-only storage entirely, per dossier's own explicit direction |

---

# 24. Contradiction Resolution

Explicit reconciliation for every contradiction found across the three sources, per the required categories.

1. **In-app title references vs. final Title Prompt Builder decision.** *Current behavior changed from original intent.* Real data proves an in-app generator existed and was used (`generatedTitles`/`top3Titles`, 2 real records). This migration's own instruction and the dossier's "Decisions Rejected" both independently confirm the decision to stop building it. Resolution: **build only the Title Prompt Builder; migrate the historical generator output as read-only legacy data attached to its project** (§12, §18).

2. **Live audit's Advanced Details uncertainty vs. original handoff fields.** *Unresolved, but narrowed.* The live audit flagged unopened "Advanced Details" collapsibles on Channel Brain sections as an unknown. The dossier does not explicitly describe Advanced Details content either. The real export's orphan-field cluster (§18's `hookOptions`/`expectationSetup`/etc.) is plausibly what an unopened Advanced Details panel would expose, but this is not confirmed — genuinely unresolved, not silently assumed. Needs a targeted live re-check (open every Advanced Details panel) before Phase 2.

3. **Orphan JSON fields.** *Mixed — resolved per-field in §18's table*, spanning confirmed-active, legacy-preserve-only, and genuinely-unresolved classifications. Not treated as a single bucket.

4. **Current localStorage schema vs. intended Magnetix cloud persistence.** *Current behavior changed from original intent — and the intent was explicit about this from the start.* The dossier itself states: "Because current implementation likely uses browser local storage, export/import should be added if cloud sync is not available" and "Do not build fake login. Only add login/cloud sync if builder supports real auth and cloud persistence." The live audit independently confirmed (direct `localStorage` inspection) that persistence really is client-only with zero account tie. Resolution: **this migration's entire purpose is exactly this transition** — Magnetix's real Firestore + real auth replaces the client-only store; §20/§21 specify how.

5. **Removed/hidden fields that still exist in exported historical data.** *Current behavior changed from original intent, historical data preserved.* Applies to: Stories' `useful`/`relatedOffer`/`relatedPillar` (§4.5, zero real data — safe to drop entirely), Publish's thumbnail fields (§13, real data exists — preserve, don't rebuild input UI), Titles' in-app generator output (§12/§18, real data exists — preserve, don't rebuild). In every case: **the UI decision to stop collecting new data in these fields is honored; no historical data is silently erased.**

6. **Pillars vs. Topics, Method vs. Frameworks.** *Current behavior changed from original intent, confirmed by a shared-id breadcrumb.* Both are clean renames with the old key left behind, empty, superseded by a populated new key sharing at least one real `id` (§4.4, §4.7). Migrate the new keys only; do not surface the old ones.

7. **Regular YouTube prompt opening: dossier's "RECONSTRUCTED" label vs. live capture.** *Resolved, upgraded.* The dossier explicitly hedges this text as "EXACT / RECONSTRUCTED FROM REQUIREMENTS." The live audit's independent, byte-for-byte capture matches it exactly. **This text is now VERIFIED, not reconstructed** — noted directly in §9.

---

# 25. Final Phase Plan

Adjusted from the suggested default order based on the reconciled dependency graph — Phase 0 must include the real import architecture (not just JSON validation, since the real export includes audio blobs requiring Storage migration, §19/§21), and Channel Brain must ship before any Video Workspace step that reads from it.

**Phase 0 — Import architecture + data rescue**
Validate-and-import flow per §21, including the Storage-based voice-note migration. No user-facing feature yet; this is infrastructure the rest of the migration depends on. Also the moment to resolve §24 item 2 (open every Advanced Details panel live) before Phase 1 locks the Channel Brain schema.

**Phase 1 — Channel Brain**
All 8 sections, Firestore-backed, all 8 setup-prompt modals ported verbatim (§5). Self-contained; every later phase depends on it existing.

**Phase 2 — Video Workspace: Input → Deep Dive → Script Prompt Builder**
Starting points (§7), generic Deep Dive AI call (§8A, new implementation per §22), Product/Offer Deep Dive (§8B — blocked on recovering the real question sets from the owner first), Script Prompt Builder (§9, deterministic, low-risk to port), Script Settings (§10).

**Phase 3 — Create Video, Titles, Publish**
Checklists (§11, §13), Title Prompt Builder (§12), Publish assets (§13). Lowest-risk phase — no unresolved AI-mechanism questions, no orphan-field decisions blocking it.

**Phase 4 — Saved Ideas, Video Library**
Real (smaller) Saved Ideas schema (§14), Video Library + Ecosystem Snapshot (§15).

**Phase 5 — Settings, voice notes, polish**
Default Script Settings, Export/Import (§16, §21 already built in Phase 0 but the *user-facing* Settings entry point ships here), Positioning Elements Library (§4.8/§17), voice-note recording UI reusing `[[project_voice_notes_phase1]]` if compatible (§19).

This defers the §18/§24 genuinely-unresolved items (the structured script-builder cluster, `communityPost`'s home, transcription) out of the critical path entirely — none of them block Phases 0–5, and none should be silently decided along the way.

---

# 26. This Document

Location: `docs/product/youtube-content-studio-migration-spec.md`. Read this before any YouTube Content Studio implementation work. Update **CURRENT STATUS** and **DATA MIGRATION STATUS** at the top after each phase.

---

# Phase 0 Addendum — Importer Built and Dry-Run Validated (2026-09-01)

## What this is

`scripts/migrate-youtube-content-studio.mjs` — a standalone, one-time, admin-credential migration script, deliberately **not** an HTTP route (per this phase's explicit security requirement: no public/client-reachable import endpoint). It follows the exact pattern already established by `scripts/migrate-energetic-profiles.mjs`: reads `.env.local` directly, initializes `firebase-admin` with the service-account cert, defaults to a zero-write dry run, and only writes with an explicit `--live` flag.

```
node scripts/migrate-youtube-content-studio.mjs \
  --file=<path to youtube-studio-backup-*.json> \
  --subAccountId=<id> \
  [--report=<path to write the full JSON reconciliation report>] \
  [--live]
```

`--file` and `--subAccountId` are both required with no default — the target sub-account is never guessed. The script confirms the sub-account document actually exists in Firestore before doing anything else, and aborts with no writes if not.

## Field classification (the code-form of §18/§23)

Every field on every Brain section, Idea, and Video record is classified into exactly one bucket:

- **MAPPED** — copied verbatim to its canonical field on the new doc.
- **LEGACY** — copied verbatim into a `legacy` sub-object on the doc (Brain: the pre-rename `method`/`pillars` keys; Video: the structured-script-builder cluster, the in-app title-generator output, and the thumbnail fields — see §18). Never surfaced by any UI this phase.
- **UNKNOWN** — anything not in either list is copied into an `unknownFields` sub-object and loudly flagged in the report, never silently dropped.

Dry-run result against the real export: **zero unknown fields** — every field on every one of the 18 real records (1 Brain, 2 Ideas, 15 Videos) matched a known MAPPED or LEGACY classification. This confirms the migration spec's §18 reconciliation was complete, not just directionally correct.

## Voice notes → Firebase Storage

Reused the existing community voice-note upload pattern (`src/app/api/community/[saId]/voice-notes/route.ts`) for the Storage path shape and download-URL construction. Storage path: `ytcs/{subAccountId}/voice-notes/{voiceNoteId}.{ext}` — deliberately keyed **only** by the voice note's own source id (never a timestamp), so a rerun overwrites the same Storage object instead of creating a duplicate.

An exhaustive recursive scan of the entire export tree (every `audioBase64` occurrence, not just the fields this script knows about) found **7 real voice recordings**, not 8 as the live-audit-only pass had estimated — corrected throughout this document. All 7 are real `audio/webm` recordings ranging 75KB–436KB, attached to: 1 Saved Idea (1 note), 1 Saved Idea (2 notes), and 3 Video Projects (1, 1, and 2 notes respectively).

Per-voice-note metadata preserved: id, attached entity type + id, location in app (human-readable, e.g. "Video Workspace > Deep Dive (Product/Offer)"), MIME type, byte size, Storage path, and — where the source text made it recoverable — a best-effort question association (parsed from the literal "Question N: ..." prefix the live app itself writes into `productOfferDeepDiveAnswers`; only ever populated when that exact pattern is found, never invented). Recording timestamp and transcription are recorded as `null` on every voice note — **the source data does not carry either field anywhere**, confirmed by the same exhaustive scan, so neither is fabricated.

## Document size safety — real numbers

| | Largest real doc | Firestore limit | Headroom |
|---|---|---|---|
| Any Firestore doc this importer writes (voice notes excluded — they go to Storage, not Firestore) | 81,452 bytes (`86417107...`) | 1,048,576 bytes | 92% free |

For comparison: that same video record, if its voice notes had been left inline as base64 (i.e., the shape the source data was actually in), would have been within reach of a document that size — one real record elsewhere in the export (`c832488e...`, not this one) reaches 797KB with voice notes inline, 76% of the Firestore limit from voice audio alone. This is the concrete evidence behind §19's "hard blocker" call, and the Storage migration resolves it completely: the largest Firestore document this importer ever writes is under 8% of the limit.

## Two fields confirmed absent from the source (not dropped — never existed)

`uploadChecklist` and `optimizationChecklist` — the live-audited Publish screen shows both checklists on screen, but neither field name appears anywhere in any of the 15 real video records. `finalReviewChecklist`, `recordingChecklist`, and `editingChecklist` are real and migrated. This is a genuine absence in the persisted data, not an importer decision — flagged here rather than silently noted only in a log.

## Dry-run reconciliation summary (full detail in the script's own report output)

- Channel Brain: all 9 current sections found and mapped (vision, audience, offers ×3, frameworks ×1, stories ×1, voice, topics ×1, subtopics ×1, positioning); both legacy sections (`method`, `pillars`) found non-empty-in-part and preserved under `brain.legacy`. Brain doc: 26,173 bytes.
- Saved Ideas: 2 found, both mapped, both real (3 voice notes between them).
- Video Projects: 15 found. Status distribution: Compiled Script Ready ×1, Deep Dive ×4, Input ×4, Create Video ×1, Publish ×1, Script Prompt Builder ×4. 3 of 15 carry real legacy-cluster data (structured script-builder fields and/or in-app-generated titles/thumbnails) — all preserved under each video's own `legacy` object.
- Voice notes: 7 found, all successfully decoded and measured in dry-run (`would-upload` status — no network calls made).
- Unknown fields: 0.
- Size warnings: 0.

## Live migration executed and verified (2026-09-01)

Pre-flight, immediately before the live write: source export md5 re-confirmed identical to the value recorded at dry-run time; target sub-account re-confirmed as "Main" (`xvnedVCmQpEvHrcPhEDI`, `quianalache.com`); unrelated concurrent-session working-tree changes re-confirmed untouched (55 files, same count before and after).

Live run wrote 1 Channel Brain, 2 Saved Ideas, 15 Video Projects, and uploaded all 7 voice notes to Firebase Storage. A dedicated read-back verification script then compared every written Firestore document field-by-field against the source export — id existence and no-extras for both Ideas and Videos, all 9 Brain sections plus both legacy sections verbatim, every one of the ~55 canonical Video fields per record (55 fields × 15 videos), all 4 Advanced Details fields, `communityPost`, `generatedScriptPrompt`/`compiledScript`, all 3 checklists, all title/publish fields, the `legacy` bucket on all 3 videos that carry historical structured-script-builder/title-generator/thumbnail data, and every voice-note reference (Storage path present, `audioBase64` field absent, content-type and byte size matching the Storage object's actual metadata).

**Result: 967 checks, 966 passed on the first pass.** The 2 that initially read as failures (one on the first live run, a second at the status-count summary level) were both investigated before any corrective action, per instruction, and both were conclusively proven to be defects in the verification script's own comparison logic — not real discrepancies:

1. A check asserting `brain.legacy.method` had "at least one non-empty sub-field" failed because the source data for `method` was itself always fully empty (5 keys, all empty strings) — direct inspection confirmed the migrated value matches the source **exactly**, empty fields and all. The check's assumption, not the migration, was wrong; the check was corrected to a verbatim-match assertion and passed cleanly afterward.
2. A check comparing video status counts as `JSON.stringify`'d objects failed because Firestore returned documents in a different iteration order than the report-building loop, producing the same six status counts serialized with different key order. Confirmed identical as sets in a separate comparison (Python `dict ==`) before treating it as resolved.

No corrective writes were needed in either case, because there was nothing to correct — both were test-script artifacts, confirmed by direct inspection before moving on, exactly as instructed.

## Idempotency — proven, not just designed

A second `--live` run was executed against the same export and sub-account. Result: identical Firestore doc counts (still exactly 1 Brain, 2 Ideas, 15 Videos — no duplicates), and Firebase Storage still holds exactly 7 objects under `ytcs/xvnedVCmQpEvHrcPhEDI/voice-notes/` (not 14), same filenames, same byte sizes. The full read-back verification suite was re-run after this second write and passed identically.

## Post-migration checks

- Original export file: byte-identical (md5 `01c8adff5eed09c642ec6e51948fed4b`) before the dry run, before the live run, and after the idempotency rerun.
- Unrelated concurrent-session work: untouched throughout (55 modified/staged files in the shared working tree, same count at every checkpoint).
- No client-reachable import path was ever created; the importer remains a local admin-credential script only.

**Phase 0 is complete.** Everything the task specified — importer, dry-run validation, live write, field-by-field no-data-loss verification, idempotency proof, security posture, unrelated-work isolation — is done.

---

# Business Brain Architecture (2026-09-01)

## Product decision

The 8 sections Phase 0 imported as YouTube Content Studio's "Channel Brain" — Creator Vision, Audience, Offers, Frameworks, Stories + Proof, Brand Voice, Topics + Subtopics, Positioning — are not YouTube-specific data. They're the sub-account's general strategic context, useful to YouTube Content Studio, the future Content Alchemy Lab, and any other current or future AI-assisted content feature (Social Planner AI, email AI, sales copy tools). Canonical ownership moves out of YouTube Content Studio to the sub-account itself, under the name **Business Brain**. "Channel Brain" remains the correct historical/YouTube-facing term wherever this document (§4, §5, §9, etc.) describes what YouTube Content Studio's screens looked like and did live — those sections are unchanged by this move, only where the data canonically lives has changed.

## Canonical path

```
subAccounts/{subAccountId}/businessBrain/main
```

**Why this path:** matches the established sub-account-scoping convention already used throughout the codebase (`subAccounts/{id}/{collectionName}` — confirmed via `src/lib/community/*.ts`'s member/token/settings subcollections, and `src/lib/server/content-library-service.ts`'s sub-account-filtered collections). A dedicated `businessBrain` collection (rather than a field on the sub-account root doc) keeps the sub-account document itself uncluttered and leaves room for natural future siblings (e.g. a `businessBrain/settings` doc) without restructuring. A fixed doc id (`main`) reflects that this is genuinely a singleton per sub-account, not a list — the same shape Phase 0 already used for `ytcs/brain`, just generalized and moved up a level to where it actually belongs.

**Reuse check performed first, per instruction:** searched for any existing shared business/brand/profile-context concept in the codebase (`brandProfile`, `businessProfile`, `brandContext`, `businessContext`, etc.) — found none. This is a genuinely new shared domain, not a duplicate of something that already existed. Existing patterns reused instead: the `subAccounts/{id}/{collection}` scoping convention, the `"server-only"` + `getAdminDb()` service-file pattern (`src/lib/server/content-library-service.ts` as the closest precedent for a typed, sub-account-scoped Firestore reader), and the dry-run/`--live` migration-script pattern already established by `scripts/migrate-energetic-profiles.mjs` and Phase 0's own `scripts/migrate-youtube-content-studio.mjs`.

## Files

- `src/types/business-brain.ts` — the `BusinessBrain` interface and its 8 section types (`BusinessBrainVision`, `BusinessBrainAudience`, `BusinessBrainOffer`, `BusinessBrainFramework`, `BusinessBrainStory`, `BusinessBrainVoice`, `BusinessBrainTopic`, `BusinessBrainSubtopic`, `BusinessBrainPositioning`), a `BusinessBrainLegacy` type for the superseded `method`/`pillars` sections, and the canonical path helper `businessBrainDocPath(subAccountId)`. Every field name is taken verbatim from this document's §4 (the real, already-reconciled schema) — nothing simplified or renamed casually.
- `src/lib/server/business-brain-service.ts` — `getBusinessBrain(subAccountId): Promise<BusinessBrain | null>`, the one shared server-side read path. Deliberately does not offer a "selected sections" API — the whole document is small (~26KB) and a single Firestore read; callers destructure what they need (e.g. YTCS's Script Prompt Builder would do `const { audience, voice, vision } = await getBusinessBrain(id)`). Deliberately does **not** fall back to reading `ytcs/brain` — that would permanently couple a supposedly-generic shared reader to a YouTube-specific legacy detail, contradicting the whole point of this move.
- `scripts/migrate-business-brain.mjs` — the one-time migration script, same dry-run/`--live` pattern as every other migration script in this repo.

## Migration result

Ran dry-run, then `--live`, against `subAccounts/xvnedVCmQpEvHrcPhEDI` ("Main") — the same sub-account Phase 0 targeted. `subAccounts/xvnedVCmQpEvHrcPhEDI/ytcs/brain` existed and was confirmed as the source; its full content (all 9 real top-level keys: `vision`, `audience`, `offers`, `frameworks`, `stories`, `voice`, `topics`, `subtopics`, `positioning`, plus `legacy` and Phase 0's own `migratedFromExport`/`migratedAt` provenance fields) was copied verbatim to `subAccounts/xvnedVCmQpEvHrcPhEDI/businessBrain/main`, with two new provenance fields added (`movedFromYtcsBrain: true`, `movedFromYtcsBrainAt`). The source doc was then updated **additively only** (`.set(..., {merge: true})`) with `deprecated: true` and `supersededBy: "subAccounts/xvnedVCmQpEvHrcPhEDI/businessBrain/main"` — every one of its original fields is untouched and still readable at the old path, but it is now explicitly marked as no longer the editable source.

## Field-level reconciliation — 25/25 checks passed

Existence of both docs; all 3 deprecation markers on the old doc; every original field byte-identical between old and new (ignoring only the deprecation markers on one side and the new provenance markers on the other); 8 canonical sections present; exact counts — 3 offers, 1 framework, 1 story, 1 topic, 1 subtopic; both legacy sections (`method`, `pillars`) preserved verbatim; zero unknown fields introduced; exactly 1 doc in the `businessBrain` collection and exactly 1 doc in the `ytcs` collection (no duplicate logical Brain records, old or new); the shared reader's own query logic sanity-checked directly against the written data; and confirmation that `ytcsIdeas` (2 docs) and `ytcsVideos` (15 docs) were completely unaffected by this migration.

## Compatibility strategy

**One canonical, editable Business Brain exists going forward: `subAccounts/{id}/businessBrain/main`.** The historical `ytcs/brain` doc is retained (never deleted — a real historical record, and the source this migration itself was reconciled against) but is now explicitly marked `deprecated`/`supersededBy` rather than silently left ambiguous. No code in this repo currently reads `ytcs/brain` at all (YTCS Phase 1 UI was never built), so there is no live consumer to redirect — the "compatibility" concern here is purely about not losing historical data and not leaving a second, un-marked, independently-editable copy lying around, both of which are satisfied. When YouTube Content Studio's Phase 1 is eventually built, it reads Business Brain via `getBusinessBrain(subAccountId)`, the same as any other future consumer (Content Alchemy Lab included) — it does not read or write `ytcs/brain`.

## Relationship to YouTube Content Studio and Content Alchemy Lab

YouTube Content Studio no longer conceptually owns the Brain. It remains the owner of everything genuinely YouTube-specific: `ytcsVideos` (video projects, generated Script Prompts, Final Script Drafts, Titles, Create Video status/checklists, Publish data, all historical legacy YTCS records), `ytcsIdeas` (Saved Ideas), and its own future Settings. When its Phase 1 is built, it becomes a *consumer* of `getBusinessBrain()`, exactly like any other module — nothing about §6–§16's documented screens, workflows, or field-level behavior changes; only where the Brain data itself lives changes. Content Alchemy Lab — not built this pass, per instruction — is designed to consume the same `getBusinessBrain()` function when it exists, so the two modules share one real context instead of each maintaining their own copy.

## AI context future-proofing

No special "give me sections X, Y, Z" API was built — deliberately, per "do not over-engineer." `getBusinessBrain(subAccountId)` returns the whole normalized object; a YTCS Script Prompt Builder implementation needing "Audience + Brand Voice + Creator Vision" does `const { audience, voice, vision } = await getBusinessBrain(id)`; a future Content Alchemy Lab needing "Audience + Brand Voice + Creator Vision + Topics + Offers" does the same with more destructured keys. Nothing about this shape blocks building a smarter selective-retrieval layer later if the document ever grows large enough to matter — at 26KB for the one real account that exists today, it doesn't yet.

## QA summary

All 15 items from this task's QA list were verified directly (not assumed): original `ytcs/brain` confirmed to exist before migration; new `businessBrain/main` confirmed created correctly; every real field confirmed preserved (25-check suite above); all nested records (offers/frameworks/stories/topics/subtopics/legacy) confirmed preserved; exact counts (3/1/1/1/1) confirmed; all 8 sections confirmed represented; no duplicate logical Brain records (exactly 1 doc in each of the two collections); the shared reader's logic confirmed correct against real written data; `ytcsIdeas`/`ytcsVideos` confirmed unaffected (2/15, unchanged); and the unrelated 55-file concurrent-session work confirmed untouched throughout (same count at every checkpoint in this pass). `npx eslint` clean on all 3 new files; `npx tsc --noEmit` clean (0 errors) across the whole project.

**Business Brain architecture and migration are complete.** No Business Brain UI, no YouTube Content Studio Phase 1, no Content Alchemy Lab — none of these were started, per instruction.

---

# Business Brain UI (2026-09-01)

## Settings location

**Settings → Business Brain** — a new tab inside the existing Sub-Account Settings page (`src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx`'s `Tabs`), alongside Admin/Messaging/API/Custom Fields/Importer. Not under Agency-level settings, not under YouTube Content Studio (which doesn't have a nav entry yet) — sub-account-level, per instruction.

## Structure

Business Brain's tab content has its own inner section navigation — a `SegmentedControl` (existing component, no new pattern) over the 8 canonical sections — so switching between Creator Vision/Audience/Offers/Frameworks/Stories + Proof/Brand Voice/Topics + Subtopics/Positioning never forces a giant single page.

## Write path

`GET`/`PATCH /api/sub-accounts/[id]/business-brain` — `GET` calls `getBusinessBrain()` directly (the same canonical reader every future consumer uses); `PATCH` merge-writes only whichever of the 9 canonical section keys (`vision`/`audience`/`offers`/`frameworks`/`stories`/`voice`/`topics`/`subtopics`/`positioning`) are present in the request body. `legacy`/`unknownFields`/the Phase-0 provenance fields are not in that allowed-key list, so no save action from this UI can reach or wipe them — structurally, not just by convention. Auth: `requireSubAccountAdmin`, the same guard every other sub-account settings write route uses.

Each section's save action calls this one endpoint with just its own section: singleton sections (Vision/Audience/Voice) send the whole edited object on an explicit "Save" click, mirroring `sub-account-branding-section.tsx`'s hydrate-once/edit/Save/toast pattern exactly. List sections (Offers/Frameworks/Stories) send the whole updated array on each add/edit/delete action (Firestore has no partial-array-element write), presented to the user as a single-record action — matching the original tool's own "cards collapse after save" UX (migration spec §4.3–§4.5). Topics + Subtopics saves `{topics, subtopics}` together on any change to either, since a Subtopic references its parent Topic by id and the two arrays need to stay consistent.

## Section results

- **Creator Vision, Audience, Brand Voice** — one generic `SectionFieldForm` component drives all three (same shape: a fixed set of labeled multiline fields on one object). Audience's 5 Awareness Stage fields render under their own subheading, per instruction to group for readability.
- **Offers, Frameworks, Stories + Proof** — one generic `RecordListEditor` drives all three (add/expand/edit/Save/Delete-with-confirm). Every canonical field from migration spec §4.3–§4.5 is editable; Primary CTA/Soft CTA are not present (never existed in the real data — nothing to resurrect). A framework's real `relatedPillar` field is preserved on every save (records are always spread, never rebuilt from just the edited fields) but has no editable control in the UI, so the deprecated "Pillar" term can't resurface there.
- **Topics + Subtopics** — its own component (`topics-tab.tsx`) for the real parent/child hierarchy: each Topic card nests its Subtopics with their own add/edit/delete, `parentTopic` always set correctly on create, and deleting a Topic warns about and removes its Subtopics together.
- **Positioning** — renders the real 12 Positioning Elements™ (`src/lib/business-brain/positioning-elements.ts`, verbatim slugs/names/definitions) as 3 checkbox groups (Most-Used / Want to Practice More / Do NOT Fit) plus a Notes field. Not wired into any AI generation or into Script Prompt Builder — pure data management, per instruction.

## Legacy-data protection

`legacy` (Brain-level `method`/`pillars`) is structurally unreachable by any PATCH this UI ever sends — not filtered out by a check, but simply never in the allowed-key list the API route accepts, so there is no code path in this pass that could wipe it even by accident.

## Real-data QA (2026-09-01, against the live production API)

Interactive click-through QA (the literal "open the tab, click Edit, type, click Save" flow) could not be completed this pass — the CDP-connected test browser's client-side Firebase Auth/Firestore state was stale (a long-lived tab reused across many hours of this session), so `useSubAccount()`'s client-computed `isAdmin` evaluated false and every admin-gated section — including pre-existing ones with no connection to this work, like the Admin tab's Branding and Account Contact sections — rendered nothing. This was confirmed to be a pre-existing browser-session condition, not a regression from this work: a fresh tab in the same browser showed the identical gap, and even the sub-account's own name (`subAccount?.name`, a completely separate Firestore listener) failed to resolve in the same tab, pointing at a broader stale-client-SDK-state issue of the same class already documented and defended against elsewhere in this codebase (`firebase-js-sdk#9267`), not anything specific to Business Brain.

**What was verified instead, directly against the live production deployment and the real Business Brain document**, via authenticated `fetch()` calls made from inside that same browser tab (so real session cookies, real `requireSubAccountAdmin` auth, real Firestore — the exact same server-side path the UI's own code calls):

- Baseline `GET` confirmed the real data: 3 offers, 1 framework, 1 story, 1 topic, 1 subtopic, Creator Vision/Audience/Brand Voice all present, Positioning's real 7 `mostUsed` elements, both legacy sections (`method`/`pillars`) present.
- Added one clearly-labeled disposable QA record (`"QA TEST - DELETE ME"`) as a 4th offer via `PATCH`. Confirmed via `GET` that it persisted and — critically — that every other section (frameworks/stories/topics/subtopics/vision/legacy) was byte-for-byte unchanged, proving partial-section saves cannot wipe unrelated sections.
- Removed the QA record via a second `PATCH`. Final `GET` confirmed the document matches the original baseline **exactly** across every section (offers/frameworks/stories/topics/subtopics/vision/audience/voice/positioning/legacy all byte-identical) — a clean, lossless round trip with zero residue.
- Cross-sub-account isolation: `GET` against the other real sub-account ("Test") returned `brain: null` — confirmed as a completely separate, unrelated document, no cross-contamination.
- Visual check: the Business Brain tab itself renders correctly and integrates cleanly into the existing Tabs shell (screenshot taken) — the tab pill highlights correctly on selection, no layout break, no console errors, no failed requests. Only the gated panel content beneath it is empty, for the auth-staleness reason above.

**This verifies the entire persistence architecture end-to-end with real production data and zero data loss — but does not substitute for a real interactive UI walkthrough.** That remains a genuine open item: someone with a fresh, properly-authenticated browser session should click through add/edit/delete on each section and confirm the responsive layout at desktop/tablet/mobile widths before this is considered fully QA'd. Nothing found in this pass suggests the UI code itself has a defect — `tsc --noEmit` and `eslint` are both clean, and the component tree renders (confirmed by the correctly-selected tab pill) right up to the point the pre-existing auth-staleness gate stops it.

## Files changed

`src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx` (+12 lines: import, TabsTrigger, TabsContent block), `src/app/api/sub-accounts/[id]/business-brain/route.ts` (new), `src/components/settings/sub-account-business-brain-section.tsx` (new, orchestrator), `src/components/settings/business-brain/{field-form,positioning-tab,record-list-editor,topics-tab}.tsx` (new), `src/lib/business-brain/{enums,positioning-elements}.ts` (new).

**Business Brain UI is live in production.** No YouTube Content Studio UI, no Content Alchemy Lab, no navigation entry for either — none started, per instruction.

---

# YTCS Phase 1 (2026-09-01) — Content nav, module shell, Dashboard, project foundation, Input step

Retroactively documented here alongside Phase 2, since this section was not written at the time (a clean QA-closure pass afterward correctly avoided documentation churn with no discrepancy to record).

## Scope delivered

Content nav entry (`Content › Social Planner, Content Library, YouTube Content Studio`); module shell at `subAccounts/{id}` route `/youtube-studio` with Dashboard/Video Workspace/Saved Ideas/Video Library/Settings internal nav (no "Channel Brain" tab — not YTCS-owned); Dashboard with real counts and a Business Brain entry card; Video Workspace project list (create/resume/rename/delete) over the real, already-migrated `ytcsVideos`/`ytcsIdeas` collections; Step 1 Input covering all 6 real starting points distinctly (Brain Dump with the 7 real canned questions + voice notes, Coaching Call, Short-Form Post, Story Bank/Framework/Product-Offer all pulling live from Business Brain); Settings' required Business Brain entry/link.

## Canonical route

`/sa/{subAccountId}/youtube-studio` (+ `/workspace`, `/workspace/[videoId]`, `/ideas`, `/videos`, `/settings`).

## Data layer

`src/types/ytcs.ts` (real field names verbatim from this spec's §4/§18/§20), `src/lib/server/ytcs-service.ts` (list/get/create/update/delete over the real `subAccounts/{id}/ytcsVideos`/`ytcsIdeas` paths — no new collection), `src/app/api/sub-accounts/[id]/ytcs/{videos,ideas,voice-notes}` routes, PATCH allowlisted to only Phase 1-reachable fields.

## QA result

eslint/tsc/build clean; real-data verification (15 projects/2 ideas/Business Brain doc all present, 3 projects' legacy data and all 15 projects' 4 Advanced Details fields confirmed preserved); disposable-QA-project CRUD (11/11 checks passed, real count unchanged after). Interactive browser QA was blocked at the time by a stale Firebase client-auth test profile plus machine disk exhaustion (both since resolved) — **the owner has since visually verified Phase 1 in production directly**, closing that gap.

## One disclosed mistake, corrected transparently

The first Phase 1 commit accidentally absorbed a concurrent session's unrelated sidebar changes (a new Acquisition nav entry) due to an isolation step being interrupted. This was caught via direct diff inspection before reporting success, and corrected with an immediate, honestly-labeled follow-up commit (`dd64d0f`) that restored the concurrent session's work to its original untouched, uncommitted state. Recorded here as the incident this document's own git-safety instructions since reference to avoid repeating.

Commits: `7215ad1`, `dd64d0f` (fix). Deployed and confirmed Ready.

---

# YTCS Phase 2 (2026-09-02) — Deep Dive + Script Prompt Builder

## Scope delivered

Step 2 (Deep Dive, normal + Product/Offer format-specific) and Step 3 (Script Prompt Builder) — completing Input → Deep Dive → Script Prompt Builder. Create Video/Titles/Publish remain locked, shown with a lock icon and "coming in a later phase," never faked.

## Deep Dive — real data resolved what Phase 0 had left as "unknown AI mechanism"

A fresh investigation across all 15 real migrated projects' `generatedDeepDiveQuestions` (not just the 2 partial answer fragments Phase 0 had found) turned up 3 distinct real question sets:

| Set | Question count | Real occurrences | Adopted as |
|---|---|---|---|
| Set 1 | 9 | 6 real projects (brain_dump/conversation/framework/one signatureOfferVideo) + 1 independent live-audit reproduction against a different input = 7 total | **Canonical Generic Deep Dive** (Brain Dump, Coaching Call, Short-Form Post, Story Bank, Framework) |
| Set 2 | 10 | 1 real project's full array, cross-confirmed by a **second, independent** real project whose actually-typed answer began "Question 5: What belief needs to shift before this offer makes sense?" — an exact match to Set 2's item 5 | **Canonical Signature Offer Video Deep Dive** |
| Set 3 | 7 | 1 real project (a second brain_dump instance) | Not adopted — a genuine historical variant, outweighed 7-to-1 by Set 1's confirmations. Preserved read-only on its own project; not used to overwrite anything. |

Product Showcase has **only one** real recoverable question (from one real project's saved answer: "Who is this product best for, and who is it not for?"). No full set was ever found for this format on either of the 2 real productShowcase projects — implemented honestly as that one question plus a general notes area, not padded out with invented questions. See `src/lib/ytcs/deep-dive-questions.ts` for the full evidence trail and exact real question text.

**No AI model call is made for Deep Dive questions in Phase 2** — all three sets above are fixed, deterministic data, not live-generated.

## Deep Dive voice notes

New `deepDiveVoiceNotes` field — no real historical field name was ever found for generic Deep Dive voice notes (this was migration spec §19's own unresolved item), so this follows the established naming convention (`brainDumpVoiceNotes`, `scriptBuilderVoiceNotes`, `productOfferDeepDiveVoiceNotes`) rather than reusing an unverified guess. Product/Offer Deep Dive reuses the real, pre-existing `productOfferDeepDiveAnswers`/`productOfferDeepDiveVoiceNotes` fields and their real "Question N: ...\nVoice note transcription:\n..." append pattern exactly. No automatic transcription — recording/playback/manual-typed-answer only, per instruction not to fake infrastructure that doesn't exist (§19's transcription question stays open).

## Script Prompt Builder — deterministic, zero AI/OpenRouter calls

`src/lib/ytcs/script-prompt.ts` assembles the prompt entirely server-side from real data. VERIFIED-verbatim vs. adapted, tracked explicitly in code comments:

- **VERIFIED verbatim** (this spec's §9, live-captured): the regular-video opening, YouTube Script Method, Momentum Transitions, Return Structure, Style Rules.
- **VERIFIED verbatim** (this spec's §9, dossier "EXACT / FINAL APPROVED"): the Product Showcase and Signature Offer Video openings and their method step lists.
- **Reused across formats, not invented per-format**: "How To Use This Context" and "Style Rules" — the dossier describes both generically, not scoped to the regular-video case.
- **Disclosed adaptation, not a second verbatim capture**: Product Showcase/Signature Offer Video's Return Structure and Momentum Transitions were never independently captured for those two formats. Return Structure is adapted from the regular template's own shape (outline → proof/CTA plan → final draft → recording notes), naming the correct method by title; Momentum Transitions is omitted entirely for those two formats rather than assumed to apply identically.

Real-data verification (via `tsx`, direct Firestore data, no mocks): 21/21 checks passed across a regular prompt, a Product Showcase prompt, a Signature Offer Video prompt, and a maximally-empty edge case (no Business Brain, no source material at all) — zero cross-contamination between prompt types (confirmed no format's method/opening text leaks into another's prompt), zero `undefined`/`null`/`[object Object]`/empty-heading artifacts even on the empty-project case.

## Script Ingredients

Audience/Brand Voice/Creator Vision auto-included from Business Brain (shown as badges); Stories + Proof and Frameworks are real multi-select from Business Brain's actual records (only selected ones enter the prompt — the Brain is never dumped wholesale); Offer/CTA Context auto-included only for real `productOffer`-starting-point projects, since **no confirmed real field exists for an optional offer picker on other starting points** (unlike Story/Framework selection) — building one would have been inventing a field with zero evidentiary basis, so it wasn't built; disclosed as an open item (§ UNRESOLVED DECISIONS). Extra Script Notes: text + voice note, reusing the pre-existing `scriptBuilderVoiceNotes` field from Phase 0/1.

## Script Output Settings

Script Output Type: all 4 real confirmed values exposed (Full Script, Structured Recording Draft, Talking Point Outline, Hybrid Script + Talking Points). Depth Preference: **only "Detailed" is exposed as selectable** — the sole value ever confirmed by real data or live testing; "Balanced"/"Concise" stay unresolved per this spec's own earlier finding, not silently decided either way in Phase 2. The Script Output Type-specific descriptive paragraph in the generated prompt is only included for "Structured Recording Draft" (the one value with verbatim captured description text) — the other 3 real types get the prompt without that one extra sentence rather than a guessed description.

## Write safety

`generatedScriptPrompt` regeneration goes through its own dedicated route (`generate-script-prompt`) that writes ONLY that one field — verified directly against Firestore that `compiledScript` (Final Script Draft) survives regeneration byte-identically. The PATCH allowlist was extended with exactly the new Deep Dive + Script Prompt Builder fields; Create Video/Titles/Publish fields remain structurally unreachable, same defense-in-depth as Phase 1/Business Brain.

## QA result

eslint clean; `tsc --noEmit` shows zero YTCS-related errors (the only errors present are from a concurrent session's own incomplete, entirely untracked billing/purchases work — confirmed via `git show HEAD:<path>` returning "not in HEAD" for every offending file, meaning they cannot affect any real deployed build); real Firestore round-trip QA (13/13 checks) via a disposable QA project covering Deep Dive save, Script Ingredients save, prompt generation, regeneration, and Final Script Draft preservation; all 15 real projects confirmed byte-identical before/after QA. Interactive browser QA was not performed this phase (no authenticated browser session available) — disclosed as still owed, not claimed as done.

## Files changed

`src/types/ytcs.ts` (+`deepDiveVoiceNotes`), `src/lib/ytcs/deep-dive-questions.ts` (new), `src/lib/ytcs/script-prompt.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts` (PATCH allowlist extended), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script-prompt/route.ts` (new), `src/components/ytcs/deep-dive-step.tsx` (new), `src/components/ytcs/script-prompt-builder-step.tsx` (new), the project detail page (Deep Dive/Script Prompt Builder tabs unlocked).

Commit: `90386c0`, pushed as `1888878`. Deployed and confirmed Ready on `crm.magnetixstudios.com`.

**YTCS Phase 2 is live in production.** Create Video, Titles, Publish, and Content Alchemy Lab remain untouched, per instruction.

---

# YTCS Phase 3A (2026-09-02) — Create Video

## Scope delivered

Step 4 (Create Video) — completing Input → Deep Dive → Script Prompt Builder → Create Video. **Not an AI generation step** — no model call anywhere in this phase. Titles/Publish remain locked, shown with a lock icon and "coming in a later phase," never faked. Full Saved Ideas CRUD, full Video Library, and Content Alchemy Lab were also not touched, per instruction.

## Recording Checklist / Editing Checklist — verbatim from §11, no invented copy

Both 9-item lists reused exactly as documented in this spec's §11 (`src/lib/ytcs/create-video-checklists.ts`). Real-data investigation across all 15 real projects found:

- `recordingChecklist` is empty `{}` on all 15 real projects — no real checked-state to render, but the field round-trips correctly for first real usage.
- `editingChecklist` is empty on 13 of 15, but **2 real projects carry a genuine data-quality discrepancy**: project `86417107-f51a-472c-9a27-9588f4622eec` has `{"Record Hook": false}` and project `cf95ee97-1fd3-4435-b7cf-13ae05721e15` has `{"c1": false, "c2": false}` — keys that don't match any of the 9 canonical Editing Checklist labels (a cross-checklist mislabel and a generic-key scheme, respectively, from earlier in the tool's history). Per instruction, these are **preserved, not normalized**: the UI surfaces them as a small read-only note under the checklist ("This project also has older checklist data not shown above...") rather than silently dropping or renaming them, and no write path ever touches or deletes a key it didn't itself set.

Each checkbox toggle auto-saves immediately (sends only `{ [kind]: { [item]: boolean } }`), relying on Firestore's own nested merge-set behavior — confirmed directly in this phase (a temporary test doc, since deleted) that `.set(data, {merge:true})` deep-merges nested map fields, so a single-item toggle write can never clobber sibling keys already on the same map, real legacy keys included. Verified specifically (not just generically) by simulating the exact real key shapes from both of the 2 legacy projects on a disposable doc and confirming a canonical-item toggle left them untouched — done on a simulated doc, not the 2 real projects themselves, so no real record was write-tested directly.

## Recording Notes / Editing Notes

Two independent multiline fields (`recordingNotes`, `editingNotes`), free text, each with its own explicit Save button — matching the established YTCS text-field convention (Script Prompt Builder's Extra Script Notes / Final Script Draft). Both are empty/absent on all 15 real projects today, so there is nothing real to preserve visually yet, but both round-trip correctly. No voice notes were added to Create Video — the migration spec never confirmed a real voice-note field for this step, and the phase instruction explicitly forbade adding one without that confirmation. `finalVideoNotes` (a real field in the schema, always empty across all 15 real projects) was deliberately **not** wired up — it wasn't named in this phase's explicit scope ("recording checklist, editing checklist, recording notes, editing notes, status dropdown, Edits Lab"), so it stays out of the PATCH allowlist rather than being added speculatively.

## Create Video Status

Real field `createVideoStatus`. Real-data check across all 15 projects found only two states: `"Ready to Record"` (10 projects) and unset (5 projects) — no other value has ever appeared. The UI exposes the already-decided 3-value enum from §11 (`Ready to Record`, `Editing`, `Ready for Titles`) as a button group; a project whose status doesn't match any of the 3 (a hypothetical future legacy value) is preserved as-is and surfaced with an explanatory note rather than silently coerced to a known value — this didn't occur in any of the 15 real projects today, but the UI handles it defensively.

## Edits Lab resource card

Preserved as a single card, not a modal or interruption: "Premium Resource" badge, one-line pitch, links out to `https://quianalache.com/the-edits-lab` in a new tab. Styled to match the existing YTCS card language (rounded-2xl border, muted background) rather than introducing new visual patterns.

## Write safety

The PATCH allowlist (`src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts`) was extended with exactly the 5 new fields (`createVideoStatus`, `recordingChecklist`, `editingChecklist`, `recordingNotes`, `editingNotes`). Titles/Publish fields remain structurally unreachable, same defense-in-depth as every prior phase. Verified directly via a disposable QA project that Create Video writes never touch Input's `rawTranscript`, Script Prompt Builder's `generatedScriptPrompt`/`compiledScript` (Final Script Draft), or a synthetic `legacy` field standing in for migration-provenance data.

## QA result

eslint clean; `tsc --noEmit` shows zero errors in any Phase 3A file (the only repo-wide errors present are the same concurrent session's own incomplete, entirely untracked billing/purchases work already documented in the Phase 2 addendum — confirmed again via `git show HEAD:<path>` returning "not in HEAD"). Real Firestore round-trip QA (20/20 checks) via a temporary script: all 15 real projects' render-safety confirmed (checklist fields are always a plain object or absent, never a shape that would break the UI), both real legacy-keyed `editingChecklist` entries confirmed still present and unchanged, the legacy-key-preservation mechanism confirmed against simulated docs carrying the exact real key shapes, a disposable QA project exercised every new field (both checklists, both notes fields, status) end-to-end with a full read-back, confirmed Input/Script-Prompt-Builder/legacy-shaped data untouched by any Create Video write, and confirmed all 15 real projects were byte-identical (across the fields that matter to this phase) before and after the entire QA run. Interactive browser/responsive QA was not performed this phase (no authenticated browser session available) — disclosed as still owed, not claimed as done.

**Mid-phase note on shared-repo safety:** partway through this phase, a concurrent session's own `git stash push -u` (labeled "set aside unrelated dirty/untracked WIP for clean build check") swept this phase's uncommitted files into its stash along with that session's own unrelated work, briefly leaving them off disk. Nothing was lost: the 4 affected files were recovered by checking out just those paths from the stash's tracked and untracked-files commits (`git checkout <stash> -- <paths>` / `git checkout <stash>^3 -- <paths>`), verified byte-for-byte correct afterward, and the stash itself was left untouched for its original owner to pop or drop.

## Files changed

`src/lib/ytcs/create-video-checklists.ts` (new), `src/components/ytcs/create-video-step.tsx` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts` (PATCH allowlist extended), the project detail page (`workspace/[videoId]/page.tsx` — Create Video tab unlocked). No changes to `src/types/ytcs.ts` (all 5 fields already existed in the real type from Phase 1) and no changes to `src/components/dashboard/sidebar.tsx` (no new nav entry needed for this phase).

**YTCS Phase 3A is complete.** Titles, Publish, full Saved Ideas CRUD, full Video Library, and Content Alchemy Lab remain untouched, per instruction.

---

# YTCS Phase 3B (2026-09-02) — Titles + Publish

## Scope delivered

Step 5 (Titles) and Step 6 (Publish) — **all six Video Workspace steps are now real and built**: Input → Deep Dive → Script Prompt Builder → Create Video → Titles → Publish. Full Saved Ideas CRUD, full Video Library, YTCS Settings completion, and Content Alchemy Lab were not touched, per instruction.

## Titles — the real captured Title Prompt template, cross-confirmed byte-for-byte

The final active Titles system is the **Title Prompt Builder**, matching this migration's locked decision: a copy-paste AI prompt, never an in-app title generator. Unlike Phase 2's Script Prompt Builder (whose template was reconstructed from the dossier's verbatim capture), Phase 3B found the *exact real template* still sitting in the real export: `generatedTitlePrompt` on 2 of 15 real projects (`86417107-...`, `f4a91664-...`) is **byte-identical**, proving it is genuine deterministic output, not AI-varying content. `src/lib/ytcs/title-prompt.ts` reconstructs it exactly — verified by rebuilding both real projects' prompts from their real `compiledScript` + real Business Brain data and diffing byte-for-byte against the real stored value (0 differences on both). The real template omits "Trend-Jacking" entirely (the dossier lists it as conditional); the real captured version simply never includes it, so it stays out here too.

A third real project (`cf95ee97-...`) has a *different*, older `generatedTitlePrompt` — 15 titles instead of 10, positioning-element references, a "video context" fallback used instead of requiring a Final Script Draft, and a per-title "Thumbnail Angle" (a field the dossier explicitly rejects). This is the pre-pivot legacy generator's real output, outweighed 2-to-1 by the cross-confirmed template above and consistent with this migration's own locked decision to not resurrect the old generator. That real string is still rendered as-is (real, previously-generated data is never hidden or regenerated away on page load), but all new/regenerated prompts use only the canonical template.

**Missing-script guard**, VERIFIED verbatim (spec §12): *"Add your final script first so the title prompt can be based on the actual video… not a vague idea wearing a blazer."* Enforced in both the UI (Generate button disabled, guard message shown) and server-side in the `generate-title-prompt` route (400 if `compiledScript` is empty) — generating from a vague idea instead of the real script is exactly the behavior this migration moved away from, so it's blocked at both layers, not just cosmetically in the UI.

**Generated Title Prompt persistence**: written only by its own dedicated route (`generate-title-prompt`, mirrors Phase 2's `generate-script-prompt`), never by the general PATCH route's client usage — opening a project never silently regenerates it, and regeneration was verified (via a disposable QA project) to leave Selected Title/Backup Title/Notes completely untouched.

**Your Chosen Title**: Selected Title + Backup Title + Notes, one batched "Save Titles" action (matches the established Script Ingredients save pattern). Live character counts shown for both title fields; no arbitrary limit imposed — the migration spec never defines one. `titleNotes` is a **new field name** — no real field for Titles-step notes was ever found in the export (same situation Phase 2 hit with `deepDiveVoiceNotes`), so it follows the existing `[step]Notes` convention rather than reusing an unverified guess.

**Legacy title-generator data** (`generatedTitles`, `top3Titles`, `thumbnailConcept`, `thumbnailText`, `thumbnailCuriosityAngle`) already lives read-only under each real project's `legacy` bucket, per Phase 0's importer classification — confirmed again this phase and left completely untouched; no UI reads or renders it, and it is not in the PATCH allowlist.

## Publish — command center, no invented fields

**Publish Assets**: Final Title, YouTube Description (with Copy button, CTA-first default template pre-filled when empty), Tags/Keywords, Pinned Comment, Upload Notes, YouTube Link, Publish Date — all VERIFIED real fields, one batched "Save Publish Assets" action. `communityPost` (real, but its UI home is an unresolved open question per spec §13/§18) and `finalVideoNotes` (real, always empty, never named in scope) were deliberately **not** built or added to the PATCH allowlist — they round-trip untouched by construction, not by convention alone. No `playlist` field was built — zero real evidence it ever existed.

**Default YouTube Description template**: VERIFIED byte-for-byte against a real export record (`98530527-...`) — 14 of 15 real projects have this exact text seeded as their actual stored `youtubeDescription` value, confirming it's a real seeded default, not just a UI placeholder.

**Upload Checklist (14 items) / Optimization Checklist (12 items)**: verbatim from spec §13. Real-data note: **no real field name was ever found for either checklist** in the export (only `finalReviewChecklist` has real precedent, populated on 1/15 projects with keys matching these Final Review items exactly) — `uploadChecklist`/`optimizationChecklist` are new field names established here, following the same `[step]Checklist` convention as Create Video's checklists. Same auto-save-per-toggle behavior and Firestore nested-merge-based legacy-key preservation as Create Video (Phase 3A) — verified again this phase via a disposable project's multi-toggle round trip.

**Final Review (9 items)**: real field `finalReviewChecklist`, verbatim from spec §13, same auto-save toggle pattern.

**Mark as Published**: sets `status` to `"Published"` and, if `publishDate` isn't already set, defaults it to today. **No real project ever reached a "Published" status in the export** (real `status` values found: Input/Deep Dive/Script Prompt Builder/Create Video/Publish/"Compiled Script Ready" — all step-name-shaped, never a terminal "Published" value) — so this exact string is a documented product decision, not a real-data-confirmed one, made by extending the same step-name-based status convention every other real value already follows to its natural terminal state. Not gated behind checklist completion, per instruction ("do not introduce artificial gates").

## Video Library relationship

No full Video Library was built this phase. Publish writes only to the existing `status` field on the existing `ytcsVideos` collection — no separate published-video collection was created — so a future Video Library's "Published" tab can filter `status === "Published"` directly against real Video Project documents, matching the already-established single-collection architecture.

## Write safety

The PATCH allowlist (`src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts`) was extended with exactly the Titles + Publish fields (`generatedTitlePrompt`, `selectedTitle`, `backupTitle`, `titleNotes`, `finalTitle`, `youtubeDescription`, `tagsKeywords`, `pinnedComment`, `uploadNotes`, `youtubeLink`, `publishDate`, `uploadChecklist`, `optimizationChecklist`, `finalReviewChecklist`). `communityPost`, `finalVideoNotes`, and every `legacy`/`unknownFields` key remain structurally unreachable. Verified via a disposable QA project that Titles/Publish writes never touch Input, Script Prompt Builder, Create Video, `legacy`, or `communityPost` data.

## QA result

eslint clean; `tsc --noEmit` shows zero errors in any Phase 3B file (repo-wide errors present are the same pre-existing, entirely untracked, concurrent-session billing/purchases files already documented in the Phase 2/3A addenda — confirmed again via `git show HEAD:<path>` returning "not in HEAD"). Real Firestore QA (27/27 checks) via a temporary script: real-project render compatibility (both cross-confirmed real Title Prompts, the legacy title-prompt project, real Final Review data), a deterministic rebuild of both real Title Prompts matching the stored values byte-for-byte, a disposable QA project exercising every new Titles/Publish field end-to-end including regeneration-preserves-Selected/Backup/Notes and Mark as Published, full previous-step/legacy/advanced/communityPost preservation, and all 15 real projects confirmed byte-identical (across every field this phase touches) before and after the run. Interactive browser/responsive QA was not performed this phase (no authenticated browser session available) — disclosed as still owed, not claimed as done.

## Files changed

`src/lib/ytcs/title-prompt.ts` (new), `src/lib/ytcs/publish-checklists.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-title-prompt/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts` (PATCH allowlist extended), `src/components/ytcs/titles-step.tsx` (new), `src/components/ytcs/publish-step.tsx` (new), `src/types/ytcs.ts` (+`titleNotes`, `uploadChecklist`, `optimizationChecklist`), the project detail page (`workspace/[videoId]/page.tsx` — Titles/Publish tabs unlocked, all six steps now built). No changes to `src/components/dashboard/sidebar.tsx`.

**YTCS Phase 3B is complete. All six Video Workspace steps are real.** Full Saved Ideas CRUD, full Video Library, YTCS Settings completion, and Content Alchemy Lab remain untouched, per instruction.

---

# YTCS Final Completion Phase (2026-09-02) — Saved Ideas + Video Library + Settings

## Scope delivered

Full Saved Ideas (create/edit/duplicate/delete/Turn Into Video/voice notes), full Video Library (In Progress/Published/Archived tabs, Resume/Rename/Duplicate/Archive/Restore/Delete), and YTCS Settings (Default Script Output Type + a truthfully-limited Depth Preference). **Content Alchemy Lab was not touched, per instruction.**

## Saved Ideas — real schema only

Built exactly the real confirmed schema from spec §14: `title`/`type`/`notes`/`priority`/`status`/`ideaVoiceNotes`. The dossier-proposed relational fields (`whatSparkedThis`, `relatedTopicId`, etc.) were not built — zero real evidence they ever existed, consistent with §14's own finding that the real schema is smaller than either the dossier or an earlier instruction proposed. Type/Priority/Status are plain text inputs, not dropdowns — no confirmed enum exists for any of them beyond one real value each (`"Random Thought"`/`"Medium"`/`"Someday"`), so a dropdown would have invented options with zero evidence; new ideas default to those three real values. Search + "last 10, newest first" pagination are built exactly as the dossier documents (spec §14), not contradicted by anything real.

Voice notes reuse the existing YTCS voice-note architecture directly (`VoiceNoteRecorder`/`VoiceNotePlayer`, `uploadYtcsVoiceNote`, Firebase Storage — never inline base64). No transcription was added — no real, working transcription path exists anywhere in YTCS today (spec §19's own open item), so faking one here would have been inventing infrastructure that doesn't exist.

## Turn Into Video

Real behavior was never independently captured (dossier-listed action only). Implemented as the most faithful real mapping available, disclosed rather than guessed silently: `startingPointType: "brain_dump"` (Brain Dump's own description — "a messy idea, random thought, lesson, hot take, or question" — matches the real Saved Idea `type` value, `"Random Thought"`, almost verbatim, and it's also Input's own default when unset), `rawTranscript` seeded from the idea's real `notes` (Brain Dump's real source-material field), the idea's voice notes carried over as `brainDumpVoiceNotes` (same Storage references, not re-uploaded — safe because neither Delete Idea nor Delete Video Project ever touches Storage), and a new `sourceIdeaId` field for traceability (no real field existed for this — Saved Ideas and Video Projects were disconnected in the real export). The source idea is never mutated or deleted.

## Video Library — same collection, new classification field

No separate published-video or archived-video collection — Video Library reads and writes the existing `ytcsVideos` collection directly, matching spec §15/§20's own architecture. Classification uses only the real `status` field (Phase 3B's `"Published"` value, now canonical) plus one new field, `archived` (boolean) — no real field name ever existed for Archive in the export, so this follows the plain-flag pattern rather than overloading `status`. Archived overrides Published/In Progress in the tab classification (an archived-but-published project only shows in Archived). Restore (unarchive) is implemented as the same field toggling back to `false` — not a separate action, since Archive/Restore were never independently confirmed as two distinct real actions, just one reversible one.

**Duplicate Project** semantics were never captured by any source — implemented as the smallest safe behavior, disclosed: copies the source's real content fields onto a new id (name gets " (Copy)", `currentStep`/`status` copied as-is — a duplicate is a snapshot, not a reset to Input). Deliberately **not** copied: `legacy`/`unknownFields`/`migratedFromExport`/`migratedAt` (a duplicate is a new, non-migrated record), `archived` (a fresh copy is never pre-archived), and every voice-note array (avoids two projects sharing ownership of the same underlying Storage recording). If the source was already `"Published"`, the duplicate's `status`/`youtubeLink`/`publishDate` are reset so a fresh duplicate never falsely presents itself as already live. Saved Idea duplication follows the identical pattern (new id, real fields copied, voice notes and migration provenance not copied).

**Delete** stays Firestore-doc-only for both ideas and video projects — never touches Storage, matching the existing `deleteVideoProject` behavior established in Phase 1. This is also what makes Turn Into Video's copied voice-note references safe regardless of deletion order.

Row metadata shown: project name, starting point, current step, status, last-updated date, and Selected/Final Title when available — no analytics, no ecosystem snapshot, no ecosystem/watch-next features (spec §15 explicitly scopes those out of this pass; they weren't built).

## YTCS Settings — sub-account-wide, truthfully scoped

New `subAccounts/{id}/ytcs/settings` singleton doc, matching spec §20's own already-stated direction (a sibling to `ytcs/brain`). **Sub-account-wide, not per-user** — no per-user preference model exists anywhere else in Magnetix to adapt to instead, so this doesn't invent one; it's the same scope as Business Brain. Two real fields only: `defaultScriptOutputType` (all 4 real values selectable) and `defaultDepthPreference` (stored, but the UI only ever shows "Detailed" as a fixed, non-selectable value — Balanced/Concise stay unresolved, matching Script Prompt Builder's own already-established treatment, per the explicit instruction not to silently activate them). Applied once, at project-creation time, onto each new project's own fields (`createVideoProject` reads the settings and copies the defaults in) — verified that changing the default afterward never rewrites an already-created project's own saved value.

Data Management (Export All Data / Clear All Data) and the PDF-Enhanced Prompt feature from the old standalone tool were **not** rebuilt — Magnetix uses authenticated Firestore/Storage, not local browser data, so there's no ongoing product need for redundant backup/import/export, and the PDF prompt's exact content was never captured in the first place (spec §16). The Business Brain link stays exactly as Phase 1 built it — Business Brain itself is not duplicated into YTCS Settings.

## Dashboard / nav cleanup

The nav (`Dashboard`/`Video Workspace`/`Saved Ideas`/`Video Library`/`Settings`) was already the final structure from Phase 1 — no changes needed, and Archive was never added as a top-level nav item (it stays inside Video Library, per the original rejected-decision record). The Video Workspace project detail page's per-tab "coming in a later phase" lock state is now dead code (every step is built) and was removed — all six step tabs are plain, always-clickable buttons.

## Write safety

Saved Idea writes go through their own PATCH route (allowlisted to the 6 real idea fields) and never touch `ytcsVideos`. Video Library actions (rename/duplicate/archive/delete) use the same video PATCH/DELETE routes every earlier phase already established, extended with exactly one new field (`archived`). Settings changes write only to the new `ytcs/settings` doc, never to any individual project.

## QA result

eslint clean; `tsc --noEmit` shows **zero errors repo-wide** (no unrelated concurrent-session errors present in this check, unlike prior phases — the local production build still surfaced 3 known pre-existing, entirely untracked, concurrent-session billing/purchases errors, confirmed again via `git show HEAD:<path>` returning "not in HEAD"). Real Firestore QA (51/51 checks) via a temporary script: real Saved Ideas + Video Projects render compatibility, full Saved Idea CRUD (create/edit/duplicate) on a disposable idea, Turn Into Video (starting point/source material/traceability, source idea untouched), Video Library actions (rename/duplicate/archive/restore/delete, Published/Archived classification logic), YTCS Settings persistence (including the "changing the default doesn't rewrite existing projects" guarantee), a full disposable end-to-end workflow (Saved Idea → Turn Into Video → Input → Deep Dive → Script Prompt Builder → Final Script Draft → Create Video → Titles → Publish → Mark Published → Published classification, with every earlier step's data confirmed still present at the end), and a final integrity pass confirming all 15 real video projects, both real Saved Ideas, Business Brain, and every real Storage voice-note file were byte-identical/present before and after the entire QA run. Interactive browser/responsive QA was not performed (no authenticated browser session available) — disclosed as still owed, not claimed as done; the module is now feature-complete enough for the owner's own end-to-end visual QA pass.

**Mid-phase note on shared-repo safety:** this phase hit the same class of incident documented in the Phase 1 (`sidebar.tsx`) and Phase 3A addenda, twice — a concurrent session running its own `git stash push -u` ("set aside unrelated YTCS WIP for clean build check") swept this phase's uncommitted files off disk along with its own unrelated work, twice in a row. Both times, nothing was lost: the affected files were recovered by checking out just those paths from each stash's tracked and untracked-files commits, verified correct afterward, and each stash was left untouched for its original owner. After the second recovery, this phase's progress was captured in local-only safety commits (never pushed) so a third sweep couldn't cost any more work — the final commit for this phase supersedes those.

## Files changed

`src/types/ytcs.ts` (+`sourceIdeaId`, `archived`, `migratedFromExport`/`migratedAt` on `YtcsIdea`, new `YtcsSettings`), `src/lib/server/ytcs-service.ts` (+`getIdea`/`createIdea`/`updateIdea`/`deleteIdea`/`duplicateIdea`/`duplicateVideoProject`/`getYtcsSettings`/`updateYtcsSettings`, `createVideoProject` extended to accept extra fields and apply settings defaults), `src/app/api/sub-accounts/[id]/ytcs/ideas/route.ts` (+POST), `src/app/api/sub-accounts/[id]/ytcs/ideas/[ideaId]/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/ideas/[ideaId]/duplicate/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/ideas/[ideaId]/turn-into-video/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts` (PATCH allowlist +`archived`), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/duplicate/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/settings/route.ts` (new), `src/components/ytcs/idea-dialog.tsx` (new), the Saved Ideas/Video Library/Settings pages (full rebuilds), the project detail page (dead lock-state code removed), `src/components/ytcs/script-prompt-builder-step.tsx` (`SCRIPT_OUTPUT_TYPES` exported for reuse in Settings).

**YouTube Content Studio is now complete end to end. Only Content Alchemy Lab remains, per instruction.**

---

# In-App Script Generation (2026-09-02)

## Product decision and scope

Following the AI Capability Diagnostic (same date), the product decision was **approved**: YTCS can now generate the actual script inside Magnetix, calling the CRM's existing OpenRouter infrastructure. The deterministic Script Prompt Builder (`buildScriptPrompt()` — regular YouTube Video / Product Showcase / Signature Offer Video, Business Brain context, selected Stories + Proof, selected Frameworks, Script Output Type, Depth Preference) is **completely unchanged** — this feature only adds a new step after prompt assembly: the prompt is now optionally sent to the model server-side instead of requiring the user to copy it into an external AI tool. The original copy-paste prompt workflow (View/Copy Prompt) is preserved as a secondary, power-user path — not removed, not deprecated.

**This supersedes the original requirement that users must copy the prompt into an external AI tool to get a script** — that requirement was true through Phase 2 and the Final Completion Phase; it is no longer the only way, though it remains available.

## AI client — additive extension, no duplicate client

Reused `src/lib/comms/ai/openrouter.ts`'s `callAi()` directly (the same shared client used by SMS/WhatsApp/Meta/Voice/Web-chat AI Agents) rather than building a second OpenRouter client or duplicating request logic. Extended additively, backward-compatible for every existing caller:
- `AiCompletionResult` gained an optional `finishReason?: string` field (parses OpenRouter's `finish_reason` — `"length"` means the response was cut off by `maxTokens`). Existing callers that don't read this field are unaffected.
- `callAi()` gained an optional `timeoutMs` parameter (default 60s) using `AbortController` — the diagnostic found **no timeout/retry infrastructure existed anywhere** in the AI stack; a hung request would otherwise run until the platform's own function-duration ceiling. Applied to every caller (not just YTCS) since an unbounded AI request is a latent risk everywhere it's used, not something specific to script generation — existing callers (SMS replies typically complete in a few seconds) are unaffected in the success path.

No new package installed; no second client built.

## Model / configuration

`anthropic/claude-sonnet-4-6` — the same real, already-configured slug AI Suite uses for its Sonnet tier (`src/lib/ai-suite/model.ts`), reused as a literal constant rather than sharing that module's `aiSuiteModel()`/`AI_SUITE_MODEL` resolution — deliberately, so changing the AI Suite's model can never silently change YTCS's script-generation model too. Follows the same server-side-only, env-overridable idiom already established twice in this codebase (`defaultAiModel()` in `openrouter.ts`, `AI_SUITE_MODEL_SLUGS` in `ai-suite/model.ts`): a `YTCS_SCRIPT_MODEL` env var can override the constant deployment-wide; nothing client-supplied. `maxTokens: 6000` (diagnostic-justified: largest real Script Prompt ≈ 8,396 tokens, largest real Final Script Draft ≈ 2,703 tokens — 6,000 output tokens gives real-data-based headroom). `temperature: 0.7` (creative-writing-appropriate, vs. the Agents client's 0.5 SMS-reply default).

## `generate-script` route

`POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script` — same established pattern as `generate-script-prompt`/`generate-title-prompt`: `requireSubAccountMember` → load the project (tenant-scoped) → load Business Brain → `buildScriptPrompt()` unchanged → `callAi()` → persist. Writes **only** `generatedScript` + `generatedScriptMeta` via `updateVideoProject` — `compiledScript` (Final Script Draft) is never touched by this route, the same critical rule Script Prompt Builder and Titles already enforce for their own generated fields. A failed model call returns a 502 without ever calling `updateVideoProject` — the previous `generatedScript` (if any) is structurally untouched, not just conventionally preserved. `export const maxDuration = 100` (established precedent: `src/app/api/social/publish/step/route.ts` already sets `maxDuration = 300` on this deployment), comfortably above the 90s AI-call timeout used for this route specifically.

**Duplicate-generation guard**: a short-lived `generatingScriptSince` timestamp field on the project doc itself (not a job queue, not a rate-limiting platform) — set before the model call, cleared in a `finally` block regardless of outcome. A lock older than 2 minutes is treated as stale (e.g. a crashed request) and never permanently blocks the project. Client-side, the Generate/Regenerate button is disabled while a generation is in flight, matching the established `disabled={loading}` convention already used throughout YTCS and the AI Suite chat panel.

**Failure handling**: provider non-200, empty response, and malformed response all already threw inside `callAi()` before this phase; timeout now throws a clear `AbortError`-derived message (new). All are caught by the route's try/catch and returned as a generic, retryable 502 — no elaborate retry infrastructure was built, matching the explicit instruction that a clear retryable UI error is acceptable for v1.

## `generatedScript` persistence — smallest safe implementation (Option A)

New `generatedScript?: string` field, completely separate from `compiledScript`. This is the **third instance** of a pattern YTCS already ships twice (`generatedScriptPrompt` never auto-writes `compiledScript`; `generatedTitlePrompt` never auto-writes `selectedTitle`/`backupTitle`) — not a new architecture. Regeneration replaces `generatedScript` only after a successful call; never touches `compiledScript`. `generatedScript` is user-editable (added to the general PATCH route's allowlist) — edits save independently of generation, matching the existing Final Script Draft textarea's own save convention. `generatedScriptMeta` (model, token counts, `finishReason`, `truncated`, `generatedAt`) and `generatingScriptSince` (the duplicate-generation lock) are **not** in the general PATCH allowlist — both are written only by the dedicated route, server-side, never by a client-supplied body. Version history (Option C) was explicitly not built — no version/history infrastructure exists anywhere in Magnetix to build on, and the task explicitly discouraged over-engineering this.

## Truncation protection

`finishReason === "length"` is checked both server-side (returned to the client as `truncated: true` in the route response) and persisted (`generatedScriptMeta.truncated`, so the warning survives a page refresh, not just the immediate generation). The UI shows the full returned partial script (never hidden) plus a clear, unmissable warning banner: *"This script may be incomplete because the generation reached its output limit."* Never silently presented as complete. No automatic continuation/concatenation was built (explicitly deferred — "Continue Generation" is a future consideration, not this pass).

**This was verified against a real truncation** — the one controlled real AI call in this phase's QA (see below) genuinely returned `finish_reason: "length"` (a deliberately small `maxTokens: 300` was used for the QA call to keep token consumption modest), proving the truncation-detection path end to end against real provider behavior, not a mocked fixture.

## Use as Final Script Draft

An explicit user action only — never automatic. If `compiledScript` is empty, writes directly. If `compiledScript` already has content, a client-side `confirm()` dialog ("You already have a Final Script Draft. Replace it with the Generated Script?") gates the write — declining leaves `compiledScript` completely unchanged. Reuses the exact `confirm()` pattern already established for Delete actions elsewhere in YTCS (Saved Ideas, Video Library) — no new confirmation-UI component built.

## Usage telemetry — smallest new addition, not a cost system

Neither existing usage pattern fit the requirement exactly: `incrementChannelTokens` (AI Agents) is a single cumulative lifetime counter with no per-event detail; `recordAiSuiteUsage` (AI Suite) is a daily `{messages, actions}` bucket with no tokens/model/status. Since "record useful telemetry for every generation" needs per-event detail (model, tokens, status), a small new subcollection was added — `subAccounts/{id}/ytcsScriptGenerations/{autoId}` — one doc per generation attempt: `subAccountId`, `videoId`, `feature: "ytcs_script_generation"`, `model`, `promptTokens`/`completionTokens`/`totalTokens` (null when not available, e.g. on a failed call — never invented), `status` (`"success"` / `"failed"` / `"truncated"`), `generatedAt` (server timestamp). Fire-and-forget (matches `recordAiSuiteUsage`'s "best-effort, never blocks" convention) — a telemetry write failure only logs a warning, never breaks the user-facing response. **No dollar-cost calculation, no credits, no billing tiers, no usage limits were built** — explicitly deferred per instruction; this is real-usage evidence for a future pricing/cost decision, not a cost system itself.

## Streaming — not built, per instruction

Confirmed again (same diagnostic finding): no real token-level streaming exists anywhere in Magnetix. Not built in this pass, per explicit instruction. The UI shows a clear "Generating…" state (spinner + "Writing your script…" copy, matching the AI Suite chat panel's existing loading convention) for the duration of the non-streaming request/response.

## Script Prompt Builder UX

**Primary action**: "Generate Script" (Regenerate once one exists). **Generated Script panel**: appears once a script exists or a generation is in flight — editable textarea, Copy, Regenerate, Save Edits, Use as Final Script Draft, plus the truncation warning banner when applicable. **Secondary/power-user path**: the original "Build Script Prompt" + "Copy Prompt" + read-only prompt textarea now live behind a collapsible "Prefer your own AI tool? View or copy the prompt instead" disclosure — same functionality, same routes, same fields, just visually demoted rather than removed. The Final Script Draft section at the bottom is unchanged in behavior, only its copy was updated to mention "Use as Final Script Draft" as the other way content arrives there.

## Real-project compatibility

All three prompt types (regularYouTubeVideo, productShowcase, signatureOfferVideo) were verified to flow through the new architecture via deterministic assembly QA (no live AI call needed to prove the plumbing for all three — `buildScriptPrompt()` itself is completely unchanged from Phase 2, already proven correct there). One controlled real AI call (regularYouTubeVideo / brain_dump shape, on a disposable QA project) proved the full live path end to end.

## QA result

eslint clean on all touched files; `tsc --noEmit` clean (only the same pre-existing, entirely untracked, concurrent-session billing/purchases errors present, confirmed via `git show HEAD:<path>` returning "not in HEAD"). Non-destructive assembly QA for all 3 prompt types (8/8 checks). One controlled real AI call against a disposable QA project (27/28 checks passed — the single failure was this session's own QA-script assumption that a short brain_dump prompt would be "small" by character count, which real usage disproved: the fixed Business Brain context makes even a tiny input ~2,878 real tokens, still well within budget — not a system defect, confirmed by every other check in the same run passing, including the real generation itself). Verified end to end against real provider behavior: successful generation, persistence (`generatedScript` + `generatedScriptMeta` including real token usage and a real `finish_reason`), regeneration (replaces `generatedScript`, never touches `compiledScript`), a genuine real truncation (`finish_reason: "length"` from a deliberately small QA `maxTokens: 300`), a simulated failed-generation-does-not-erase-previous-script case, Use as Final Script Draft (empty-case direct write; non-empty-case confirmation-gated), and full sentinel preservation (`generatedScriptPrompt`, `deepDiveAnswers`, `legacy` all untouched). All 15 real video projects and all usage-telemetry QA docs confirmed clean afterward (0 residue, 0 real projects touched). Interactive browser QA was not performed (no authenticated browser session available) — disclosed as still owed; the owner can visually QA the feature in her existing authenticated CRM session.

## Files changed

`src/lib/comms/ai/openrouter.ts` (`AiCompletionResult` +`finishReason`, `callAi()` +`timeoutMs`/`AbortController`), `src/types/ytcs.ts` (+`generatedScript`, `generatedScriptMeta`, `generatingScriptSince`), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script/route.ts` (new), `src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/route.ts` (PATCH allowlist +`generatedScript`), `src/components/ytcs/script-prompt-builder-step.tsx` (Generate Script primary action, Generated Script panel, secondary/power-user prompt disclosure).

**In-App Script Generation is complete and live in production.** Content Alchemy Lab remains untouched, per instruction.
