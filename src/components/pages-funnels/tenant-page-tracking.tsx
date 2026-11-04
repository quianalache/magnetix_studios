"use client";

import Script from "next/script";
import { isGa4Id, isGtmId, isMetaPixelId } from "@/lib/pages-funnels/page-settings";

/**
 * A tenant's own tracking for ONE published public Page (Wave 3 Page
 * Settings): Meta Pixel, GA4 and/or GTM, from the page's PUBLISHED settings
 * only. Mounted solely by the public `/p/[pageId]` route for a published page
 * — never in the builder canvas or Preview, so editing and QA don't create
 * analytics events. IDs are re-validated here (safe render) before being
 * written into a script, and each provider loads at most once (stable
 * script ids). Meta events use `trackSingle` so they can only ever go to the
 * tenant's pixel, even if another pixel exists on the window.
 */
export function TenantPageTracking({
  metaPixelId,
  ga4Id,
  gtmId,
}: {
  metaPixelId?: string;
  ga4Id?: string;
  gtmId?: string;
}) {
  const pixel = metaPixelId && isMetaPixelId(metaPixelId) ? metaPixelId : null;
  const ga4 = ga4Id && isGa4Id(ga4Id) ? ga4Id : null;
  const gtm = gtmId && isGtmId(gtmId) ? gtmId : null;
  if (!pixel && !ga4 && !gtm) return null;
  return (
    <>
      {gtm && (
        <Script id="tenant-gtm" strategy="afterInteractive" data-tenant-tracking="gtm">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}
      {ga4 && (
        <>
          <Script id="tenant-ga4-src" src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" data-tenant-tracking="ga4" />
          <Script id="tenant-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4}');`}
          </Script>
        </>
      )}
      {pixel && (
        <Script id="tenant-meta-pixel" strategy="afterInteractive" data-tenant-tracking="meta-pixel">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('trackSingle','${pixel}','PageView');`}
        </Script>
      )}
    </>
  );
}
