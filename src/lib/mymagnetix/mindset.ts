/**
 * Magnetix Mindset — a small, curated, static V1 library. Deliberately
 * human-centered, not business-specific: every entry needs to read as true
 * whether the person opening MyMagnetix today is running a business, deep
 * in a course, showing up for a community, or just checking their own
 * progress. No AI call, no per-request cost — a plain array plus a
 * deterministic daily pick. This is NOT the future Audio Library; it is a
 * single short line of text.
 */

export interface MindsetEntry {
  kind: "affirmation" | "prompt" | "reframe" | "permission" | "invitation";
  text: string;
}

export const MINDSET_LIBRARY: MindsetEntry[] = [
  { kind: "affirmation", text: "You don't have to feel ready to begin — beginning is what makes you ready." },
  { kind: "prompt", text: "What's one thing you're proud of from this week, even a small one?" },
  { kind: "reframe", text: "A slow week isn't a lost week. Rest is part of the work, not a break from it." },
  { kind: "permission", text: "You're allowed to change your mind about what success looks like." },
  { kind: "invitation", text: "Today, do the one thing you've been putting off for five minutes. Just five." },
  { kind: "affirmation", text: "Consistency, not intensity, is what actually moves things forward." },
  { kind: "prompt", text: "If today only had room for one meaningful thing, what would you choose?" },
  { kind: "reframe", text: "Comparing your beginning to someone else's middle isn't a fair measure." },
  { kind: "permission", text: "It's okay to ask for help before you're completely stuck." },
  { kind: "invitation", text: "Notice one thing today that's going better than it was a month ago." },
  { kind: "affirmation", text: "Showing up imperfectly is still showing up." },
  { kind: "prompt", text: "What would you do differently this week if you trusted yourself a little more?" },
  { kind: "reframe", text: "Feedback isn't proof you're behind — it's proof someone's paying attention." },
  { kind: "permission", text: "You don't owe anyone a polished version of work still in progress." },
  { kind: "invitation", text: "Take one small step today that your future self will thank you for." },
  { kind: "affirmation", text: "You are allowed to take up space in the thing you're building." },
  { kind: "prompt", text: "What's one boundary that would make this week easier to carry?" },
  { kind: "reframe", text: "A setback is information, not a verdict." },
  { kind: "permission", text: "Rest before you're exhausted — you don't have to earn it first." },
  { kind: "invitation", text: "Reach out to one person today who's part of your journey." },
  { kind: "affirmation", text: "Growth is rarely a straight line, and yours doesn't have to be either." },
  { kind: "prompt", text: "What's something you know now that you wish you'd known when you started?" },
  { kind: "reframe", text: "Not finished yet is different from not good enough." },
  { kind: "permission", text: "You can outgrow a goal without having failed at it." },
  { kind: "invitation", text: "Write down one thing you want to remember about how far you've come." },
];

/**
 * Deterministic daily pick (UTC date), same entry all day for everyone —
 * cheap, predictable, no storage needed. Rotates through the full library
 * before repeating.
 */
export function todaysMindsetEntry(date: Date = new Date()): MindsetEntry {
  const dayNumber = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  const index = ((dayNumber % MINDSET_LIBRARY.length) + MINDSET_LIBRARY.length) % MINDSET_LIBRARY.length;
  return MINDSET_LIBRARY[index];
}
