import { LogsView } from "@/components/logs/logs-view";
import { PageShell } from "@/components/system/page-shell";

/**
 * Sub-account Logs — read-only delivery + request history for the public
 * API surface. Tabbed: API requests and Webhook deliveries. Admin-only
 * (the view itself enforces it via the sub-account role).
 */
export default function LogsPage() {
  return (
    <PageShell width="data">
      <LogsView />
    </PageShell>
  );
}
