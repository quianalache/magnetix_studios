import "server-only";

import { NextResponse } from "next/server";
import { getCurrentStaffUser } from "@/lib/auth/current-staff";
import { requireTaskAccess } from "@/lib/server/project-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import {
  getActiveTimer,
  startTimer,
  stopTimer,
} from "@/lib/server/time-tracking-service";

/**
 * The signed-in staff member's single timer.
 * GET → the running timer (or null). POST {action:"start", taskId} starts
 * (switching safely from any running one); POST {action:"stop"} stops.
 */
export async function GET() {
  const uid = (await getCurrentStaffUser())?.uid;
  if (!uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ timer: await getActiveTimer({ kind: "staff", uid }) });
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    if (body.action === "start") {
      const taskId = typeof body.taskId === "string" ? body.taskId : "";
      const guard = await requireTaskAccess(request, taskId);
      if (guard instanceof NextResponse) return guard;
      const result = await startTimer(
        { kind: "staff", uid: guard.access.uid },
        { id: taskId, ...guard.task }
      );
      return NextResponse.json(result);
    }
    if (body.action === "stop") {
      const uid = (await getCurrentStaffUser())?.uid;
      if (!uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
      return NextResponse.json({ stopped: await stopTimer({ kind: "staff", uid }) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
