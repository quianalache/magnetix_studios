import "server-only";

import * as communications from "@/lib/agency-communications-api/communications";
import * as communicationById from "@/lib/agency-communications-api/communication-by-id";
import * as communicationCancel from "@/lib/agency-communications-api/communication-cancel";
import * as communicationSends from "@/lib/agency-communications-api/communication-sends";
import * as audienceOptions from "@/lib/agency-communications-api/audience-options";
import * as audiencePreview from "@/lib/agency-communications-api/audience-preview";
import * as draftSave from "@/lib/agency-communications-api/draft-save";
import * as render from "@/lib/agency-communications-api/render";
import * as send from "@/lib/agency-communications-api/send";
import * as step from "@/lib/agency-communications-api/step";
import * as testSend from "@/lib/agency-communications-api/test-send";
import * as upload from "@/lib/agency-communications-api/upload";
import * as emailTemplates from "@/lib/agency-communications-api/email-templates";
import * as emailTemplateById from "@/lib/agency-communications-api/email-template-by-id";

export const dynamic = "force-dynamic";

type Handler = (request: Request, context: { params: Promise<unknown> }) =>
  | Response
  | Promise<Response>;

type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

function asModule(module: Record<string, unknown>): RouteModule {
  return module as unknown as RouteModule;
}

function routeFor(path: string[]): { module: RouteModule; params: Record<string, string> } | null {
  const [scope, first, second] = path;
  if (scope === "communications") {
    if (!first) return { module: asModule(communications), params: {} };
    if (first === "audience" && second === "options") return { module: asModule(audienceOptions), params: {} };
    if (first === "audience" && second === "preview") return { module: asModule(audiencePreview), params: {} };
    if (first === "draft" && second === "save") return { module: asModule(draftSave), params: {} };
    if (first === "render") return { module: asModule(render), params: {} };
    if (first === "send") return { module: asModule(send), params: {} };
    if (first === "step") return { module: asModule(step), params: {} };
    if (first === "test-send") return { module: asModule(testSend), params: {} };
    if (first === "upload") return { module: asModule(upload), params: {} };
    if (second === "cancel") return { module: asModule(communicationCancel), params: { id: first } };
    if (second === "sends") return { module: asModule(communicationSends), params: { id: first } };
    if (!second) return { module: asModule(communicationById), params: { id: first } };
  }
  if (scope === "email-templates") {
    if (!first) return { module: asModule(emailTemplates), params: {} };
    if (!second) return { module: asModule(emailTemplateById), params: { id: first } };
  }
  return null;
}

async function dispatch(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  method: keyof RouteModule,
) {
  const { path } = await context.params;
  const route = routeFor(path);
  const handler = route?.module[method];
  if (!handler) return new Response("Not found", { status: 404 });
  return handler(request, { params: Promise.resolve(route.params) });
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context, "GET");
}

export function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context, "POST");
}

export function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context, "PATCH");
}

export function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context, "DELETE");
}
