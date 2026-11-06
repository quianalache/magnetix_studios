import { SIDEBAR_CARDS_MAX, SIDEBAR_CARD_BODY_MAX, SIDEBAR_CARD_BUTTON_LABEL_MAX, SIDEBAR_CARD_HEADING_MAX, SIDEBAR_LINKS_MAX } from "@/config/community";
import type { CommunitySidebarCard, ResourceLink } from "@/types/community";

export function normalizeCommunityLinks(links: ResourceLink[]): ResourceLink[] {
  return links.filter((link) => link && link.url?.trim()).map((link) => ({ label: link.label?.trim() || link.url.trim(), url: link.url.trim() })).slice(0, SIDEBAR_LINKS_MAX);
}

export function normalizeCommunitySidebarCards(cards: CommunitySidebarCard[] | undefined): CommunitySidebarCard[] {
  return (cards ?? []).filter((card) => card && card.heading?.trim()).map((card, index) => ({
    id: card.id?.trim() || `card-${Date.now()}-${index}`,
    heading: card.heading.trim().slice(0, SIDEBAR_CARD_HEADING_MAX),
    body: (card.body ?? "").trim().slice(0, SIDEBAR_CARD_BODY_MAX),
    imageUrl: card.imageUrl?.trim() || null,
    buttonLabel: (card.buttonLabel ?? "").trim().slice(0, SIDEBAR_CARD_BUTTON_LABEL_MAX),
    buttonUrl: (card.buttonUrl ?? "").trim(),
    accentColor: card.accentColor?.trim() || null,
    order: Number.isFinite(card.order) ? card.order : index,
  })).sort((a, b) => a.order - b.order).slice(0, SIDEBAR_CARDS_MAX).map((card, index) => ({ ...card, order: index }));
}
