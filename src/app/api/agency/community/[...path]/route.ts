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

import { createApiDispatcher } from "@/lib/server/api-dispatch";

export const dynamic = "force-dynamic";

// Agency Community API — one route for every endpoint (Vercel route limit).
// Uses the shared dispatcher (2026-09-29), which applies Next's precedence
// (static segments before dynamic ones): the earlier first-match table sent
// GET …/courses/catalog to the courses/[courseId] handler.
const d = createApiDispatcher([
  ["[groupId]/channels/[channelId]", r0],
  ["[groupId]/channels", r1],
  ["[groupId]/courses/[courseId]/lessons/[lessonId]/complete", r2],
  ["[groupId]/courses/[courseId]/lessons/[lessonId]", r3],
  ["[groupId]/courses/[courseId]/lessons", r4],
  ["[groupId]/courses/[courseId]/player", r5],
  ["[groupId]/courses/[courseId]", r6],
  ["[groupId]/courses/[courseId]/sections/[sectionId]", r7],
  ["[groupId]/courses/[courseId]/sections", r8],
  ["[groupId]/courses/catalog", r9],
  ["[groupId]/courses/product/[courseId]/lessons/[lessonId]/complete", r10],
  ["[groupId]/courses/product/[courseId]/player", r11],
  ["[groupId]/courses", r12],
  ["[groupId]/events/[eventId]/join", r13],
  ["[groupId]/events/[eventId]/moderation", r14],
  ["[groupId]/events", r15],
  ["[groupId]/leaderboard", r16],
  ["[groupId]/live-rooms/moderation", r17],
  ["[groupId]/live-rooms", r18],
  ["[groupId]/members/[memberId]/resend", r19],
  ["[groupId]/members/[memberId]", r20],
  ["[groupId]/members", r21],
  ["[groupId]/mention-members", r22],
  ["[groupId]/points-rewards/config", r23],
  ["[groupId]/points-rewards/levels", r24],
  ["[groupId]/points-rewards/rewards/[rewardId]/archive", r25],
  ["[groupId]/points-rewards/rewards/[rewardId]/eligible-winners", r26],
  ["[groupId]/points-rewards/rewards/[rewardId]", r27],
  ["[groupId]/points-rewards/rewards", r28],
  ["[groupId]/points-rewards", r29],
  ["[groupId]/points-rewards/winners/[winnerId]", r30],
  ["[groupId]/points-rewards/winners", r31],
  ["[groupId]/post-files", r32],
  ["[groupId]/post-images", r33],
  ["[groupId]/posts/[postId]/comments/[commentId]/like", r34],
  ["[groupId]/posts/[postId]/comments/[commentId]", r35],
  ["[groupId]/posts/[postId]/comments", r36],
  ["[groupId]/posts/[postId]/like", r37],
  ["[groupId]/posts/[postId]/live-watch", r38],
  ["[groupId]/posts/[postId]/poll/vote", r39],
  ["[groupId]/posts/[postId]/replay", r40],
  ["[groupId]/posts/[postId]", r41],
  ["[groupId]/posts", r42],
  ["[groupId]", r43],
  ["[groupId]/sections/[sectionId]", r44],
  ["[groupId]/sections", r45],
  ["[groupId]/settings/upload", r46],
  ["[groupId]/voice-notes", r47],
  ["", r48],
]);

// Only the methods this API has always served; any other method is a 404.
export const GET = d.GET;
export const POST = d.POST;
export const PATCH = d.PATCH;
export const DELETE = d.DELETE;
