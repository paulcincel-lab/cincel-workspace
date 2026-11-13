"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  loadProyectoFicha,
  loadProyectoHistory,
  type ProyectoFichaData,
} from "@/lib/loaders/proyectos";
import type { HistoryPage } from "@/lib/repositories/history-repository";
// Cronograma (5c, #961)
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import { loadProyectoCronograma } from "@/lib/loaders/proyectos";
// Archivos and Clientes (5d, #962)
import {
  loadProyectoArchivos,
  loadProyectoClientes,
  loadProyectoClientesActivity,
  type ProyectoArchivosData,
  type ProyectoClientesData,
} from "@/lib/loaders/proyectos";
import type { PortalActivityRow } from "@/lib/types/portal";
// List, Resumen and Tareas (5a, #959)
import {
  loadProyectoResumen,
  loadProyectoResumenSummary,
  loadProyectoTareasSummary,
  loadProjectCreateStartOptions,
  loadProyectosPage,
  type ProyectosPageData,
} from "@/lib/loaders/proyectos";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import type { ProyectoTareasSummary } from "@/lib/proyectos/project-tasks-by-fase";
import type { ResumenTareasSummary } from "@/lib/proyectos/resumen-summary";
import type { ProjectCreateStartOptions } from "@/lib/types/core";
import { suggestAssignee, type AssigneeSuggestion } from "@/lib/proyectos/assignee-suggestion";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";
import type { DeletedProjectRow, ProjectDeletePreview } from "@/lib/types/project-delete";
import { canSeeAdminData, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import * as projectsRepository from "@/lib/repositories/projects-repository";

/**
 * Proyectos page-data reads (Query Migration Phase 5). Each one parses its
 * input, requires a staff session (a guest gets FORBIDDEN) and hands the
 * viewer to its loader in `lib/loaders/proyectos.ts`, which re-checks
 * `canViewProjects`. Read-only: no revalidation, no writes.
 */

// ── Ficha (5b, #960) ─────────────────────────────────────────────────────────

const ProyectoFichaInput = z.object({ id: UuidSchema });
const ProyectoHistoryInput = z.object({ id: UuidSchema, cursor: UuidSchema.nullable().optional() });

/** `qk.proyectos.tab(id, 'ficha')`: null for a project out of scope or deleted. */
export async function getProyectoFichaData(input: z.input<typeof ProyectoFichaInput>): Promise<ProyectoFichaData | null> {
  const parsed = parseInput(ProyectoFichaInput, input);
  return loadProyectoFicha(await requireCapabilityUser(), parsed);
}

/** `qk.proyectos.history(id)`: one Bitácora page after `cursor`, newest first. */
export async function getProyectoHistoryPage(input: z.input<typeof ProyectoHistoryInput>): Promise<HistoryPage> {
  const parsed = parseInput(ProyectoHistoryInput, input);
  return loadProyectoHistory(await requireCapabilityUser(), parsed);
}

// ── Cronograma and Reporte (5c, #961) ────────────────────────────────────────

const ProyectoCronogramaInput = z.object({ id: UuidSchema });

/**
 * `qk.proyectos.cronograma(id)`, shared by Cronograma and Reporte: the whole
 * schedule and today's date. `data.payments` is `[]` unless the viewer is an
 * admin; null when the project is out of scope, deleted or has no schedule.
 */
export async function getProyectoCronogramaData(
  input: z.input<typeof ProyectoCronogramaInput>,
): Promise<ScheduleViewData | null> {
  const parsed = parseInput(ProyectoCronogramaInput, input);
  return loadProyectoCronograma(await requireCapabilityUser(), parsed);
}

// ── Archivos and Clientes (5d, #962) ─────────────────────────────────────────

const ProyectoArchivosInput = z.object({ id: UuidSchema, folderId: z.string().min(1).nullable() });
const ProyectoClientesInput = z.object({ id: UuidSchema });

/**
 * `qk.proyectos.archivos(id, folder)`: one Drive folder of the project.
 * `not_found` for a project out of scope or deleted, with no Drive call.
 */
export async function getProyectoArchivosData(
  input: z.input<typeof ProyectoArchivosInput>,
): Promise<ProyectoArchivosData> {
  const parsed = parseInput(ProyectoArchivosInput, input);
  return loadProyectoArchivos(await requireCapabilityUser(), parsed);
}

/**
 * `qk.proyectos.tab(id, 'clientes')`: access rows, invitable contacts and the
 * client folder link. FORBIDDEN without `portal.manageAccess`; null for a
 * project out of scope or deleted.
 */
export async function getProyectoClientesData(
  input: z.input<typeof ProyectoClientesInput>,
): Promise<ProyectoClientesData | null> {
  const parsed = parseInput(ProyectoClientesInput, input);
  return loadProyectoClientes(await requireCapabilityUser(), parsed);
}

/** `qk.proyectos.clientesActivity(id)`: the last 50 client file events; same checks as the Clientes data. */
export async function getProyectoClientesActivity(
  input: z.input<typeof ProyectoClientesInput>,
): Promise<PortalActivityRow[] | null> {
  const parsed = parseInput(ProyectoClientesInput, input);
  return loadProyectoClientesActivity(await requireCapabilityUser(), parsed);
}

// ── List, Resumen and Tareas (5a, #959) ──────────────────────────────────────

const ProyectosPageInput = z.object({});
const ProyectoResumenInput = z.object({ id: UuidSchema });
const ProyectoTareasInput = z.object({ id: UuidSchema });

/**
 * `qk.proyectos.list()`: projects, portfolio rows (`budgetSpentPct` null for
 * non-admins), etapas and the create dialog's flags. Empty lists without
 * `canViewProjects`.
 */
export async function getProyectosPageData(input: z.input<typeof ProyectosPageInput> = {}): Promise<ProyectosPageData> {
  parseInput(ProyectosPageInput, input);
  return loadProyectosPage(await requireCapabilityUser());
}

/** `qk.proyectos.createStart()`: the create dialog's "Etapa inicial" options; null when the viewer can't pick one. */
export async function getProjectCreateStartOptions(
  input: z.input<typeof ProyectosPageInput> = {},
): Promise<ProjectCreateStartOptions | null> {
  parseInput(ProyectosPageInput, input);
  return loadProjectCreateStartOptions(await requireCapabilityUser());
}

/** `qk.proyectos.resumen(id)`: null for a project out of scope or deleted; admin data stripped for non-admins. */
export async function getProyectoResumenData(
  input: z.input<typeof ProyectoResumenInput>,
): Promise<ProjectSummaryInput | null> {
  const parsed = parseInput(ProyectoResumenInput, input);
  return loadProyectoResumen(await requireCapabilityUser(), parsed);
}

/**
 * `qk.proyectos.resumenSummary(id)` (#1051): the Resumen's task numbers as
 * server aggregates; null for a project out of scope or deleted.
 */
export async function getProyectoResumenSummary(input: z.input<typeof ProyectoTareasInput>): Promise<ResumenTareasSummary | null> {
  const parsed = parseInput(ProyectoTareasInput, input);
  return loadProyectoResumenSummary(await requireCapabilityUser(), parsed);
}

const ProyectoTareasSummaryInput = z.object({
  id: UuidSchema,
  responsable: z.union([z.literal("sin"), UuidSchema]).nullable(),
  q: z.string().max(200),
});

/** `qk.proyectos.tareasSummary(id, f)` (#1051): the Tareas tab's counts; null for a project out of scope or deleted. */
export async function getProyectoTareasSummary(
  input: z.input<typeof ProyectoTareasSummaryInput>,
): Promise<ProyectoTareasSummary | null> {
  const parsed = parseInput(ProyectoTareasSummaryInput, input);
  return loadProyectoTareasSummary(await requireCapabilityUser(), parsed);
}

// ── Resumen Analítico quick-add hint (#997) ──────────────────────────────────

const ProyectoAssigneeSuggestionInput = z.object({ id: UuidSchema, phaseId: UuidSchema, staffId: UuidSchema });

/**
 * `qk.proyectos.assigneeSuggestion(id, phaseId, staffId)`: someone under
 * 60 % load who completed tasks of the fase in other projects, instead of
 * `staffId`; null when nobody qualifies or the viewer can't create tasks.
 */
export async function getProyectoAssigneeSuggestion(
  input: z.input<typeof ProyectoAssigneeSuggestionInput>,
): Promise<AssigneeSuggestion> {
  const parsed = parseInput(ProyectoAssigneeSuggestionInput, input);
  return suggestAssignee(await requireCapabilityUser(), {
    projectId: parsed.id,
    phaseId: parsed.phaseId,
    excludeStaffId: parsed.staffId,
  });
}

// ── Delete and restore (#1050) ───────────────────────────────────────────────

/** `qk.proyectos.deletePreview(id)`: the delete dialog's counts. FORBIDDEN without `canDeleteProject`. */
export async function getProjectDeletePreview(id: string): Promise<ProjectDeletePreview | null> {
  const projectId = parseInput(UuidSchema, id);
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canDeleteProject) throw new Error("FORBIDDEN: project delete");
  return projectsRepository.getProjectDeletePreview(projectId);
}

/** `qk.proyectos.deleted()`: the projects deleted in the last 30 days. FORBIDDEN unless admin. */
export async function getDeletedProjects(): Promise<DeletedProjectRow[]> {
  const user = await requireCapabilityUser();
  if (!canSeeAdminData(user)) throw new Error("FORBIDDEN: deleted projects");
  return projectsRepository.listDeletedProjects();
}
