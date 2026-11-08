import { NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { scheduleToday } from "@/lib/cronograma/today";
import * as scheduleRepository from "@/lib/repositories/schedule-repository";

/**
 * GET /api/proyectos/[id]/cronograma/export — same shape the reference
 * dashboard exports from localStorage (docs/specs/backend.md §7), so a
 * client can keep using the old standalone dashboard offline if they want.
 * 404 for a project that has no schedule, is soft-deleted or is outside the
 * caller's scope (the repository returns null for all three).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let user;
  try {
    user = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!resolveProjectsCapabilities(user).canViewProjects) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id: projectId } = await params;
  const data = await scheduleRepository.getScheduleForProject(projectId, viewerScopeOf(user));
  if (!data) {
    return NextResponse.json({ error: "Este proyecto no tiene un cronograma importado." }, { status: 404 });
  }

  const done: Record<string, "done" | "progress"> = {};
  const flags: Record<string, true> = {};
  for (const task of data.tasks) {
    if (task.status === "done" || task.status === "progress") done[task.stableKey] = task.status;
    if (task.flagged) flags[task.stableKey] = true;
  }

  return NextResponse.json({
    done,
    flags,
    imprevistos: data.imprevistos,
    offset: 0,
    today: scheduleToday(),
  });
}
