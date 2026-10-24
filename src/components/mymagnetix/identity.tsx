import Link from "next/link";
import { cn } from "@/lib/utils";
import { PlatformMark } from "@/components/public/public-shell";

/** MyMagnetix wordmark: the Magnetix mark + "MyMagnetix", linking Home. Shared by the sidebar and the phone header. */
export function MyMagnetixIdentity({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <Link href="/my" className={cn("flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <PlatformMark size={size} idSuffix="-mymagnetix" />
      <span className="text-section font-semibold text-foreground">MyMagnetix</span>
    </Link>
  );
}
