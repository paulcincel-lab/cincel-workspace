import "server-only";

import { isPortalNotFound } from "@/lib/portal/drive-guard";
import { listPortalFolder } from "@/lib/portal/files";
import type { PortalProjectTab } from "@/lib/portal/project-tabs";
import { getPortalProject, getPortalProjectTramos, getPortalSchedule, listPortalProjects } from "@/lib/portal/queries";
import { requireProjectAccess, type PortalProjectAccess, type PortalUser } from "@/lib/portal/session";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalTramoDTO } from "@/lib/types/portal";

/**
 * Portal page-data loaders (Query Migration Phase 11, plan §4.3 Portal). The
 * server pages call them directly with the user they resolved; the
 * `lib/portal/page-data.ts` actions call them for client refetches.
 *
 * Security (plan §4.8 rule 2): what they return is dehydrated into the page
 * HTML, so they return portal DTOs only (built by the allow-list mappers in
 * `lib/portal/dto.ts` and `lib/portal/files.ts`), never repository rows.
 * They read and never write.
 */

/** `qk.portal.projects()`: the landing page. */
export type PortalHomeData = { projects: PortalProjectDTO[] };

/** `qk.portal.project(id, tab)`: one project tab. */
export type PortalProjectData = {
  project: PortalProjectDTO;
  /** Cronograma and Resumen; null otherwise, and when the project has no schedule. */
  schedule: PortalScheduleDTO | null;
  /** Resumen only; empty otherwise. */
  tramos: PortalTramoDTO[];
  /** Resumen only: the top of `02 Cliente`; null on other tabs, when not ready or when Drive fails. */
  documents: PortalFileDTO[] | null;
};

export async function loadPortalHomeData(user: PortalUser): Promise<PortalHomeData> {
  return { projects: await listPortalProjects(user.id) };
}

/**
 * Files at the top of the project's `02 Cliente` folder, or null when there is nothing to list yet (folders not
 * ready) or Drive can't be read: the page then has no documents section (the Archivos tab explains the state).
 */
async function loadSharedDocuments(access: PortalProjectAccess): Promise<PortalFileDTO[] | null> {
  if (access.driveFolderStatus !== "ready" || !access.driveClientFolderId) return null;
  try {
    return (await listPortalFolder({ driveClientFolderId: access.driveClientFolderId })).items;
  } catch (error) {
    if (!isPortalNotFound(error)) console.error("[portal] could not list the shared documents", error);
    return null;
  }
}

/**
 * One project tab, or null when the portal user has no active access to the
 * project (unknown, revoked, another client's, cancelled or deleted: the page
 * answers 404, never 403). `requireProjectAccess` runs once; the reads after
 * it take its result and don't check visibility again. Each tab reads only
 * what it shows: Resumen everything, Cronograma the schedule, Archivos and
 * Enviar the project alone (their lists are `portal.files` / `portal.uploads`).
 */
export async function loadPortalProjectData(
  user: PortalUser,
  input: { id: string; tab: PortalProjectTab },
): Promise<PortalProjectData | null> {
  let access: PortalProjectAccess;
  try {
    access = await requireProjectAccess(input.id, user);
  } catch (error) {
    if (isPortalNotFound(error)) return null;
    throw error;
  }

  const isResumen = input.tab === "resumen";
  const [project, schedule, tramos, documents] = await Promise.all([
    getPortalProject(access),
    isResumen || input.tab === "cronograma" ? getPortalSchedule(access) : Promise.resolve(null),
    isResumen ? getPortalProjectTramos(access) : Promise.resolve([]),
    isResumen ? loadSharedDocuments(access) : Promise.resolve(null),
  ]);
  if (!project) return null;
  return { project, schedule, tramos, documents };
}
