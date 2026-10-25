// Stub — see publish/README.md. A LeadStack-template-only Agency surface that
// isn't built in this deployment, so it renders the branded "Page not found"
// state (same as the public stubs) instead of placeholder text.
import { notFound } from "next/navigation";

export default function Page() {
  notFound();
}
