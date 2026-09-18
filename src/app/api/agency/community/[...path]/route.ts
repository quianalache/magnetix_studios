import "server-only";

import * as r0 from "@/lib/agency-community-api/_groupId___channels___channelId_";
import * as r1 from "@/lib/agency-community-api/_groupId___channels";
import * as r2 from "@/lib/agency-community-api/_groupId___courses___courseId___lessons___lessonId___complete";
import * as r3 from "@/lib/agency-community-api/_groupId___courses___courseId___lessons___lessonId_";
import * as r4 from "@/lib/agency-community-api/_groupId___courses___courseId___lessons";
import * as r5 from "@/lib/agency-community-api/_groupId___courses___courseId___player";
import * as r6 from "@/lib/agency-community-api/_groupId___courses___courseId_";
import * as r7 from "@/lib/agency-community-api/_groupId___courses___courseId___sections___sectionId_";
import * as r8 from "@/lib/agency-community-api/_groupId___courses___courseId___sections";
import * as r9 from "@/lib/agency-community-api/_groupId___courses__catalog";
import * as r10 from "@/lib/agency-community-api/_groupId___courses__product___courseId___lessons___lessonId___complete";
import * as r11 from "@/lib/agency-community-api/_groupId___courses__product___courseId___player";
import * as r12 from "@/lib/agency-community-api/_groupId___courses";
import * as r13 from "@/lib/agency-community-api/_groupId___events___eventId___join";
import * as r14 from "@/lib/agency-community-api/_groupId___events___eventId___moderation";
import * as r15 from "@/lib/agency-community-api/_groupId___events";
import * as r16 from "@/lib/agency-community-api/_groupId___leaderboard";
import * as r17 from "@/lib/agency-community-api/_groupId___live-rooms__moderation";
import * as r18 from "@/lib/agency-community-api/_groupId___live-rooms";
import * as r19 from "@/lib/agency-community-api/_groupId___members___memberId___resend";
import * as r20 from "@/lib/agency-community-api/_groupId___members___memberId_";
import * as r21 from "@/lib/agency-community-api/_groupId___members";
import * as r22 from "@/lib/agency-community-api/_groupId___mention-members";
import * as r23 from "@/lib/agency-community-api/_groupId___points-rewards__config";
import * as r24 from "@/lib/agency-community-api/_groupId___points-rewards__levels";
import * as r25 from "@/lib/agency-community-api/_groupId___points-rewards__rewards___rewardId___archive";
import * as r26 from "@/lib/agency-community-api/_groupId___points-rewards__rewards___rewardId___eligible-winners";
import * as r27 from "@/lib/agency-community-api/_groupId___points-rewards__rewards___rewardId_";
import * as r28 from "@/lib/agency-community-api/_groupId___points-rewards__rewards";
import * as r29 from "@/lib/agency-community-api/_groupId___points-rewards";
import * as r30 from "@/lib/agency-community-api/_groupId___points-rewards__winners___winnerId_";
import * as r31 from "@/lib/agency-community-api/_groupId___points-rewards__winners";
import * as r32 from "@/lib/agency-community-api/_groupId___post-files";
import * as r33 from "@/lib/agency-community-api/_groupId___post-images";
import * as r34 from "@/lib/agency-community-api/_groupId___posts___postId___comments___commentId___like";
import * as r35 from "@/lib/agency-community-api/_groupId___posts___postId___comments___commentId_";
import * as r36 from "@/lib/agency-community-api/_groupId___posts___postId___comments";
import * as r37 from "@/lib/agency-community-api/_groupId___posts___postId___like";
import * as r38 from "@/lib/agency-community-api/_groupId___posts___postId___live-watch";
import * as r39 from "@/lib/agency-community-api/_groupId___posts___postId___poll__vote";
import * as r40 from "@/lib/agency-community-api/_groupId___posts___postId___replay";
import * as r41 from "@/lib/agency-community-api/_groupId___posts___postId_";
import * as r42 from "@/lib/agency-community-api/_groupId___posts";
import * as r43 from "@/lib/agency-community-api/_groupId_";
import * as r44 from "@/lib/agency-community-api/_groupId___sections___sectionId_";
import * as r45 from "@/lib/agency-community-api/_groupId___sections";
import * as r46 from "@/lib/agency-community-api/_groupId___settings__upload";
import * as r47 from "@/lib/agency-community-api/_groupId___voice-notes";
import * as r48 from "@/lib/agency-community-api/root";

export const dynamic = "force-dynamic";

type Handler = (request: Request, context: { params: Promise<unknown> }) => Response | Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;
type RouteEntry = { segments: string[]; module: RouteModule };

