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

**Phase 0 (import architecture + data rescue) is COMPLETE.** The owner's real Channel Brain, 2 Saved Ideas, and 15 Video Projects are live in Firestore under `subAccounts/xvnedVCmQpEvHrcPhEDI` ("Main"), with all 7 real voice recordings migrated to Firebase Storage. Full read-back reconciliation against the source export passed (967 field-level checks; the 2 that initially appeared to fail were both confirmed, by direct inspection, to be artifacts of the verification script's own comparison method, not real discrepancies — see the Phase 0 addendum). Idempotency was proven with a real second live run: identical Firestore doc counts, zero duplicate Storage objects. No Channel Brain/Video Workspace UI, no navigation, and no Phase 1 work has started. See the Phase 0 addendum at the end of this document for the full importer spec, dry-run findings, and final reconciliation results.

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

## UNRESOLVED DECISIONS

Kept genuinely open — see §20 for full detail:

1. Whether to rebuild the partially-designed in-app structured script sub-flow (`hookOptions`, `expectationSetup`, `earlyCtaType`, `generatedOutline`, `dominantPositioning`/`secondaryPositioning`, `topicClarity`) as an active feature, or preserve it as read-only legacy data only.
2. The exact backend mechanism/prompt behind the one confirmed real internal AI call (Deep Dive Questions) — not recoverable from any of the three sources; must be newly designed.
3. Whether `communityPost` is a standalone Publish-step field or belongs to a future Content Alchemy Lab / Social Planner integration.
4. Whether "Balanced" and "Concise" Depth Preference values (asserted only by the dossier) are real, ever-shipped options or aspirational.
5. Whether voice-note transcription is genuinely implemented anywhere (no transcript text was found attached to any of the 7 real voice-note recordings in the export).

## DATA MIGRATION STATUS

**Live migration executed 2026-09-01 against `subAccounts/xvnedVCmQpEvHrcPhEDI` ("Main").** Written: 1 Channel Brain (`ytcs/brain`), 2 Saved Ideas (`ytcsIdeas/{id}`), 15 Video Projects (`ytcsVideos/{id}`), 7 voice-note audio files in Firebase Storage under `ytcs/xvnedVCmQpEvHrcPhEDI/voice-notes/{voiceNoteId}.webm` with only Storage references (never inline base64) left on the Firestore records. Full read-back verification against the source export passed. Rerun idempotency proven directly (a second live run produced identical Firestore doc counts and exactly 7 Storage objects, not 14). The original export file (`~/Downloads/youtube-studio-backup-2026-09-01.json`) is unmodified — md5 confirmed identical before and after every run. Full results in the Phase 0 addendum.

## NEXT APPROVED TASK

None yet. Phase 0 is done; Phase 1 (Channel Brain UI) has no approval and should not start automatically.

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
