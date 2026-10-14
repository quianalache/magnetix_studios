"use client";

import { useState } from "react";
import { Cable, Lock, ScrollText, Webhook } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubAccount } from "@/context/sub-account-context";
import { ApiLogsTab } from "./api-logs-tab";
import { WebhookLogsTab } from "./webhook-logs-tab";

type Tab = "api" | "webhooks";

const TABS: Array<{ key: Tab; label: string; icon: typeof Cable }> = [
  { key: "api", label: "API requests", icon: Cable },
  { key: "webhooks", label: "Webhooks", icon: Webhook },
];

/**
 * Logs landing. Renders an underline tab strip over the two log surfaces.
 * Each tab owns its own fetch + filter state so switching is cheap and the
 * inactive tab doesn't keep polling. Admin-only — collaborators see a lock.
 */
export function LogsView() {
  const { isAdmin } = useSubAccount();
  const [tab, setTab] = useState<Tab>("api");

  const header = (
    <PageHeader
      title="Logs"
      icon={ScrollText}
      description="Inspect recent public-API requests and outbound webhook deliveries for this sub-account. Read-only — useful for debugging integrations and failed deliveries."
    />
  );

  if (!isAdmin) {
    return (
      <>
        {header}
        <EmptyState
          icon={Lock}
          title="Logs are limited to sub-account admins"
          description="Request and webhook logs can include payload excerpts, so they follow the same access bar as API keys and webhooks. Ask your agency administrator for admin access on this sub-account."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList variant="underline" className="w-full justify-start gap-5 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              <t.icon />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "api" ? <ApiLogsTab /> : <WebhookLogsTab />}
    </>
  );
}
