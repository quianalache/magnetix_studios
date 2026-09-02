/**
 * Deep Dive question sets — reconstructed from REAL data, not the live
 * audit's UI capture alone. A Phase 2 investigation across all 15 real
 * migrated projects' `generatedDeepDiveQuestions` found 3 distinct real
 * sets, which resolves what the migration spec had left as an unresolved
 * "unknown AI mechanism" question: the mechanism is unknown, but its
 * OUTPUT for the dominant case is not — see the per-export notes below.
 *
 * Per instruction: use the fixed/final set directly rather than call an
 * AI model to reproduce it. No OpenRouter call is made for Deep Dive
 * questions in Phase 2.
 */

/**
 * GENERIC_DEEP_DIVE_QUESTIONS — used for Brain Dump, Coaching Call /
 * Client Conversation, Short-Form Post, Story Bank, and Framework.
 *
 * VERIFIED: this exact 9-question set, in this exact order, was found on
 * 6 of the real migrated projects (spanning brain_dump, conversation,
 * framework, and even one productOffer/signatureOfferVideo project) AND
 * independently reproduced live during the original migration audit
 * against a completely different, unique test input — 7 independent
 * observations total, all byte-identical. This is the dominant, highest-
 * confidence real set and is implemented as the canonical one.
 *
 * One real project (a single brain_dump instance) had a different
 * 7-question set instead — a genuine historical variant, not adopted
 * here since it was observed only once against this set's 7 independent
 * confirmations. That project's own saved questions are preserved
 * read-only on its own record; this list is not used to overwrite it.
 */
export const GENERIC_DEEP_DIVE_QUESTIONS = [
  "What is the viewer's real problem underneath the surface symptom?",
  "What do they currently believe that is actually holding them back?",
  "What is the one thing they need to realize before they can trust your approach?",
  "What is your honest point of view on this topic that most people are afraid to say?",
  "What is a story, example, or metaphor that makes this concept feel visceral?",
  "What should be said directly in this video, and what should be left unsaid?",
  "Where does the CTA naturally belong in this conversation?",
  "What do you want the viewer to believe about themselves by the end of the video?",
  "What is the deeper cause underneath the surface problem?",
];

/**
 * SIGNATURE_OFFER_DEEP_DIVE_QUESTIONS — for Product/Offer projects with
 * `productOfferVideoFormat === "signatureOfferVideo"`.
 *
 * VERIFIED: this exact 10-question set was found intact on one real
 * migrated signatureOfferVideo project, AND cross-confirmed by a second,
 * independent real project whose actually-typed answer began "Question
 * 5: What belief needs to shift before this offer makes sense?" — an
 * exact match to item 5 below, on a different project than the one the
 * full list came from.
 */
export const SIGNATURE_OFFER_DEEP_DIVE_QUESTIONS = [
  "What surface problem does the viewer think they have?",
  "What is the deeper problem underneath that surface problem?",
  "What have they already tried, and why has it not fully worked?",
  "What are the connected problems this video needs to layer together?",
  "What belief needs to shift before this offer makes sense?",
  "What makes your approach, process, or offer different from what they have already seen?",
  "What proof, testimonials, stories, examples, or client moments should be included?",
  "What objections or hesitations should this video address directly?",
  "Who is this offer for, and who is it not for?",
  "What is the strongest next step or CTA for this video?",
];

/**
 * PRODUCT_SHOWCASE_DEEP_DIVE_QUESTIONS — for Product/Offer projects with
 * `productOfferVideoFormat === "productShowcase"`.
 *
 * PARTIALLY RECOVERED, not fabricated: only ONE real question was ever
 * found for this format, from one real project's actually-typed answer
 * ("Question 9: Who is this product best for, and who is it not for?").
 * Neither of the 2 real productShowcase projects has a captured
 * `generatedDeepDiveQuestions` array the way Signature Offer Video's did,
 * so the other ~8-9 questions this format almost certainly had are
 * genuinely unrecoverable — not invented here. The Deep Dive step for
 * this format stays fully usable via this one real question plus a
 * general notes field (see the Deep Dive UI), rather than being blocked
 * or filled out with guessed questions.
 */
export const PRODUCT_SHOWCASE_DEEP_DIVE_QUESTIONS = [
  "Who is this product best for, and who is it not for?",
];
