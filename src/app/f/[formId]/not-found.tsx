import { FileX2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";


export default function FormNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Form not available"
      icon={FileX2}
      tone="warning"
      title="This form isn't available"
      description="It may have been removed. Check the link with whoever shared it."
    />
  );
}
