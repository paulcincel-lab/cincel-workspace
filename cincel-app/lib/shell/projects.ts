import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { etapaColorVar } from "@/lib/etapas/etapa-color";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import type { ShellProjects } from "@/lib/types/shell";

/**
 * `qk.shell.projects()` loader: every project the viewer can see on
 * `/proyectos` (the same `listProjects` read and viewer scope), reduced to
 * id, name, status and the current etapa's color. Empty without
 * `canViewProjects`. No writes.
 */
export async function loadShellProjects(user: AuthenticatedUser): Promise<ShellProjects> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  const rows = await projectsRepository.listProjects({}, viewerScopeOf(user));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    colorVar: etapaColorVar(
      row.currentWorkflow
        ? {
            key: row.currentWorkflow.key,
            sortOrder: row.currentWorkflow.sortOrder,
            colorSlot: row.currentWorkflow.colorSlot ?? null,
          }
        : null,
    ),
  }));
}
