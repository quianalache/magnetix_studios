import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANDING_VARIANT } from "@/config/landing";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { resolveHeroVariant } from "@/lib/hero-variant-server";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";

import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { Navbar as LeadStackNavbar } from "@/components/landing/navbar";
import { Hero as LeadStackHero } from "@/components/landing/hero";
import { IntegrationsCarousel } from "@/components/landing/integrations-carousel";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WorkspaceTour } from "@/components/landing/workspace-tour";
import { Features as LeadStackFeatures } from "@/components/landing/features";
import { MidPageCta } from "@/components/landing/mid-page-cta";
import { Comparison } from "@/components/landing/comparison";
// import { Support } from "@/components/landing/support"; // hidden for now
import { MakeItYours } from "@/components/landing/make-it-yours";
import { TestimonialsCarousel } from "@/components/landing/testimonials-carousel";
import { Pricing as LeadStackPricing } from "@/components/landing/pricing";
import { UneedReviews } from "@/components/landing/uneed-reviews";
import { FAQ as LeadStackFAQ } from "@/components/landing/faq";
import { CTA as LeadStackCTA } from "@/components/landing/cta";
import { Footer as LeadStackFooter } from "@/components/landing/footer";
import { ExitIntentModal } from "@/components/landing/exit-intent-modal";
import { UpdatesModal } from "@/components/landing/updates-modal";
import { SalesPopup } from "@/components/landing/sales-popup";
import { LiveVisitorBeacon } from "@/components/landing/live-visitor-beacon";

import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Hero as CustomHero } from "@/components/landing-custom/hero";
import { Features as CustomFeatures } from "@/components/landing-custom/features";
import { FAQ as CustomFAQ } from "@/components/landing-custom/faq";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

/**
 * Renders one of two landing pages based on src/config/landing.ts.
 *
 * - "custom" — a generic agency-CRM landing the buyer brands as their own.
 *   Brand fields are resolved server-side from the agency doc (Agency →
 *   Settings → Branding), falling back to CUSTOM_BRAND for anything the
 *   owner hasn't set yet. THIS IS THE DEFAULT.
 * - "leadstack" — the LeadStack-branded marketing landing used on the
 *   leadstack.dev demo site. Flip back to this only for the public demo.
 *
 * Flip LANDING_VARIANT to swap. Code-level defaults for the custom
 * variant live in src/config/landing.ts (CUSTOM_BRAND).
 */
export default async function HomePage() {
  const host = (await headers()).get("host");

  // 2026-09-01 Magnetix login/gateway launch fix: crm.magnetixstudios.com
  // is the authentication/product-access entry point, not a second copy
  // of the marketing site — magnetixstudios.com (and www) keep rendering
  // the landing page below unchanged; only this exact host redirects.
  //
  // CORRECTION (same day, caught in real Incognito QA): this originally
  // sent an anonymous visitor to /my/login — wrong, because that
  // pre-classifies them as "MyMagnetix" before Magnetix has any idea who
  // they are or what they're allowed to access. An anonymous request
  // cannot be pre-classified into either Business Center or MyMagnetix;
  // /login is the real neutral entry (LoginForm now tries a Business
  // Center credential first, falls back to a MyMagnetix-only one — one
  // form, either identity, see its own doc comment) and only AFTER a
  // successful sign-in does anything resolve which access this identity
  // actually has (see /gateway's own doc comment for that resolution).
  if (host === "crm.magnetixstudios.com") {
    redirect("/login");
  }

  // A verified sub-account custom domain's bare root ("/") is NOT this
  // platform's own marketing landing — send it wherever that sub-account
  // has configured (their existing site, a community, etc.), or a minimal
  // placeholder if they haven't set one. The shared platform domain
  // (crm.magnetixstudios.com and its `.vercel.app` origin) is unaffected —
  // getSubAccountByCustomDomain only matches a registered custom domain.
  const customDomainSub = await getSubAccountByCustomDomain(host);
  if (customDomainSub) {
    if (customDomainSub.customDomain?.rootRedirectUrl) {
      redirect(customDomainSub.customDomain.rootRedirectUrl);
    }
    redirect(`/portal/${customDomainSub.id}`);
  }

  if (LANDING_VARIANT === "custom") {
    const brand = await resolveCustomBrand();
    return (
      <div className="flex min-h-screen flex-col">
        <CustomNavbar brand={brand} />
        <main className="flex-1">
          <CustomHero brand={brand} />
          <CustomFeatures />
          <CustomFAQ brand={brand} />
          <CustomCTA brand={brand} />
        </main>
        <CustomFooter brand={brand} />
      </div>
    );
  }

  const heroVariant = await resolveHeroVariant();

  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBar />
      <LeadStackNavbar />
      <main className="flex-1">
        <LeadStackHero variant={heroVariant} />
        <HowItWorks />
        <WorkspaceTour />
        <LeadStackFeatures />
        <MidPageCta />
        <Comparison />
        {/* <Support /> — hidden for now; uncomment to restore */}
        <MakeItYours />
        <UneedReviews />
        <LeadStackPricing />
        <TestimonialsCarousel />
        <IntegrationsCarousel />
        <LeadStackFAQ />
        <LeadStackCTA />
      </main>
      <LeadStackFooter variant={heroVariant} />
      <ExitIntentModal />
      <UpdatesModal />
      <SalesPopup />
      <LiveVisitorBeacon />
    </div>
  );
}
