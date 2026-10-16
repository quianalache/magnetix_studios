import { SearchX } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";


export default function SalesPageNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Page not available"
      icon={SearchX}
      tone="warning"
      title="This page isn't available"
      description="It may have been unpublished or moved. Check the link with whoever shared it."
    />
  );
}
