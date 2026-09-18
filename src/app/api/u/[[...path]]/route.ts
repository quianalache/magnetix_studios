import "server-only";

import * as tenant from "@/lib/unsubscribe-api/tenant";
import * as agency from "@/lib/unsubscribe-api/agency";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path ?? [];
  if (path.length === 1) {
    return tenant.POST(request, { params: Promise.resolve({ token: path[0] }) });
  }
  if (path.length === 2 && path[0] === "agency") {
    return agency.POST(request, { params: Promise.resolve({ token: path[1] }) });
  }
  return new Response("Not found", { status: 404 });
}
