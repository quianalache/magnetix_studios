"use client";

import Link from "next/link";
import { openCrispChat } from "@/lib/crisp";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: August 3, 2026
        </p>

        <h2>1. Who We Are</h2>
        <p>
          Magnetix Studios (&ldquo;we,&rdquo; &ldquo;us&rdquo;) operates a
          hosted CRM platform used by businesses and creators to manage
          contacts, pipelines, bookings, courses, calendars, and client
          communication. This policy covers the Magnetix Studios application
          itself — the software you and your team log into and use — not
          just our marketing pages.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          <strong>Account data:</strong> when you or your team sign up, we
          collect name, email address, and authentication information.
        </p>
        <p>
          <strong>Business data you enter:</strong> contacts, deals, tasks,
          calendar events, quotes, forms, and other records you create while
          using the platform.
        </p>
        <p>
          <strong>Data from services you choose to connect:</strong> if you
          link an external account (Google Calendar, Meta/Instagram, Stripe,
          etc.), we receive the specific data described in Section 4 for the
          integration you enabled — never more than the scopes you were shown
          and approved.
        </p>
        <p>
          <strong>Technical data:</strong> IP address, browser type, device
          information, and usage logs, collected automatically for security
          and reliability.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We use collected information to operate and improve the platform,
          authenticate accounts, process payments, deliver the features you
          enable (email, SMS, calendar sync, messaging), provide support, and
          maintain security. We do not sell your data or your customers&rsquo;
          data to third parties.
        </p>

        <h2>4. Google Calendar Integration &amp; Google API Services</h2>
        <p>
          Magnetix Studios offers an optional, per-member Google Calendar
          connection. It is off by default and only activates when a team
          member explicitly clicks &ldquo;Connect Google Calendar&rdquo; and
          approves access through Google&rsquo;s own consent screen.
        </p>
        <p>When connected, we access:</p>
        <ul>
          <li>
            Your calendar events (titles, times, locations, and attendee
            information) — to display them alongside your CRM calendar, and
            to create, update, or delete events you make from within
            Magnetix Studios.
          </li>
          <li>
            Your Google account email address — to show which account is
            connected in Settings.
          </li>
        </ul>
        <p>
          This data is used solely to power the two-way calendar sync feature
          inside your own account. It is never shared with other users,
          other sub-accounts, or any third party, and is never used for
          advertising.
        </p>
        <p>
          Access and refresh tokens are stored server-side only and are never
          sent to the browser or exposed to any client-side code. Any team
          member can revoke access at any time via the &ldquo;Disconnect&rdquo;
          button in Settings, or directly from their Google Account&rsquo;s{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            connected apps page
          </a>
          . Disconnecting deletes the stored tokens and the synced calendar
          data immediately.
        </p>
        <p>
          Magnetix Studios&rsquo; use and transfer of information received
          from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>5. Other Third-Party Service Providers</h2>
        <p>
          We use third-party providers to deliver core functionality:
          database and authentication hosting, application hosting, payment
          processing, transactional email, and (when a business enables them)
          SMS and social-messaging channels. Each provider receives only the
          data necessary to perform its function and is bound by its own
          data-handling terms. We do not permit any provider to use this data
          for its own independent purposes.
        </p>

        <h2>6. Data Ownership for Business Customers</h2>
        <p>
          If you run a business (a &ldquo;sub-account&rdquo;) on Magnetix
          Studios, you are the data controller for the contacts, leads, and
          customer information you and your team enter — you decide what to
          collect from your own customers and are responsible for having the
          right to do so. Magnetix Studios processes that data on your
          behalf to provide the platform.
        </p>

        <h2>7. Data Retention</h2>
        <p>
          We retain account and business data for as long as your account is
          active, plus a reasonable period after cancellation to allow for
          recovery or as required by law. Connected Google Calendar data is
          deleted immediately upon disconnecting, as described in Section 4.
        </p>

        <h2>8. Security</h2>
        <p>
          We use industry-standard safeguards — encrypted connections,
          access-controlled databases, and server-side-only storage of
          sensitive credentials like OAuth tokens — to protect the
          information we hold. No system is 100% secure, and we continually
          work to improve our protections.
        </p>

        <h2>9. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have the right to access,
          correct, export, or delete the personal information we hold about
          you. Contact us to exercise these rights, or use the in-app
          controls (such as disconnecting an integration) where available.
        </p>

        <h2>10. Children&rsquo;s Privacy</h2>
        <p>
          Magnetix Studios is not directed at children under 13, and we do
          not knowingly collect personal information from them.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post
          the updated policy on this page with a new &ldquo;Last
          updated&rdquo; date.
        </p>

        <h2>12. Contact</h2>
        <p>
          For questions about this Privacy Policy,{" "}
          <button
            type="button"
            onClick={openCrispChat}
            className="underline-offset-4 hover:underline"
          >
            contact support via Chat
          </button>
          .
        </p>
      </article>
    </div>
  );
}
