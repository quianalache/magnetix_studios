// Stub — see publish/README.md. Not built in this deployment, so it renders
// the branded "Page not found" state (same as /buy) instead of placeholder text.
import { notFound } from "next/navigation";

export default function Page() {
  notFound();
}
