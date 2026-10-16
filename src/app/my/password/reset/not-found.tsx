import { KeyRound } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

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
    />
  );
}
