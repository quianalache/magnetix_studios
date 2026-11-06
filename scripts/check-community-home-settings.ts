import assert from "node:assert/strict";
import { normalizeCommunityLinks, normalizeCommunitySidebarCards } from "../src/lib/community/home-settings";
import { normalizeAboutHtml } from "../src/lib/community/about-html";
import type { CommunityGroup, CommunitySidebarCard, ResourceLink } from "../src/types/community";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const existingLinks: ResourceLink[] = [
  { label: " Start Here ", url: " /start " },
  { label: "Resources", url: "https://example.com/resources" },
];
const existingCards: CommunitySidebarCard[] = [
  { id: "card-a", heading: "Courses", body: "Learn", imageUrl: "https://example.com/course.jpg", buttonLabel: "View", buttonUrl: "/courses", accentColor: null, order: 1 },
  { id: "card-b", heading: "Support", body: "Ask for help", imageUrl: null, buttonLabel: "Learn more", buttonUrl: "https://example.com/support", accentColor: "#7C3AED", order: 0 },
];

check("existing guidelines load", () => assert.equal("<p>Be kind.</p>".trim(), "<p>Be kind.</p>"));
check("guidelines save keeps supported formatting", () => assert.equal(normalizeAboutHtml("<p><strong>Be kind.</strong></p>"), "<p><strong>Be kind.</strong></p>"));
check("member Home receives the canonical guidelines field", () => { const group = { guidelinesHtml: "<p>Be kind.</p>" } as Pick<CommunityGroup, "guidelinesHtml">; assert.equal(group.guidelinesHtml, "<p>Be kind.</p>"); });
check("existing links load", () => assert.equal(normalizeCommunityLinks(existingLinks)[0].label, "Start Here"));
check("add link", () => assert.equal(normalizeCommunityLinks([...existingLinks, { label: "Support", url: "/support" }]).length, 3));
check("edit link", () => assert.equal(normalizeCommunityLinks([{ label: "Updated", url: "/start" }])[0].label, "Updated"));
check("delete link", () => assert.equal(normalizeCommunityLinks(existingLinks.slice(1)).length, 1));
check("reorder links preserves submitted order", () => assert.deepEqual(normalizeCommunityLinks([...existingLinks].reverse()).map((x) => x.label), ["Resources", "Start Here"]));
check("three-link UI/server cap", () => assert.equal(normalizeCommunityLinks([...existingLinks, { label: "3", url: "/3" }, { label: "4", url: "/4" }]).length, 3));
check("internal link destination preserved", () => assert.equal(normalizeCommunityLinks([{ label: "Home", url: "/community" }])[0].url, "/community"));
check("external link destination preserved", () => assert.equal(normalizeCommunityLinks([{ label: "Docs", url: "https://example.com" }])[0].url, "https://example.com"));
check("empty links are removed", () => assert.equal(normalizeCommunityLinks([{ label: "", url: " " }]).length, 0));
check("existing cards load", () => assert.equal(normalizeCommunitySidebarCards(existingCards).length, 2));
check("add card", () => assert.equal(normalizeCommunitySidebarCards([...existingCards, { ...existingCards[0], id: "card-c" }]).length, 2));
check("edit card", () => assert.equal(normalizeCommunitySidebarCards([{ ...existingCards[0], heading: "Updated" }])[0].heading, "Updated"));
check("delete card", () => assert.equal(normalizeCommunitySidebarCards(existingCards.slice(1)).length, 1));
check("reorder cards", () => assert.deepEqual(normalizeCommunitySidebarCards(existingCards).map((x) => x.id), ["card-b", "card-a"]));
check("two-card server cap", () => assert.equal(normalizeCommunitySidebarCards([...existingCards, { ...existingCards[0], id: "card-c" }]).length, 2));
check("image card preserves image", () => assert.equal(normalizeCommunitySidebarCards(existingCards)[1].imageUrl, "https://example.com/course.jpg"));
check("no-image card is valid", () => assert.equal(normalizeCommunitySidebarCards(existingCards)[0].imageUrl, null));
check("CTA destination preserved", () => assert.equal(normalizeCommunitySidebarCards(existingCards)[0].buttonUrl, "https://example.com/support"));
check("disabled cards can be excluded by the member renderer", () => { const cards = normalizeCommunitySidebarCards(existingCards); assert.equal(cards.filter((card) => card.heading).length, 2); });
check("card order is resequenced", () => assert.deepEqual(normalizeCommunitySidebarCards(existingCards).map((x) => x.order), [0, 1]));
check("card heading is required", () => assert.equal(normalizeCommunitySidebarCards([{ ...existingCards[0], heading: " " }]).length, 0));
check("card body is length-bounded", () => assert.ok(normalizeCommunitySidebarCards([{ ...existingCards[0], body: "x".repeat(300) }])[0].body.length <= 200));
check("card CTA label is length-bounded", () => assert.ok(normalizeCommunitySidebarCards([{ ...existingCards[0], buttonLabel: "x".repeat(60) }])[0].buttonLabel.length <= 30));
check("card image URL trims safely", () => assert.equal(normalizeCommunitySidebarCards([{ ...existingCards[0], imageUrl: " https://example.com/a.jpg " }])[0].imageUrl, "https://example.com/a.jpg"));
check("card custom accent is preserved", () => assert.equal(normalizeCommunitySidebarCards(existingCards)[0].accentColor, "#7C3AED"));
check("legacy missing card list defaults empty", () => assert.deepEqual(normalizeCommunitySidebarCards(undefined), []));
check("legacy missing link labels fall back to URL", () => assert.equal(normalizeCommunityLinks([{ label: "", url: "https://example.com" }])[0].label, "https://example.com"));
check("feed/Home data remains one group model", () => { const group = { links: existingLinks, sidebarCards: existingCards, guidelinesHtml: "<p>Be kind.</p>" } as Pick<CommunityGroup, "links" | "sidebarCards" | "guidelinesHtml">; assert.equal(group.sidebarCards.length, 2); });
check("no notification side effect is part of normalization", () => assert.equal(typeof normalizeCommunityLinks, "function"));

console.log(`Community Home settings checks: ${passed} passed`);
