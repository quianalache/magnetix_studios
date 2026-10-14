import Link from "next/link";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SettingsSubNavigationItem {
  key: string;
  label: string;
  href: string;
}

export function SettingsSubNavigation({
  items,
  activeKey,
  onSelect,
}: {
  items: SettingsSubNavigationItem[];
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  const active = items.find((item) => item.key === activeKey) ?? items[0];

  return (
    <>
      <aside
        className="hidden self-start xl:block"
        aria-label="Settings sections"
      >
        <div className="rounded-card border-border bg-card shadow-card sticky top-5 border p-2">
          <div className="text-micro text-muted-foreground flex items-center gap-2 px-2.5 pt-1 pb-2 font-semibold tracking-[0.12em] uppercase">
            <Settings2 className="text-primary size-3.5" aria-hidden="true" />
            Settings
          </div>
          <nav className="space-y-0.5">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => onSelect?.(item.key)}
                aria-current={item.key === active?.key ? "page" : undefined}
                className={cn(
                  "rounded-control text-body-sm block px-2.5 py-2 transition-colors",
                  item.key === active?.key
                    ? "bg-tag-violet-bg text-primary font-medium"
                    : "text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="xl:hidden">
        <Select
          value={active?.key}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            const item = items.find((candidate) => candidate.key === value);
            if (!item) return;
            onSelect?.(item.key);
            window.location.assign(item.href);
          }}
          items={Object.fromEntries(
            items.map((item) => [item.key, item.label])
          )}
        >
          <SelectTrigger
            aria-label="Settings section"
            className="bg-card shadow-card"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
