/**
 * No-JavaScript fallbacks for Magnetix's own GTM + Meta Pixel. They used to
 * sit in the root layout and so reached every tenant surface too; since the
 * Wave 3 owner decision (Magnetix tracking only on Magnetix-owned surfaces —
 * see `lib/tracking/surfaces.ts`) they render only on Magnetix's own marketing
 * landing page, the one Magnetix surface a no-JS visitor can meaningfully use.
 * A `<noscript>` can't be gated in the browser, which is why this is placed
 * per page rather than site-wide.
 */
export function MagnetixNoscriptTracking() {
  const gtm = process.env.NEXT_PUBLIC_GTM_ID;
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return (
    <>
      {gtm && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      )}
      {pixel && (
        <noscript>
          {/* Must be a bare <img>: next/image needs client JS, which is the
              whole reason this fallback exists. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
