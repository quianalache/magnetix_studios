import { DEFAULT_BLOCK_SPACING } from "@/types/pages-funnels";
import type { PageBlock, PageType } from "@/types/pages-funnels";
import { newBlockId } from "@/lib/pages-funnels/blocks";

/**
 * "Use a Template" foundation — a template is just a named, pre-built
 * `PageBlock[]` array. Creating a page from a template runs the exact same
 * `createPage()` path as Start Blank; there is no separate template runtime
 * or format. Two demo templates prove the mechanism per the phase-1 scope;
 * more can be added here without touching the editor or renderer.
 */
export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  pageType: PageType;
  badge?: string;
  blocks: () => PageBlock[];
}

function spacing(paddingTop: number, paddingBottom: number) {
  return { paddingTop, paddingBottom };
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "free-guide-landing",
    name: "Free Guide Landing Page",
    description: "Grow your list with a free downloadable guide.",
    pageType: "landing",
    badge: "Guide",
    blocks: () => [
      {
        id: newBlockId(),
        type: "hero",
        content: {
          headline: "Grow your list with a page that actually converts",
          subheadline:
            "Magnetix helps digital entrepreneurs build beautiful pages, powerful forms, and high-converting funnels — all in one place.",
          buttonText: "Get the Free Guide",
          buttonLink: "#form",
          buttonOpenInNewTab: false,
          secondaryLinkText: "Learn more",
          secondaryLinkLink: "#features",
          alignment: "left",
          backgroundStyle: "gradient",
        },
        spacing: spacing(80, 80),
      } as PageBlock,
      {
        id: newBlockId(),
        type: "features",
        content: {
          eyebrow: "BUILT FOR CREATORS",
          headline: "Everything you need to grow and scale",
          items: [
            { id: newBlockId(), title: "Launch beautiful pages", description: "Create stunning, mobile-friendly pages that reflect your brand and convert." },
            { id: newBlockId(), title: "Collect & nurture leads", description: "Build custom forms and automate follow-ups to grow your audience." },
            { id: newBlockId(), title: "Sell with confidence", description: "Build high-converting funnels and offers that turn leads into loyal customers." },
          ],
        },
        spacing: { ...DEFAULT_BLOCK_SPACING },
      } as PageBlock,
      {
        id: newBlockId(),
        type: "testimonials",
        content: {
          eyebrow: "LOVED BY CREATORS",
          headline: "What entrepreneurs are saying",
          items: [
            { id: newBlockId(), quote: "The pages are gorgeous and my conversions have jumped!", name: "Sarah J." },
            { id: newBlockId(), quote: "I love having everything in one place — it just works.", name: "Priya K." },
            { id: newBlockId(), quote: "The page builder is so intuitive I can build what I need.", name: "Megan R." },
          ],
        },
        spacing: { ...DEFAULT_BLOCK_SPACING },
      } as PageBlock,
      {
        id: newBlockId(),
        type: "faq",
        content: {
          eyebrow: "FREQUENTLY ASKED QUESTIONS",
          headline: "Got questions? We've got answers.",
          items: [
            { id: newBlockId(), question: "Is Magnetix easy to use for beginners?", answer: "Yes — everything is drag-and-drop, no code required." },
          ],
        },
        spacing: { ...DEFAULT_BLOCK_SPACING },
      } as PageBlock,
    ],
  },
  {
    id: "launch-waitlist",
    name: "Launch Waitlist Page",
    description: "Build interest and grow your waitlist before launch day.",
    pageType: "waitlist",
    badge: "New",
    blocks: () => [
      {
        id: newBlockId(),
        type: "hero",
        content: {
          headline: "Be the first to know when we launch",
          subheadline: "Join the waitlist and we'll let you know the moment doors open.",
          buttonText: "Join the Waitlist",
          buttonLink: "#form",
          buttonOpenInNewTab: false,
          secondaryLinkText: "",
          secondaryLinkLink: "",
          alignment: "center",
          backgroundStyle: "gradient",
        },
        spacing: spacing(96, 96),
      } as PageBlock,
      {
        id: newBlockId(),
        type: "cta",
        content: {
          headline: "Ready to get started?",
          subheadline: "Spots are limited — reserve yours today.",
          buttonText: "Join the Waitlist",
          buttonLink: "#form",
          backgroundStyle: "solid",
        },
        spacing: { ...DEFAULT_BLOCK_SPACING },
      } as PageBlock,
    ],
  },
];

export function getTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}
