import { KeyRound } from "lucide-react";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";
import type { Metadata } from "next";

/** The not-found render takes this boundary's metadata (the page's is dropped). */
export const metadata: Metadata = { title: "Password link not valid" };

/** A password link without a token. */
export default function PasswordLinkNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Password link not valid"
      icon={KeyRound}
      tone="warning"
      title="This password link isn't valid"
      description="Open the most recent password email you received, or request a new link from the sign-in page."
      action={<PublicAction href="/my/login">Go to sign in</PublicAction>}
    />
  );
}
