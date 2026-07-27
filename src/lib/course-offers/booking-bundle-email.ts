import "server-only";

/**
 * Pure render function for the "you've got N sessions booked in" email —
 * no Resend, no Firestore. Sent when a Course Offer purchase (or free
 * enrollment) grants a bundled `CourseOfferBookingBundle`, alongside
 * whatever course access the offer also grants. Mirrors the render-then-
 * send split used by `src/lib/booking/email.ts`.
 */

export interface OfferBookingBundleEmailInput {
  /** Recipient display name. Falls back to "there". */
  recipientName: string;
  businessName: string;
  offerTitle: string;
  bookingPageName: string;
  sessionCount: number;
  /** Public `/b/{saId}/{slug}` URL. */
  bookingUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderOfferBookingBundleEmail(
  input: OfferBookingBundleEmailInput,
): RenderedEmail {
  const greeting = `Hi ${input.recipientName?.split(" ")[0] || "there"},`;
  const sessionsWord = input.sessionCount === 1 ? "session" : "sessions";
  const subject = `Book your ${input.sessionCount} ${sessionsWord} with ${input.bookingPageName}`;

  const text = [
    greeting,
    "",
    `Your purchase of ${input.offerTitle} includes ${input.sessionCount} ${sessionsWord} with ${input.bookingPageName}.`,
    "",
    `Book here: ${input.bookingUrl}`,
    "",
    `— ${input.businessName}`,
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;color:#202124;">
  <p>${greeting}</p>
  <p>Your purchase of <strong>${input.offerTitle}</strong> includes
    <strong>${input.sessionCount} ${sessionsWord}</strong> with
    <strong>${input.bookingPageName}</strong>.</p>
  <p style="margin:24px 0;">
    <a href="${input.bookingUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
      Book your session
    </a>
  </p>
  <p style="color:#888;font-size:13px;">${input.businessName}</p>
</div>`.trim();

  return { subject, text, html };
}
