"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/auth-context";
import { CRM_FORCED_THEME, isCrmRoute } from "@/lib/theme/crm-theme";

function ThemedToaster() {
  const { resolvedTheme, forcedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme={(forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light"}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    // The internal CRM is light-only for now (owner decision 2026-10-13 —
    // dark mode is a future design task, not abandoned). Forcing it here keeps
    // next-themes and the .dark tokens intact for later; routes outside the
    // CRM keep their existing behavior.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      forcedTheme={isCrmRoute(pathname) ? CRM_FORCED_THEME : undefined}
    >
      <AuthProvider>
        {children}
        <ThemedToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
