"use server";

import { z } from "zod";

import {
  loadPortalHomeData,
  loadPortalProjectData,
  type PortalHomeData,
  type PortalProjectData,
} from "@/lib/loaders/portal";
import { requirePortalViewer } from "@/lib/portal/session";
import { parseInput, UuidSchema } from "@/lib/validation/project-flow";

/**
 * Portal page-data actions (Query Migration Phase 11): the query functions of
 * `qk.portal.projects()` and `qk.portal.project(id, tab)`. They live under
 * `lib/portal` because portal code never imports staff actions (eslint portal
 * boundary).
 *
 * Auth: a portal session, looked up read-only (`requirePortalViewer`, no
 * sliding write: query functions are side-effect free); without one they
 * redirect through the portal sign-out like the pages. Read-only.
 */

const PortalHomeInput = z.object({});

const PortalProjectInput = z.object({
  id: UuidSchema,
  tab: z.enum(["resumen", "cronograma", "archivos", "enviar"]),
});

/** `qk.portal.projects()`: the projects the signed-in client can see. */
export async function getPortalHomeData(input: z.input<typeof PortalHomeInput>): Promise<PortalHomeData> {
  parseInput(PortalHomeInput, input);
  return loadPortalHomeData(await requirePortalViewer());
}

/** `qk.portal.project(id, tab)`: one project tab, or null when the client has no access to the project. */
export async function getPortalProjectData(
  input: z.input<typeof PortalProjectInput>,
): Promise<PortalProjectData | null> {
  const parsed = parseInput(PortalProjectInput, input);
  return loadPortalProjectData(await requirePortalViewer(), parsed);
}
