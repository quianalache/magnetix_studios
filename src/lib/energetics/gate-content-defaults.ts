/**
 * Default interpretive content for the 64 Gene Keys — one short "how the
 * shadow shows up" line and one "how the gift shows up" line per gate.
 * Ships so a practitioner's report is usable immediately; fully
 * overridable per sub-account (see energetic-decoder-content-service.ts)
 * so they can rewrite it in their own voice instead of starting blank.
 *
 * Original wording throughout — written fresh from the standard, publicly
 * shared shadow/gift/siddhi NAMES in gate-data.ts (necessary system
 * nomenclature, not proprietary), not copied from any single author's
 * published interpretive text.
 */

export interface GateContentDefault {
  gate: number;
  showsUp: string;
  giftText: string;
}

export const DEFAULT_GATE_CONTENT: readonly GateContentDefault[] = [
  { gate: 1, showsUp: "Waiting for permission before you create, so nothing new gets made.", giftText: "Starting before you feel ready, and letting the work be original because it's honest." },
  { gate: 2, showsUp: "Following someone else's map because you don't trust your own sense of direction.", giftText: "Letting your inner compass lead, even when you can't yet explain where it's taking you." },
  { gate: 3, showsUp: "Trying to force order onto something that's still figuring itself out.", giftText: "Treating the messy beginning as the actual work, not a delay before the real thing starts." },
  { gate: 4, showsUp: "Deciding you're right before you've really heard the other side.", giftText: "Staying curious about someone else's answer long enough to actually understand it." },
  { gate: 5, showsUp: "Rushing a process that has its own timing, and resenting it for not moving faster.", giftText: "Trusting rhythm over urgency, and letting things ripen instead of forcing them." },
  { gate: 6, showsUp: "Picking a fight to feel a connection, instead of just asking for one.", giftText: "Finding the shared ground first, so closeness doesn't need conflict to happen." },
  { gate: 7, showsUp: "Leading by insisting, which splits a room instead of moving it.", giftText: "Leading by example so clearly that people choose to follow, not comply." },
  { gate: 8, showsUp: "Blending in because standing out feels like too much exposure.", giftText: "Contributing your actual style, even when it's different from what's expected." },
  { gate: 9, showsUp: "Stalling on the small next step because the whole project feels too big.", giftText: "Focusing on one precise detail at a time until momentum builds on its own." },
  { gate: 10, showsUp: "Performing a version of yourself because the real one feels risky to show.", giftText: "Being recognizably, unapologetically yourself, and letting that be enough." },
  { gate: 11, showsUp: "Sitting on an idea because it isn't fully formed yet.", giftText: "Sharing the idea while it's still becoming, and letting others build on it with you." },
  { gate: 12, showsUp: "Chasing how something looks instead of whether it actually matters.", giftText: "Speaking or making only when it's genuinely worth someone's attention." },
  { gate: 13, showsUp: "Letting a small misunderstanding calcify into a story you stop questioning.", giftText: "Listening past the words to what someone's actually trying to say." },
  { gate: 14, showsUp: "Settling for a smaller outcome because the bigger one feels like too much to ask for.", giftText: "Doing the work with enough skill that the bigger outcome becomes available." },
  { gate: 15, showsUp: "Playing it safe and forgettable so no one has a strong reaction to you.", giftText: "Letting your natural rhythm and warmth draw people in without trying to." },
  { gate: 16, showsUp: "Checking out once something stops feeling novel.", giftText: "Staying engaged long enough to turn early skill into real mastery." },
  { gate: 17, showsUp: "Holding an opinion so tightly it stops you from updating it.", giftText: "Spotting the pattern early, and holding the view loosely enough to revise it." },
  { gate: 18, showsUp: "Fixating on what's wrong until it's all you can see.", giftText: "Improving what's broken without needing to tear down what's already working." },
  { gate: 19, showsUp: "Needing outside approval before you'll trust that something's okay.", giftText: "Staying attuned to what others actually need, without losing your own footing." },
  { gate: 20, showsUp: "Staying on the surface because going deeper feels exposing.", giftText: "Being fully present in this exact moment, without performing or explaining it." },
  { gate: 21, showsUp: "Gripping control because letting go feels like losing everything.", giftText: "Taking ownership with a steady hand, without needing to control every detail." },
  { gate: 22, showsUp: "Reacting sharply when you feel exposed, then regretting the tone.", giftText: "Meeting an awkward moment with warmth instead of defensiveness." },
  { gate: 23, showsUp: "Overexplaining something simple until it sounds complicated.", giftText: "Saying the true thing in the fewest words it actually needs." },
  { gate: 24, showsUp: "Repeating the same pattern because breaking it feels harder than staying stuck.", giftText: "Noticing the loop, and choosing something new instead of the familiar default." },
  { gate: 25, showsUp: "Shrinking yourself so you take up less space than you actually need.", giftText: "Including yourself in what you love without apologizing for needing it." },
  { gate: 26, showsUp: "Overselling your part in something to make sure you're noticed.", giftText: "Letting your actual results speak, without needing to inflate the story." },
  { gate: 27, showsUp: "Holding onto resources — time, attention, credit — out of quiet fear of running out.", giftText: "Giving generously because you trust there's more where that came from." },
  { gate: 28, showsUp: "Going through the motions because the point of it all feels unclear.", giftText: "Committing fully to something because it matters, whether or not it's easy." },
  { gate: 29, showsUp: "Saying yes without really meaning it, then dragging your feet on the follow-through.", giftText: "Committing all the way in, once you've actually decided it's a yes." },
  { gate: 30, showsUp: "Chasing the next want before you've let yourself feel the current one.", giftText: "Letting desire move you lightly, without gripping the outcome." },
  { gate: 31, showsUp: "Talking over the room instead of actually leading it.", giftText: "Speaking in a way people want to follow, because it's earned, not demanded." },
  { gate: 32, showsUp: "Avoiding the attempt because failing at it feels unbearable.", giftText: "Protecting what's proven to work while still being willing to try again." },
  { gate: 33, showsUp: "Losing track of your own story because you're too busy reacting to everyone else's.", giftText: "Reflecting honestly on what actually happened, and learning what it has to teach." },
  { gate: 34, showsUp: "Pushing through on raw effort until you burn out instead of pacing yourself.", giftText: "Using your full strength on the thing that's actually worth it." },
  { gate: 35, showsUp: "Needing constant novelty because sitting still feels unbearable.", giftText: "Meeting new experience with real curiosity instead of restlessness." },
  { gate: 36, showsUp: "Stirring up drama because calm feels like nothing's happening.", giftText: "Meeting other people's chaos with steadiness instead of getting pulled into it." },
  { gate: 37, showsUp: "Folding under pressure instead of asking for the support you actually need.", giftText: "Holding your ground with warmth, so the people around you stay close, not distant." },
  { gate: 38, showsUp: "Picking a fight over something that doesn't actually matter to you.", giftText: "Saving your fight for the thing that's genuinely worth defending." },
  { gate: 39, showsUp: "Provoking a reaction just to feel like something real is happening.", giftText: "Stirring the exact amount of friction needed to break something loose." },
  { gate: 40, showsUp: "Working past the point of usefulness because stopping feels like failing.", giftText: "Working hard, then actually resting, and trusting the rest is part of the job." },
  { gate: 41, showsUp: "Staying in the fantasy of a plan instead of starting the real, messier version.", giftText: "Turning the first spark of an idea into an actual, workable first step." },
  { gate: 42, showsUp: "Getting rigid about how an ending 'should' look instead of letting it close naturally.", giftText: "Letting something finish fully, and feeling the completion instead of rushing past it." },
  { gate: 43, showsUp: "Dismissing feedback because it doesn't match what you already believed.", giftText: "Hearing an insight clearly enough to actually change your mind." },
  { gate: 44, showsUp: "Assuming the worst about someone based on a past pattern.", giftText: "Reading a situation accurately enough to build the right team for it." },
  { gate: 45, showsUp: "Directing people instead of genuinely including them.", giftText: "Bringing people together around something that benefits everyone, not just you." },
  { gate: 46, showsUp: "Taking yourself so seriously that you can't enjoy the thing you're actually good at.", giftText: "Showing up fully in your body and your moment, and actually enjoying it." },
  { gate: 47, showsUp: "Turning a setback over and over in your head instead of letting it inform you.", giftText: "Taking a hard experience and turning it into something useful for others." },
  { gate: 48, showsUp: "Holding back because you don't feel expert enough yet.", giftText: "Trusting the depth you already have, even before it feels fully polished." },
  { gate: 49, showsUp: "Rejecting people or ideas the moment they stop meeting your expectations.", giftText: "Staying in relationship through change, instead of cutting ties at the first friction." },
  { gate: 50, showsUp: "Cutting a corner because doing it right feels like too much effort.", giftText: "Holding a standard because you actually care about the people it protects." },
  { gate: 51, showsUp: "Creating unnecessary shock just to get a reaction out of people.", giftText: "Meeting real disruption with courage instead of flinching from it." },
  { gate: 52, showsUp: "Freezing under pressure instead of pausing on purpose.", giftText: "Getting still on purpose, so the next move comes from clarity, not panic." },
  { gate: 53, showsUp: "Starting things you never finish because the beginning is the fun part.", giftText: "Pushing an idea past the exciting start into something that actually completes." },
  { gate: 54, showsUp: "Chasing status or metrics as a stand-in for actually feeling like it matters.", giftText: "Working with real ambition toward something you'd still want even without an audience." },
  { gate: 55, showsUp: "Blaming outside circumstances for a feeling that's actually coming from within.", giftText: "Letting your mood move through you without needing to explain or justify it." },
  { gate: 56, showsUp: "Chasing the next distraction so a story never has to reach its point.", giftText: "Telling a story so well that people actually want to stay for the ending." },
  { gate: 57, showsUp: "Carrying a low-grade anxiety that never quite explains itself.", giftText: "Trusting the instinct that shows up before you can fully explain why." },
  { gate: 58, showsUp: "Deciding nothing is ever quite good enough to actually enjoy.", giftText: "Bringing real energy to the effort itself, not just the outcome." },
  { gate: 59, showsUp: "Keeping people at a polite distance instead of letting them actually in.", giftText: "Being honest enough that real closeness becomes possible." },
  { gate: 60, showsUp: "Putting rules on your own expression that nobody actually asked for.", giftText: "Working well within real limits instead of resenting them." },
  { gate: 61, showsUp: "Getting lost in your own head trying to figure everything out alone.", giftText: "Following a flash of insight even before you can prove it logically." },
  { gate: 62, showsUp: "Getting so precise about the facts that you lose the actual point.", giftText: "Explaining something complicated in a way that's genuinely easy to follow." },
  { gate: 63, showsUp: "Doubting a decision after you've already made it, over and over.", giftText: "Asking the sharp question that actually moves understanding forward." },
  { gate: 64, showsUp: "Getting overwhelmed by too many half-formed ideas at once.", giftText: "Letting the flood of ideas settle into the one that's actually worth pursuing." },
];

export function defaultGateContent(gate: number): GateContentDefault {
  return DEFAULT_GATE_CONTENT[gate - 1] ?? DEFAULT_GATE_CONTENT[0];
}
