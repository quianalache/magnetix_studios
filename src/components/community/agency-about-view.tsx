import Link from "next/link";
import type { CSSProperties } from "react";
import { Pencil, Users } from "lucide-react";
import { AboutMediaGallery } from "@/components/community/about-media-gallery";
import { CommunityAboutStyles } from "@/components/community/community-about-view";
import { communityAboutEditHref, type CommunityLinkBase } from "@/lib/community/routes";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { CommunityGroup } from "@/types/community";

/** Whether a rich-text field actually has visible content — mirrors
 *  `hasRealText` in community-about-view.tsx (kept local rather than
 *  exported: a one-line, purely presentational check). */
function hasRealText(html: string): boolean {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim().length > 0;
}

/**
 * Agency Community About — the agency-scope sibling of
 * CommunityAboutView, reusing its media gallery + rich-text rendering +
 * "What You'll Get Inside" benefits verbatim. Deliberately does NOT reuse
 * CommunityAboutView itself: that component's sidebar card is a tenant
 * SALES card (JoinButton, tiers, pricing, upgrade CTA, reviews) — none of
 * which apply to Agency Community, which is owner-invite-only with no
 * self-serve join, tiers, or reviews. This renders the same real content
 * (tagline, aboutHtml/about, aboutMedia, aboutBenefits) with a plain
 * identity sidebar (name, tagline, member count, "Powered by Magnetix
 * Studios") instead of a storefront.
 */
export function AgencyAboutView({
  link,
  group,
  brandName,
  isModerator,
}: {
  link: CommunityLinkBase;
  group: CommunityGroup;
  /** Always the resolved AGENCY brand name (`resolveBrandName`), never a
   *  sub-account's name and never the owner's personal identity. */
  brandName: string;
  isModerator: boolean;
}) {
  const gallery = group.aboutMedia?.length ? group.aboutMedia : [];
  const benefits = group.showAboutBenefits === false ? [] : (group.aboutBenefits ?? []);
  const theme = resolveCommunityTheme(group);
  const logoUrl = group.logoUrl;

  return (
    <div
      className="community-about"
      style={
        {
          "--ca-primary": theme.primary,
          "--ca-primary-action": theme.primaryAction,
          "--ca-accent": theme.accent,
        } as CSSProperties
      }
    >
      <CommunityAboutStyles />
      {isModerator && (
        <div className="community-about-edit-bar">
          <span>You&apos;re viewing the live About page.</span>
          <Link href={communityAboutEditHref(link, group.slug)} className="community-about-edit-link">
            <Pencil size={13} /> Edit About
          </Link>
        </div>
      )}
      <div className="community-about-layout">
        <div className="community-about-grid">
          <div className="community-about-content">
            {gallery.length > 0 && <AboutMediaGallery items={gallery} />}

            <section className="community-about-copy-section">
              <h2>About this community</h2>
              {hasRealText(group.aboutHtml) || hasRealText(group.about) ? (
                <div
                  className="community-about-rich prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderLessonBodyHtml(group.aboutHtml || group.about),
                  }}
                />
              ) : (
                <p className="community-about-description">
                  More details about this community are coming soon.
                </p>
              )}
            </section>

            {benefits.length > 0 && (
              <section className="community-about-benefits">
                <h2>What You&apos;ll Get Inside</h2>
                <div className="community-about-benefits-grid">
                  {benefits.map((benefit) => (
                    <div key={benefit.id} className="community-about-benefit">
                      <span className="community-about-benefit-icon">{benefit.icon}</span>
                      <div>
                        <h3>{benefit.title}</h3>
                        {benefit.description && <p>{benefit.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="community-about-sidebar">
            <div className="community-about-card">
              {group.cardImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.cardImageUrl} alt="" className="community-about-card-image" />
              )}

              <div className="community-about-card-identity">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="community-about-logo" />
                ) : (
                  <div className="community-about-logo">{group.name.charAt(0)}</div>
                )}
                <h1 className="community-about-card-name">{group.name}</h1>
                {group.tagline?.trim() && <p className="community-about-card-tagline">{group.tagline}</p>}
                <p className="community-about-cta-subtext">Presented by {brandName}</p>
              </div>

              <div className="community-about-card-stats">
                <div className="community-about-card-stat">
                  <Users />
                  <strong>{group.memberCount}</strong>
                  <span>Members</span>
                </div>
              </div>

              <p className="community-about-powered">Powered by Magnetix Studios</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
