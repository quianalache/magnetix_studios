import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { generateAiPage, listAiPageSources, recordAiGenerationTelemetry, AiPageGenerationError } from "@/lib/server/ai-page-generation-service";
import { AI_PAGE_MODEL } from "@/lib/pages-funnels/ai/page-plan";
import type { AiPageOutcome, AiBindingType } from "@/lib/pages-funnels/ai/page-plan";

export const dynamic = "force-dynamic";

const activeGenerations = new Map<string, number>();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try { return NextResponse.json(await listAiPageSources(id)); }
  catch { return NextResponse.json({ error: "Could not load page sources." }, { status: 500 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const key = `${access.uid}:${id}`;
  if (activeGenerations.has(key)) return NextResponse.json({ error: "A page is already being generated for this workspace." }, { status: 429 });
  activeGenerations.set(key, Date.now());
  const requestId = randomUUID();
  const started = Date.now();
  try {
    const body = await request.json() as Record<string, unknown>;
    const outcome = typeof body.outcome === "string" ? body.outcome as AiPageOutcome : null;
    const bindingRaw = body.binding && typeof body.binding === "object" ? body.binding as Record<string, unknown> : null;
    const binding = bindingRaw && typeof bindingRaw.type === "string" && typeof bindingRaw.id === "string"
      ? { type: bindingRaw.type as AiBindingType, id: bindingRaw.id.trim() }
      : null;
    if (!outcome) return NextResponse.json({ error: "Choose what this page should do." }, { status: 400 });
    if ((outcome === "sell_offer" && binding?.type !== "offer") || ((outcome === "collect_leads" || outcome === "waitlist") && binding?.type !== "form") || (outcome === "registration" && binding?.type !== "webinar") || (outcome === "something_else" && (!binding || binding.type !== "primary_action" || !binding.id))) {
      return NextResponse.json({ error: "Choose the required real Magnetix object for this page." }, { status: 400 });
    }
    const sub = await (await import("@/lib/firebase/admin")).getAdminDb().doc(`subAccounts/${id}`).get();
    const agencyId = typeof sub.get("agencyId") === "string" ? sub.get("agencyId") as string : access.agencyId;
    if (!agencyId) return NextResponse.json({ error: "Workspace is not configured." }, { status: 400 });
    const result = await generateAiPage({
      subAccountId: id, agencyId, uid: access.uid,
      name: typeof body.name === "string" ? body.name : "AI Page",
      outcome, binding, prompt: typeof body.prompt === "string" ? body.prompt : "",
      useBusinessBrain: body.useBusinessBrain !== false,
      requestId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof AiPageGenerationError ? error.message : error instanceof Error ? error.message : "Page generation failed.";
    const status = error instanceof AiPageGenerationError ? error.status : 502;
    await recordAiGenerationTelemetry({ requestId, subAccountId: id, uid: access.uid, model: AI_PAGE_MODEL, status: "failure", durationMs: Date.now() - started, errorCode: error instanceof AiPageGenerationError ? error.code : "provider", errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status });
  } finally { activeGenerations.delete(key); }
}
