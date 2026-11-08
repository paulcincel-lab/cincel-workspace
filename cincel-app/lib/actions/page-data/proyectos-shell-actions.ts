"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

const ProyectoShellInput = z.object({ id: UuidSchema });

/**
 * `qk.proyectos.shell(id)` (Query Migration 1b, #954): the project header and
 * tab counts. Parses the input, requires a staff session (a guest gets
 * FORBIDDEN) and hands the viewer to the loader, which re-checks
 * `canViewProjects`: null when the project is out of scope or deleted.
 * Read-only, no Drive call.
 */
export async function getProyectoShell(input: z.input<typeof ProyectoShellInput>): Promise<ProjectTabShell | null> {
  const parsed = parseInput(ProyectoShellInput, input);
  return loadProyectoShell(await requireCapabilityUser(), parsed);
}
