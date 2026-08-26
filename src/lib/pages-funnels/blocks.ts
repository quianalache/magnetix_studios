import {
  DEFAULT_BLOCK_SPACING,
  type BlockType,
  type PageBlock,
} from "@/types/pages-funnels";

/** Cheap unique-enough id for client-created blocks/items — same pattern
 *  used elsewhere in the repo for local list rows (Firestore doc ids are
 *  reserved for top-level documents, not array entries). */
export function newBlockId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type BlockCategory = "basic" | "sections" | "magnetix";

export interface BlockLibraryEntry {
  type: BlockType;
  label: string;
  category: BlockCategory;
  description: string;
}

/** Left-panel block library — drives both the search list and the grouped
 *  Basic/Sections/Magnetix sections from the editor mockup. Adding a new
 *  block type means adding one entry here plus a default-content factory
 *  below and a renderer case in block-view.tsx — the extensibility seam the
 *  spec asked this foundation to leave in place. */
export const BLOCK_LIBRARY: BlockLibraryEntry[] = [
  { type: "heading", label: "Heading", category: "basic", description: "A section title." },
  { type: "text", label: "Text", category: "basic", description: "A paragraph of body copy." },
  { type: "button", label: "Button", category: "basic", description: "A single call-to-action link." },
  { type: "image", label: "Image", category: "basic", description: "A single image." },
  { type: "divider", label: "Divider", category: "basic", description: "A thin horizontal rule." },
  { type: "spacer", label: "Spacer", category: "basic", description: "Empty vertical space." },
  { type: "hero", label: "Hero", category: "sections", description: "Big headline + CTA banner." },
  { type: "features", label: "Features", category: "sections", description: "A row of feature cards." },
  { type: "testimonials", label: "Testimonials", category: "sections", description: "Social proof quotes." },
  { type: "faq", label: "FAQ", category: "sections", description: "Expandable question list." },
  { type: "cta", label: "CTA", category: "sections", description: "Closing call-to-action banner." },
  { type: "form", label: "Form", category: "magnetix", description: "Embed an existing Magnetix form." },
];

export function defaultBlockContent(type: BlockType): PageBlock["content"] {
  switch (type) {
    case "hero":
      return {
        headline: "Your headline goes here",
        subheadline: "Add a supporting sentence that explains the offer.",
        buttonText: "Get Started",
        buttonLink: "#",
        buttonOpenInNewTab: false,
        buttonStyle: "primary",
        secondaryLinkText: "",
        secondaryLinkLink: "",
        alignment: "left",
        backgroundStyle: "gradient",
      };
    case "heading":
      return { text: "Section heading", level: "h2", alignment: "left" };
    case "text":
      return {
        text: "Add the copy for this section. Click to edit it from the Content tab on the right.",
        alignment: "left",
      };
    case "button":
      return {
        text: "Click here",
        link: "#",
        openInNewTab: false,
        style: "primary",
        alignment: "left",
      };
    case "image":
      return { src: "", alt: "", link: "" };
    case "features":
      return {
        eyebrow: "BUILT FOR CREATORS",
        headline: "Everything you need to grow",
        items: [
          { id: newBlockId(), title: "Launch beautiful pages", description: "Create pages that reflect your brand and convert." },
          { id: newBlockId(), title: "Collect & nurture leads", description: "Automate follow-ups to grow your audience." },
          { id: newBlockId(), title: "Sell with confidence", description: "Turn leads into loyal, paying customers." },
        ],
      };
    case "testimonials":
      return {
        eyebrow: "LOVED BY CREATORS",
        headline: "What people are saying",
        items: [
          { id: newBlockId(), quote: "This made launching so much easier.", name: "Sarah J." },
          { id: newBlockId(), quote: "I love having everything in one place.", name: "Priya K." },
        ],
      };
    case "faq":
      return {
        eyebrow: "FREQUENTLY ASKED QUESTIONS",
        headline: "Got questions?",
        items: [
          { id: newBlockId(), question: "Is this easy to use?", answer: "Yes — no code required." },
        ],
      };
    case "cta":
      return {
        headline: "Ready to get started?",
        subheadline: "Join today and see the difference for yourself.",
        buttonText: "Get Started",
        buttonLink: "#",
        backgroundStyle: "gradient",
      };
    case "divider":
      return { style: "line" };
    case "spacer":
      return { height: 48 };
    case "form":
      return { formId: null, formName: null };
  }
}

export function createBlock(type: BlockType): PageBlock {
  return {
    id: newBlockId(),
    type,
    content: defaultBlockContent(type),
    spacing: { ...DEFAULT_BLOCK_SPACING },
  } as PageBlock;
}

export function duplicateBlock(block: PageBlock): PageBlock {
  return {
    ...structuredCloneBlock(block),
    id: newBlockId(),
  };
}

function structuredCloneBlock(block: PageBlock): PageBlock {
  // Blocks are plain JSON-shaped data (no Dates/Timestamps inside), so a
  // JSON round-trip is a safe, dependency-free deep clone.
  return JSON.parse(JSON.stringify(block)) as PageBlock;
}
