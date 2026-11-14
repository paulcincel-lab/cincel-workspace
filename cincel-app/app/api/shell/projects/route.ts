/**
 * GET /api/shell/projects: the projects of the sidebar "Proyectos" submenu
 * (`qk.shell.projects()`). Same checks as `/api/shell/badges`: no session
 * is a 401, a session without system access a 403. `private, no-store`:
 * the list is the caller's own scope. No side effects.
 */
import { NextResponse } from "next/server";

import { getSessionAccess } from "@/lib/auth/session";
import { capabilityUserOf } from "@/lib/shell/badges";
import { loadShellProjects } from "@/lib/shell/projects";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(): Promise<Response> {
  const access = await getSessionAccess();
  if (access.status === "guest") {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: NO_STORE });
  }
  if (access.status !== "active" || !access.user) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: NO_STORE });
  }
  const projects = await loadShellProjects(capabilityUserOf(access.user));
  return NextResponse.json(projects, { status: 200, headers: NO_STORE });
}