function asModule(module: Record<string, unknown>): RouteModule {
  return module as unknown as RouteModule;
}

const routes: RouteEntry[] = [
  { segments: [":groupId","channels",":channelId"], module: asModule(r0) },
  { segments: [":groupId","channels"], module: asModule(r1) },
  { segments: [":groupId","courses",":courseId","lessons",":lessonId","complete"], module: asModule(r2) },
  { segments: [":groupId","courses",":courseId","lessons",":lessonId"], module: asModule(r3) },
  { segments: [":groupId","courses",":courseId","lessons"], module: asModule(r4) },
  { segments: [":groupId","courses",":courseId","player"], module: asModule(r5) },
  { segments: [":groupId","courses",":courseId"], module: asModule(r6) },
  { segments: [":groupId","courses",":courseId","sections",":sectionId"], module: asModule(r7) },
  { segments: [":groupId","courses",":courseId","sections"], module: asModule(r8) },
  { segments: [":groupId","courses","catalog"], module: asModule(r9) },
  { segments: [":groupId","courses","product",":courseId","lessons",":lessonId","complete"], module: asModule(r10) },
  { segments: [":groupId","courses","product",":courseId","player"], module: asModule(r11) },
  { segments: [":groupId","courses"], module: asModule(r12) },
  { segments: [":groupId","events",":eventId","join"], module: asModule(r13) },
  { segments: [":groupId","events",":eventId","moderation"], module: asModule(r14) },
  { segments: [":groupId","events"], module: asModule(r15) },
  { segments: [":groupId","leaderboard"], module: asModule(r16) },
  { segments: [":groupId","live-rooms","moderation"], module: asModule(r17) },
  { segments: [":groupId","live-rooms"], module: asModule(r18) },
  { segments: [":groupId","members",":memberId","resend"], module: asModule(r19) },
  { segments: [":groupId","members",":memberId"], module: asModule(r20) },
  { segments: [":groupId","members"], module: asModule(r21) },
  { segments: [":groupId","mention-members"], module: asModule(r22) },
  { segments: [":groupId","points-rewards","config"], module: asModule(r23) },
  { segments: [":groupId","points-rewards","levels"], module: asModule(r24) },
  { segments: [":groupId","points-rewards","rewards",":rewardId","archive"], module: asModule(r25) },
  { segments: [":groupId","points-rewards","rewards",":rewardId","eligible-winners"], module: asModule(r26) },
  { segments: [":groupId","points-rewards","rewards",":rewardId"], module: asModule(r27) },
  { segments: [":groupId","points-rewards","rewards"], module: asModule(r28) },
  { segments: [":groupId","points-rewards"], module: asModule(r29) },
  { segments: [":groupId","points-rewards","winners",":winnerId"], module: asModule(r30) },
  { segments: [":groupId","points-rewards","winners"], module: asModule(r31) },
  { segments: [":groupId","post-files"], module: asModule(r32) },
  { segments: [":groupId","post-images"], module: asModule(r33) },
  { segments: [":groupId","posts",":postId","comments",":commentId","like"], module: asModule(r34) },
  { segments: [":groupId","posts",":postId","comments",":commentId"], module: asModule(r35) },
  { segments: [":groupId","posts",":postId","comments"], module: asModule(r36) },
  { segments: [":groupId","posts",":postId","like"], module: asModule(r37) },
  { segments: [":groupId","posts",":postId","live-watch"], module: asModule(r38) },
  { segments: [":groupId","posts",":postId","poll","vote"], module: asModule(r39) },
  { segments: [":groupId","posts",":postId","replay"], module: asModule(r40) },
  { segments: [":groupId","posts",":postId"], module: asModule(r41) },
  { segments: [":groupId","posts"], module: asModule(r42) },
  { segments: [":groupId"], module: asModule(r43) },
  { segments: [":groupId","sections",":sectionId"], module: asModule(r44) },
  { segments: [":groupId","sections"], module: asModule(r45) },
  { segments: [":groupId","settings","upload"], module: asModule(r46) },
  { segments: [":groupId","voice-notes"], module: asModule(r47) },
  { segments: [], module: asModule(r48) },
];

function matchRoute(path: string[]): { entry: RouteEntry; params: Record<string, string> } | null {
  for (const entry of routes) {
    if (entry.segments.length !== path.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < entry.segments.length; i += 1) {
      const expected = entry.segments[i];
      if (expected.startsWith(":")) params[expected.slice(1)] = path[i];
      else if (expected !== path[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { entry, params };
  }
  return null;
}

async function dispatch(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  method: keyof RouteModule,
) {
  const route = matchRoute((await context.params).path);
  const handler = route?.entry.module[method];
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
