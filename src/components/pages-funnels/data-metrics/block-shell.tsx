import type { ReactNode } from "react";
import type { StyleConfig } from "@/types/pages-funnels-puck";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";

/** The outer box every native page block shares: id + System A styles. */
export function BlockShell({
  id,
  style,
  className,
  children,
}: {
  id: string;
  style?: StyleConfig;
  className?: string;
  children: ReactNode;
}) {
  const css = resolveResponsiveCss(id, style);
  return (
    <div id={id} className={className} style={resolveBaseStyleProps(style)}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {children}
    </div>
  );
}

/** Builder-only empty state: visible and selectable, never shown to visitors. */
export function BlockEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-4 text-center">
      {children}
    </div>
  );
}
