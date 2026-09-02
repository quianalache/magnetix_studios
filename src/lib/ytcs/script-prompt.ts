import type { BusinessBrain, BusinessBrainFramework, BusinessBrainStory } from "@/types/business-brain";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Script Prompt Builder — deterministic template assembly, matching the
 * migration spec's documented behavior exactly (§9). This produces a
 * copy-paste prompt for an external AI tool; it never calls an AI model
 * itself and never writes the user's script. No OpenRouter usage here.
 *
 * Every section is OMITTED (not printed empty/undefined) when its source
 * data doesn't exist — the historical "undefined"/"[object Object]"
 * defect must not return (migration spec §11's Null/Empty Safety).
 *
 * VERIFIED vs ADAPTED, tracked per section:
 * - The regular-video opening, "YouTube Script Method", "Momentum
 *   Transitions", "Return Structure", and "Style Rules" sections are
 *   VERIFIED verbatim from a live capture of the real app (migration
 *   spec §9).
 * - The Product Showcase / Signature Offer Video openings and their own
 *   method step lists are VERIFIED verbatim from the original ChatGPT
 *   build dossier (migration spec §9, labeled "EXACT / FINAL APPROVED"
 *   there).
 * - "How To Use This Context" and "Style Rules" are reused across all 3
 *   prompt types — the dossier describes both generically, not scoped to
 *   the regular-video format specifically (migration spec §9's own "How
 *   To Use This Context" section applies its bullet list the same way
 *   regardless of video type).
 * - Momentum Transitions and a from-scratch Return Structure were NOT
 *   independently captured for Product Showcase / Signature Offer — see
 *   `buildReturnStructureSection`'s own doc comment for exactly what's
 *   reused vs. adapted there, and the migration spec's Phase 2 addendum
 *   for the same disclosure.
 */

export type YtcsPromptType = "regularYouTubeVideo" | "productShowcase" | "signatureOfferVideo";

export interface ScriptPromptContext {
  project: YtcsVideoProject;
  businessBrain: BusinessBrain | null;
  selectedStories: BusinessBrainStory[];
  selectedFrameworks: BusinessBrainFramework[];
}

function nonEmpty(v: string | undefined | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function promptTypeFor(project: YtcsVideoProject): YtcsPromptType {
  if (project.startingPointType === "productOffer") {
    return project.productOfferInput?.productOfferVideoFormat === "productShowcase"
      ? "productShowcase"
      : "signatureOfferVideo";
  }
  return "regularYouTubeVideo";
}

const STARTING_POINT_LABELS: Record<string, string> = {
  brain_dump: "Brain Dump",
  conversation: "Coaching Call / Client Conversation",
  short_form: "Short-Form Post",
  story: "Story Bank",
  framework: "Framework",
  productOffer: "Product / Offer",
};

/**
 * Source Material section — renders cleanly per starting point (migration
 * spec's explicit requirement). Never prints undefined/null/empty labels;
 * a starting point with nothing populated yet is simply omitted from the
 * rendered block below its own heading rather than showing a blank line.
 */
function buildSourceMaterialSection(project: YtcsVideoProject): string {
  const label = STARTING_POINT_LABELS[project.startingPointType ?? ""] ?? "Untitled";
  const lines = ["SOURCE MATERIAL", "", `Starting Point: ${label}`, ""];

  if (project.startingPointType === "story") {
    if (nonEmpty(project.storyName)) lines.push(`Story: ${project.storyName}`);
    if (nonEmpty(project.storyType)) lines.push(`Story Type: ${project.storyType}`);
    if (nonEmpty(project.storyProblem)) lines.push("", "Problem:", project.storyProblem);
    if (nonEmpty(project.storyPursuit)) lines.push("", "Pursuit:", project.storyPursuit);
    if (nonEmpty(project.storyPayoff)) lines.push("", "Payoff:", project.storyPayoff);
    if (nonEmpty(project.storyLesson)) lines.push("", "Key Lesson:", project.storyLesson);
  } else if (project.startingPointType === "framework") {
    const f = project.framework;
    if (f?.name) lines.push(`Framework: ${f.name}`);
    if (f?.type) lines.push(`Framework Type: ${f.type}`);
    if (nonEmpty(f?.helpDo)) lines.push("", "What This Framework Helps People Do:", f.helpDo!);
    if (nonEmpty(f?.steps)) lines.push("", "Main Steps:", f.steps!);
  } else if (project.startingPointType === "productOffer") {
    const offer = project.productOfferInput?.selectedOfferDetails;
    const format = project.productOfferInput?.productOfferVideoFormat;
    if (offer?.name) lines.push(`Offer: ${offer.name}`);
    if (nonEmpty(format)) {
      lines.push(`Format: ${format === "productShowcase" ? "Product Showcase" : "Signature Offer Video"}`);
    }
    if (nonEmpty(offer?.transformation)) lines.push("", "Transformation:", offer.transformation!);
    if (nonEmpty(offer?.problem)) lines.push("", "Problem This Offer Solves:", offer.problem!);
    if (nonEmpty(project.productOfferDeepDiveAnswers)) {
      lines.push("", "Product / Offer Deep Dive Answers:", project.productOfferDeepDiveAnswers!);
    }
  } else {
    if (nonEmpty(project.selectedInputQuestion)) {
      lines.push(`Prompt Question Answered: ${project.selectedInputQuestion}`);
    }
    if (nonEmpty(project.shortFormType)) lines.push(`Short-Form Type: ${project.shortFormType}`);
    if (nonEmpty(project.rawTranscript)) {
      lines.push("", "Raw Input / Transcript / Notes:", project.rawTranscript);
    }
  }

  if (nonEmpty(project.deepDiveAnswers)) {
    lines.push("", "Deep Dive Answers:", project.deepDiveAnswers);
  }

  return lines.join("\n").trimEnd();
}

/**
 * VERIFIED verbatim (migration spec §9) — reused for all 3 prompt types.
 * The dossier's own "How To Use This Context" section is written
 * generically (not regular-video-scoped), so reuse here is spec-faithful,
 * not an invention. The one line naming "a regular YouTube video" is
 * skipped for Product Showcase/Signature Offer, since that framing is
 * specific to the regular-video case and a Product/Offer video isn't one.
 */
function buildHowToUseContextSection(ctx: ScriptPromptContext, promptType: YtcsPromptType): string {
  const lines = [
    "HOW TO USE THIS CONTEXT",
    "",
    "Use the Source Material as the raw material for the video.",
    "Do not ignore it.",
    "Do not replace it with generic advice.",
    "Use it to identify:",
    "The core idea",
    "The strongest tension",
    "The most useful teaching points",
    "The natural story or proof moments",
    "The main viewer shift",
    "The most relevant examples",
    "",
    "If the Source Material is messy, organize it.",
    "If the Source Material is too thin, write \"Needs more detail\" and explain what is missing.",
    "",
  ];

  if (promptType === "regularYouTubeVideo") {
    lines.push(
      "Because this is a regular YouTube video, use the context to create a strong teaching, storytelling, belief-shifting, or authority-building video.",
    );
  }

  const brain = ctx.businessBrain;
  if (nonEmpty(brain?.audience?.help) || nonEmpty(brain?.audience?.struggling)) {
    lines.push("Use Audience context to make the hook and teaching feel specific.");
  }
  if (nonEmpty(project(ctx).deepDiveAnswers) || nonEmpty(project(ctx).productOfferDeepDiveAnswers)) {
    lines.push("Use Deep Dive answers to find the real video underneath the raw idea.");
  }
  if (nonEmpty(brain?.voice?.sound) || nonEmpty(brain?.voice?.tone)) {
    lines.push("Use Brand Voice to make the script sound like the creator.");
  }
  if (ctx.selectedStories.length > 0) {
    lines.push("Use selected Stories + Proof to make the video more credible and memorable.");
  }
  if (ctx.selectedFrameworks.length > 0) {
    lines.push("Use selected Frameworks to organize the teaching when helpful.");
  }
  const hasOffer = !!ctx.project.productOfferInput?.selectedOfferId;
  if (hasOffer) {
    lines.push("Use Offer / CTA Context only if it was selected.");
    lines.push("If an offer was selected, weave it in naturally.");
  }
  if (promptType === "regularYouTubeVideo") {
    lines.push(
      "Do not make a normal YouTube video feel like a heavy sales video unless the project type calls for it.",
    );
  }

  return lines.join("\n").trimEnd();
}

function project(ctx: ScriptPromptContext): YtcsVideoProject {
  return ctx.project;
}

/**
 * VERIFIED verbatim (migration spec §9), regular video only.
 */
const REGULAR_METHOD_STEPS = `1. Hook Options

Create 3 hook options that match the actual video context.

The hook should create immediate recognition, curiosity, tension, relief, or desire.

Avoid generic hooks.

2. Recommended Hook

Choose the strongest hook and briefly explain why it fits the viewer, topic, and video goal.

3. Anchor & Expectation Setup

After the hook, ground the viewer.

Clarify what this video is really about, why it matters, and what the viewer will understand by the end.

Do not over-explain.

Do not make this sound like a school essay introduction.

4. Early Light CTA, only if natural

If an offer or next step is provided, include a light early CTA only if it fits naturally.

This should not interrupt the video.

It can be soft and conversational.

If no offer or CTA context exists, skip this.

5. Deep Dive / Teaching Body

Build the main body around 2 to 4 strong points.

For each point, include:

Point title
Viewer tension
Creator point of view
Teaching notes
Story, proof, or framework integration if selected
Viewer shift
Momentum transition to the next point

The body should not feel like random tips.

Each point should move the viewer toward a clearer belief, decision, or understanding.

6. Main CTA

If an offer or next step was provided, create a clear CTA that feels connected to the video.

The CTA should feel like the natural next step, not a random pitch.

If no offer or CTA was provided, create a general engagement CTA or write "Needs CTA detail" if a specific CTA is clearly needed.

7. Watch This Next Setup

Include a YouTube-native watch-next bridge if it fits.

The watch-next bridge should make the viewer want to continue watching another related video.

It should not feel like an abrupt ending.

8. Final Draft

Create the final draft based on the selected Script Output Type and Depth Preference.

9. Recording Notes

Add notes for delivery, pacing, emphasis, energy, examples, and places where the creator should slow down or let a point breathe.`;

/** VERIFIED verbatim (migration spec §9's dossier-sourced method list),
 *  formatted here as numbered steps matching the regular method's shape. */
const PRODUCT_SHOWCASE_METHOD_STEPS = `1. Relatable viewer struggle hook
2. Remove shame or pressure
3. Name the hidden missing piece
4. Teach the framework or concept before showing the product
5. Challenge the old model or common advice
6. Establish creator credibility
7. Introduce the product as the natural solution
8. Show what is inside
9. Connect each product feature to viewer value
10. Use proof where available
11. Restate the transformation
12. Address hesitation naturally
13. Make the CTA clear
14. Optional secondary next step
15. YouTube-friendly close`;

/** VERIFIED verbatim (migration spec §9's dossier-sourced method list). */
const SIGNATURE_OFFER_METHOD_STEPS = `1. Relatable tension or exhaustion hook
2. Simple thesis or core mechanism
3. Problem layering
4. Reframe the real issue
5. Lived authority or founder credibility
6. Proof layering throughout the video
7. Teach the new model or better way
8. Explain why the new model works
9. Introduce the offer as the implementation path
10. Explain the offer clearly
11. Address objections naturally
12. Who this is for / not for, only if natural
13. Relational CTA
14. YouTube-friendly close`;

/**
 * VERIFIED verbatim (migration spec §9), regular video only — no
 * equivalent was independently captured for the other 2 formats, so it
 * is not printed for those (omitted rather than guessed).
 */
const MOMENTUM_TRANSITIONS_SECTION = `MOMENTUM TRANSITIONS

Between each major section, include momentum transitions.

Momentum transitions are the small re-hooks between sections.

They should:

Connect what came before to what comes next
Remind the viewer why the next section matters
Create curiosity for what comes next
Keep the video from feeling like disconnected points
Help the viewer stay oriented and emotionally engaged

Momentum transitions should move the viewer between teaching points, story moments, belief shifts, and the CTA.

Avoid transition phrases like:

Now that you understand everything…
So that's it…
Now you know everything you need…

Use transitions that move the viewer forward.`;

/**
 * Return Structure — VERIFIED verbatim for the regular video. For
 * Product Showcase / Signature Offer Video, no distinct Return Structure
 * text was independently captured; rather than invent one from nothing,
 * this reuses the SAME shape (outline first, then CTA/proof plan, then
 * final draft, then recording notes) which the dossier states as a
 * requirement for prompt generation generally ("Prompt should include:
 * ...return structure" — not scoped to one format), adapted only to name
 * the correct method by title. This is disclosed as an adaptation, not
 * claimed as a separate verbatim capture.
 */
function buildReturnStructureSection(promptType: YtcsPromptType): string {
  if (promptType === "regularYouTubeVideo") {
    return `RETURN STRUCTURE

1. Hook Options

Generate 3 hook options.

Each hook should create immediate recognition, tension, curiosity, relief, or desire.

2. Recommended Hook

Choose the strongest hook and explain why it fits this viewer, video, and goal.

3. Strategic Video Flow

Give the full section-by-section outline before writing the draft.

For each section, include:

Section Title
Purpose of This Section
Key Point
Story, Proof, or Framework to Use, if available
Offer Connection, if relevant
Momentum Transition

4. CTA Plan

If offer or CTA context exists, explain how the CTA should show up and why it belongs there. If no CTA context exists, suggest the most natural CTA type based on the video.

5. Proof Integration Plan

If stories or proof were selected, identify where they should appear throughout the video. Use only provided proof. If proof is missing but the video would benefit from proof, name what type of proof would help.

6. Final Draft

Create the final draft based on the selected Script Output Type and Depth Preference.

7. Recording Notes

Add notes for delivery, pacing, emphasis, examples, screen share moments if relevant, and places where the creator should slow down, add energy, or let a point breathe.`;
  }

  const methodName = promptType === "productShowcase" ? "Product Showcase Method" : "Signature Offer Video Method";
  return `RETURN STRUCTURE

1. Strategic Video Flow

Give the full section-by-section outline before writing the draft, following the ${methodName} above.

For each section, include:

Section Title
Purpose of This Section
Key Point
Proof or Credibility Moment to Use, if available
Offer Connection

2. Proof Integration Plan

Identify where proof, credibility, or testimonials should appear throughout the video. Use only the proof actually provided. If proof is missing but the video would benefit from it, name what type of proof would help.

3. CTA Plan

Explain how the CTA should show up and why it belongs where it does.

4. Final Draft

Create the final draft based on the selected Script Output Type and Depth Preference.

5. Recording Notes

Add notes for delivery, pacing, emphasis, examples, and places where the creator should slow down, add energy, or let a point breathe.`;
}

/** VERIFIED verbatim (migration spec §9) — the dossier's Style Rules are
 *  written generically, not regular-video-scoped, so reused as-is. */
const STYLE_RULES_SECTION = `STYLE RULES

Do not write generic advice.
Do not invent proof, results, numbers, testimonials, revenue, client stories, screenshots, or claims.
Do not use bracketed placeholders like [insert story here].
Do not over-polish the creator's voice.
Do not flatten the creator's personality.
Do not turn this into a blog post.
Do not make every section sound like a formal section heading when spoken aloud.
Use the Brand Voice context if available.
Make the script conversational, clear, emotionally specific, and useful.
Make the script feel like it belongs on YouTube.
Make the CTA feel connected to the video.
If something important is missing, write "Needs more detail" and explain exactly what is missing.`;

const OPENINGS: Record<YtcsPromptType, string> = {
  // VERIFIED verbatim — migration spec §9.
  regularYouTubeVideo: `You are helping me create a strong YouTube script draft.

Use the video context I provide below to create a natural, on-camera YouTube script.

This should feel like a real video, not a blog post, essay, or generic content outline.

Use the source material, Deep Dive answers, Channel Brain context, selected stories/proof, selected frameworks, offer context if provided, and extra script notes to shape the video.

The script should be useful, specific, conversational, and aligned with the creator's voice.

Do not invent unsupported details.
Do not write generic advice.
Do not over-polish the creator's voice.
Do not flatten the creator's personality.
Do not turn this into a blog post.
Do not use bracketed placeholders like [insert story here].
If something important is missing, write "Needs more detail" and tell me exactly what is missing.`,
  // VERIFIED verbatim — migration spec §9, dossier "EXACT / FINAL APPROVED".
  productShowcase: `You are helping me create a YouTube-native Product Showcase Video.

This is not a generic product demo.

This is not just a screen recording of what is inside the product.

The goal is to create a useful YouTube video that teaches, shifts a belief, builds the need for the product, and then shows how the product helps.

The viewer should understand the problem before the product appears.

The product should feel like the natural solution to the tension, frustration, or desire introduced earlier in the video.

This video should feel conversational, specific, human, and valuable even before the product is shown.`,
  // VERIFIED verbatim — migration spec §9, dossier "EXACT / FINAL APPROVED".
  signatureOfferVideo: `You are helping me create a YouTube-native Signature Offer Video.

This is not a standard teaching video with a quick CTA at the end.

The goal is to create a video that teaches, builds trust, layers the viewer's real problems, shifts the viewer's beliefs, explains why the offer exists, uses proof throughout, and makes the offer feel like the natural next step.

This video should still feel like useful YouTube content. It should feel human, conversational, emotionally specific, and valuable even before the offer is introduced.

But it should also spend more time on the offer than a normal YouTube video would.

The offer should not be saved for the last 30 seconds. The offer should become part of the substance of the video once the viewer understands the problem, the belief shift, and the better way forward.`,
};

const METHOD_TITLES: Record<YtcsPromptType, string> = {
  regularYouTubeVideo: "YOUTUBE SCRIPT METHOD",
  productShowcase: "PRODUCT SHOWCASE METHOD",
  signatureOfferVideo: "SIGNATURE OFFER VIDEO METHOD",
};

const METHOD_STEPS: Record<YtcsPromptType, string> = {
  regularYouTubeVideo: REGULAR_METHOD_STEPS,
  productShowcase: PRODUCT_SHOWCASE_METHOD_STEPS,
  signatureOfferVideo: SIGNATURE_OFFER_METHOD_STEPS,
};

function buildScriptSettingsSection(project: YtcsVideoProject): string {
  const lines: string[] = [];
  const outputType = project.scriptOutputType || "Structured Recording Draft";
  const depth = project.depthPreference || "Detailed";

  lines.push(`SCRIPT OUTPUT TYPE:\n${outputType}`, "", `DEPTH PREFERENCE:\n${depth}`);

  // VERIFIED verbatim, Detailed only — Balanced/Concise have no verified
  // instruction text (migration spec's Depth Preference discrepancy,
  // still unresolved — see the Phase 2 addendum). Only "Detailed" is
  // exposed as a selectable option in the UI for the same reason.
  if (depth === "Detailed") {
    lines.push(
      "",
      "Err on the side of giving me more depth, language, examples, transitions, and usable phrasing than less. I can condense a rich draft later. Do not give me thin content unless I specifically selected Talking Point Outline.",
    );
  }

  // VERIFIED verbatim, Structured Recording Draft only — no verified
  // description text exists for the other 3 real Script Output Type
  // values, so nothing is printed for those rather than guessed.
  if (outputType === "Structured Recording Draft") {
    lines.push(
      "Create a structured recording draft with clear sections, strong phrasing, key talking points, suggested lines, and recording notes. It should support natural delivery without feeling like a rigid teleprompter script.",
    );
  }

  return lines.join("\n");
}

function buildScriptIngredientsSection(ctx: ScriptPromptContext): string {
  const brain = ctx.businessBrain;
  const parts: string[] = [];

  if (nonEmpty(brain?.audience?.help) || nonEmpty(brain?.audience?.struggling)) {
    const a = brain!.audience!;
    const audienceLines = [
      nonEmpty(a.help) && `Who I Help: ${a.help}`,
      nonEmpty(a.struggling) && `What They Are Struggling With: ${a.struggling}`,
      nonEmpty(a.want) && `What They Want Instead: ${a.want}`,
      nonEmpty(a.objections) && `Objections: ${a.objections}`,
    ].filter(Boolean);
    if (audienceLines.length) parts.push("AUDIENCE\n\n" + audienceLines.join("\n"));
  }

  if (nonEmpty(brain?.voice?.sound) || nonEmpty(brain?.voice?.tone) || nonEmpty(brain?.voice?.wordsAvoid)) {
    const v = brain!.voice!;
    const voiceLines = [
      nonEmpty(v.sound) && `How My Content Should Sound: ${v.sound}`,
      nonEmpty(v.tone) && `Tone: ${v.tone}`,
      nonEmpty(v.wordsOften) && `Words/Phrases I Use Often: ${v.wordsOften}`,
      nonEmpty(v.wordsAvoid) && `Words/Phrases to Avoid: ${v.wordsAvoid}`,
      nonEmpty(v.rules) && `Style Rules: ${v.rules}`,
    ].filter(Boolean);
    if (voiceLines.length) parts.push("BRAND VOICE\n\n" + voiceLines.join("\n"));
  }

  if (nonEmpty(brain?.vision?.statement) || nonEmpty(brain?.vision?.believe)) {
    const vi = brain!.vision!;
    const visionLines = [
      nonEmpty(vi.statement) && `Creator Vision: ${vi.statement}`,
      nonEmpty(vi.believe) && `What I Believe: ${vi.believe}`,
      nonEmpty(vi.transformation) && `Transformation: ${vi.transformation}`,
    ].filter(Boolean);
    if (visionLines.length) parts.push("CREATOR VISION\n\n" + visionLines.join("\n"));
  }

  const offer = ctx.project.productOfferInput?.selectedOfferDetails;
  if (offer?.name) {
    const offerLines = [
      `Offer: ${offer.name}`,
      nonEmpty(offer.transformation) && `Transformation: ${offer.transformation}`,
      nonEmpty(offer.problem) && `Problem It Solves: ${offer.problem}`,
      nonEmpty(offer.when) && `When to Mention: ${offer.when}`,
    ].filter(Boolean);
    parts.push("OFFER / CTA CONTEXT\n\n" + offerLines.join("\n"));
  }

  if (ctx.selectedStories.length) {
    const storyBlocks = ctx.selectedStories.map((s) => {
      const sl = [
        `${s.name || "(untitled story)"}`,
        nonEmpty(s.problem) && `Problem: ${s.problem}`,
        nonEmpty(s.pursuit) && `Pursuit: ${s.pursuit}`,
        nonEmpty(s.payoff) && `Payoff: ${s.payoff}`,
        nonEmpty(s.lesson) && `Key Lesson: ${s.lesson}`,
      ].filter(Boolean);
      return sl.join("\n");
    });
    parts.push("STORIES + PROOF\n\n" + storyBlocks.join("\n\n"));
  }

  if (ctx.selectedFrameworks.length) {
    const frameworkBlocks = ctx.selectedFrameworks.map((f) => {
      const fl = [
        `${f.name || "(untitled framework)"}${f.type ? ` (${f.type})` : ""}`,
        nonEmpty(f.helpDo) && `What It Helps People Do: ${f.helpDo}`,
        nonEmpty(f.steps) && `Steps: ${f.steps}`,
      ].filter(Boolean);
      return fl.join("\n");
    });
    parts.push("FRAMEWORKS\n\n" + frameworkBlocks.join("\n\n"));
  }

  if (nonEmpty(ctx.project.scriptBuilderExtraNotes)) {
    parts.push("EXTRA SCRIPT NOTES (high priority)\n\n" + ctx.project.scriptBuilderExtraNotes);
  }

  return parts.join("\n\n");
}

/**
 * Assembles the full, fully-resolved Script Prompt. Sections with no
 * populated data are omitted entirely — never printed as an empty
 * heading or a placeholder.
 */
export function buildScriptPrompt(ctx: ScriptPromptContext): string {
  const promptType = promptTypeFor(ctx.project);

  const blocks: string[] = [OPENINGS[promptType]];

  blocks.push(buildScriptSettingsSection(ctx.project));
  blocks.push(buildSourceMaterialSection(ctx.project));
  blocks.push(buildHowToUseContextSection(ctx, promptType));

  const ingredients = buildScriptIngredientsSection(ctx);
  if (nonEmpty(ingredients)) blocks.push(ingredients);

  blocks.push(`${METHOD_TITLES[promptType]}\n\nUse this structure to build the video:\n\n${METHOD_STEPS[promptType]}`);

  if (promptType === "regularYouTubeVideo") {
    blocks.push(MOMENTUM_TRANSITIONS_SECTION);
  }

  blocks.push(buildReturnStructureSection(promptType));
  blocks.push(STYLE_RULES_SECTION);

  return blocks.filter(nonEmpty).join("\n\n");
}
