"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  loadAjustesApariencia,
  loadAjustesGeneral,
  loadAjustesGoogle,
  loadAjustesHorario,
  loadAjustesTema,
  loadAjustesIntegraciones,
  loadAjustesNotificaciones,
  loadAjustesPerfil,
  type AjustesAparienciaPageData,
  type AjustesGeneralPageData,
  type AjustesGooglePageData,
  type AjustesHorarioPageData,
  type AjustesTemaPageData,
  type AjustesIntegracionesPageData,
  type AjustesNotificacionesPageData,
  type AjustesPerfilPageData,
} from "@/lib/loaders/ajustes";
import { parseInput } from "@/lib/validation/project-flow";
import { TeamHoursInputSchema } from "@/lib/validation/redesign";
import { getSessionAccess } from "@/lib/auth/session";
import { loadAjustesMonday, type AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";
import {
  loadAjustesEstatus,
  loadAjustesPermisos,
  loadAjustesPuestos,
  loadAjustesEtapas,
} from "@/lib/loaders/ajustes-catalogs";
import type {
  AjustesEstatusPageData,
  AjustesPermisosPageData,
  AjustesPuestosPageData,
  AjustesEtapasPageData,
} from "@/lib/types/ajustes-catalogs";

/**
 * Ajustes page data (Query Migration Phase 9), one action per
 * `qk.ajustes.page('<seg>')`. Each parses its input, re-checks the segment
 * capability (a guest gets FORBIDDEN) and hands the viewer to its loader in
 * `lib/loaders/ajustes.ts`. Read-only: no writes, no revalidation.
 */

const EmptyInput = z.object({});

// ── Personal segments (9a): any staff session ───────────────────────────────

/** Ajustes › Apariencia: org appearance, admin link, overrides policy. The user's preferences come from `useAppearance`. */
export async function getAjustesAparienciaPageData(
  input: z.input<typeof EmptyInput> = {},
): Promise<AjustesAparienciaPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesApariencia(await requireCapabilityUser());
}

/** Ajustes › Notificaciones: the caller's matrix and quiet hours. */
export async function getAjustesNotificacionesPageData(
  input: z.input<typeof EmptyInput> = {},
): Promise<AjustesNotificacionesPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesNotificaciones(await requireCapabilityUser());
}

/** Ajustes › Perfil: the caller's own profile only (the staff id comes from the session). */
export async function getAjustesPerfilPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesPerfilPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesPerfil(await requireCapabilityUser());
}

/** Ajustes › Integraciones: Gmail status and the DB-only Drive grant (no token refresh). */
export async function getAjustesIntegracionesPageData(
  input: z.input<typeof EmptyInput> = {},
): Promise<AjustesIntegracionesPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesIntegraciones(await requireCapabilityUser());
}

// ── Organization segments (9c): each loader re-checks the segment capability ─

/** Ajustes › General: the capability flags only (the settings are `qk.org.general()`). `canManageGeneralSettings`. */
export async function getAjustesGeneralPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesGeneralPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesGeneral(await requireCapabilityUser());
}

/** Ajustes › Tema y estilo: the published org appearance. `canManageAppearance`. */
export async function getAjustesTemaPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesTemaPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesTema(await requireCapabilityUser());
}

/**
 * Ajustes › Control de horario for one week (`weekStart`, a Monday): the
 * settings, the team report (empty without `canViewTeamHours`) and the
 * flags. `canManageTimeTracking` or `canViewTeamHours`.
 */
export async function getAjustesHorarioPageData(
  input: z.input<typeof TeamHoursInputSchema>,
): Promise<AjustesHorarioPageData> {
  const parsed = parseInput(TeamHoursInputSchema, input);
  return loadAjustesHorario(await requireCapabilityUser(), parsed);
}

/**
 * Ajustes › Google (and `google/primeros-pasos`): mappings, puestos and
 * Estado in one `Promise.all`. Administrador only.
 */
export async function getAjustesGooglePageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesGooglePageData> {
  parseInput(EmptyInput, input);
  return loadAjustesGoogle(await requireCapabilityUser());
}

// ── Monday (9d): Administrador who is not the bootstrap admin ───────────────

/**
 * Ajustes › Importar de monday: status, the latest run's state (read only:
 * never creates or resumes a run), the choices and the history in one
 * `Promise.all`. FORBIDDEN for a guest, an inactive account and anyone but an
 * Administrador who is not the bootstrap admin.
 */
export async function getAjustesMondayPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesMondayPageData> {
  parseInput(EmptyInput, input);
  const access = await getSessionAccess();
  if (access.status !== "active" || !access.user) throw new Error("FORBIDDEN");
  return loadAjustesMonday(access.user);
}

// ── Catalog segments (9b): each loader re-checks the segment capability ─────

/** Ajustes › Estatus: the custom task statuses. Administrador (the segment rule), else FORBIDDEN. */
export async function getAjustesEstatusPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesEstatusPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesEstatus(await requireCapabilityUser());
}

/** Ajustes › Puestos: the puestos and the etapas with their fases. Administrador, else FORBIDDEN. */
export async function getAjustesPuestosPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesPuestosPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesPuestos(await requireCapabilityUser());
}

/** Ajustes › Etapas y fases: every etapa with its fases and templates. Administrador, else FORBIDDEN. */
export async function getAjustesEtapasPageData(input: z.input<typeof EmptyInput> = {}): Promise<AjustesEtapasPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesEtapas(await requireCapabilityUser());
}

/**
 * Ajustes › Permisos: people per access, the default and the saved
 * permissions; no emails. FORBIDDEN for anyone but an Administrador.
 */
export async function getAjustesPermisosPageData(
  input: z.input<typeof EmptyInput> = {},
): Promise<AjustesPermisosPageData> {
  parseInput(EmptyInput, input);
  return loadAjustesPermisos(await requireCapabilityUser());
}
