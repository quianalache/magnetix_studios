"use client";

import Link from "next/link";
import { openCrispChat } from "@/lib/crisp";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: August 3, 2026
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Magnetix Studios (&ldquo;the Service&rdquo;),
          you agree to be bound by these Terms of Service. If you do not
          agree, do not use the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          Magnetix Studios is a hosted CRM platform provided by us
          (&ldquo;we,&rdquo; &ldquo;us&rdquo;). We host the application, the
          database, and the integrations it offers; you and your team access
          it as a logged-in service rather than installing or running
          anything yourselves.
        </p>

        <h2>3. Accounts &amp; Sub-Accounts</h2>
        <p>
          Each business using the Service operates under its own sub-account.
          You are responsible for the accuracy of the information you provide,
          for keeping your login credentials secure, and for the actions
          taken under your account by anyone you invite as a team member.
        </p>

        <h2>4. Fees &amp; Billing</h2>
        <p>
          Access to the Service is provided under the plan or arrangement
          communicated to you separately at signup. We may change pricing on
          a going-forward basis with reasonable notice; changes do not apply
          retroactively to periods already paid for.
        </p>

        <h2>5. Your Data</h2>
        <p>
          You own the contacts, leads, and other business data you and your
          team enter into your sub-account. We store and process that data on
          your behalf to provide the Service, and do not use it for any
          purpose outside operating and improving the platform, as described
          in our{" "}
          <Link href="/privacy">Privacy Policy</Link>. You are responsible
          for having the right to collect and store the customer information
          you enter, and for complying with applicable data-protection,
          electronic-communications, and consumer-protection laws for your
          own customers.
        </p>

        <h2>6. Third-Party Integrations</h2>
        <p>
          The Service offers optional integrations with third-party providers
          (for example: Google Calendar, payment processing, email, SMS, and
          social messaging). Each integration only activates when you or a
          team member explicitly connects it, and each is governed by that
          provider&rsquo;s own terms. We are not responsible for a
          third-party provider&rsquo;s availability, changes, or
          discontinuation, and a given feature may have reduced functionality
          if its provider is unavailable.
        </p>

        <h2>7. Acceptable Use</h2>
        <p>
          You agree not to use the Service to send unlawful, deceptive, or
          unsolicited communications (including in violation of CAN-SPAM,
          TCPA, or equivalent laws in your jurisdiction), to store or
          transmit content that infringes another party&rsquo;s rights, or to
          attempt to disrupt, reverse-engineer, or gain unauthorized access to
          the Service or other accounts.
        </p>

        <h2>8. Availability</h2>
        <p>
          We aim to keep the Service reliably available but do not guarantee
          uninterrupted or error-free operation. Scheduled maintenance or
          issues with an underlying third-party provider may cause temporary
          disruption.
        </p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranty of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>

        <h2>10. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, we shall not be liable for
          any indirect, incidental, special, consequential, or punitive
          damages, or for any loss of profits, revenue, data, or goodwill,
          arising out of or related to your use of the Service. Our total
          aggregate liability for any claim shall not exceed the amount you
          paid for the Service in the three months preceding the claim.
        </p>

        <h2>11. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or
          terminate an account that violates these Terms, engages in abusive
          use of the Service or its integrations, or where required by law.
          We will make a reasonable effort to notify you before suspending an
          account except where immediate action is necessary.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the
          updated Terms on this page with a new &ldquo;Last updated&rdquo;
          date. Continued use of the Service after changes constitutes
          acceptance of the revised Terms.
        </p>

        <h2>13. Contact</h2>
        <p>
          For questions about these Terms,{" "}
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
