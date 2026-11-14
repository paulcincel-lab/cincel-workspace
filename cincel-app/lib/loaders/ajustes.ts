import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { fetchMyWeekHoursAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canManageAppearance,
  canManageGeneralSettings,
  canManageTimeTracking,
  canViewTeamHours,
} from "@/lib/auth/permissions";
import { loadGoogleHealth } from "@/lib/auth/google-health";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { db } from "@/lib/db/client";
import { positions, staff, staffPositions, staffProfiles } from "@/lib/db/schema";
import { loadGmailAccess } from "@/lib/gmail/access";
import { withGroupStats } from "@/lib/google/group-stats";
import { getPickerDriveGrant, isPickerDriveConfigured, type PickerDriveStatus } from "@/lib/google/picker-drive";
import { withNotificationDefaults } from "@/lib/notifications/preferences";
import { loadNotificationPreferences } from "@/lib/notifications/preferences-server";
import { listPositions } from "@/lib/repositories/positions-repository";
import { listGroupMappings } from "@/lib/repositories/workspace-group-mappings-repository";
import { teamHoursReport } from "@/lib/time-tracking/report";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";
import { trackingEnabled } from "@/lib/time-tracking/state";
import type {
  GmailStatus,
  NotificationPreferences,
  OrgAppearance,
  PerfilData,
  TeamHoursRow,
  TimeTrackingSettings,
  WeekHours,
} from "@/lib/types/redesign";
import type { Position } from "@/lib/types/core";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";
import { getStoredOrgAppearance, withoutVersion } from "@/lib/ui/preferences-server";

/**
 * Ajustes loaders (Query Migration Phase 9): `(user, input?) => data`, one
 * per `qk.ajustes.page('<seg>')`. The page-data actions in
 * `lib/actions/page-data/ajustes-actions.ts` call them after the session
 * check, and the pages prefetch with them directly. What they return is
 * dehydrated into the page HTML, so each one returns only what the viewer may
 * see. Read-only: no writes, no OAuth token refresh, no revalidation.
 */

// ── Personal segments (9a) ──────────────────────────────────────────────────

export type AjustesAparienciaPageData = { org: OrgAppearance; isAdmin: boolean; overridesAllowed: boolean };
export type AjustesNotificacionesPageData = { preferences: NotificationPreferences };
export type AjustesPerfilPageData = { profile: PerfilData };
export type AjustesIntegracionesPageData = {
  gmail: GmailStatus;
  drive: Pick<PickerDriveStatus, "configured" | "hasDriveGrant">;
};

/** Gmail card status when the Gmail actions are off or the read fails. */
const DISCONNECTED_GMAIL: GmailStatus = { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null };

/**
 * Apariencia: the org appearance (theme cards, defaults) and the admin link.
 * The caller's own preferences are not here: they come from `useAppearance`,
 * seeded by the root layout.
 */
export async function loadAjustesApariencia(user: AuthenticatedUser): Promise<AjustesAparienciaPageData> {
  const org = withoutVersion(await getStoredOrgAppearance());
  return { org, isAdmin: canManageAppearance(user), overridesAllowed: org.allowUserOverride };
}

/** Notificaciones: the caller's matrix (one row per kind, defaults filled) and quiet hours. */
export async function loadAjustesNotificaciones(user: AuthenticatedUser): Promise<AjustesNotificacionesPageData> {
  return { preferences: withNotificationDefaults(await loadNotificationPreferences(user.member.id)) };
}

/** "Mis horas esta semana" only when time tracking is enabled for the caller; null otherwise or on a read error. */
async function loadOwnWeekHours(user: AuthenticatedUser): Promise<WeekHours | null> {
  if (!TIME_TRACKING_IMPLEMENTED.fetchMyWeekHoursAction) return null;
  try {
    if (!trackingEnabled(await getTimeTrackingSettings(), user.access)) return null;
    return await fetchMyWeekHoursAction();
  } catch (error) {
    console.error("[ajustes/perfil] week hours", error);
    return null;
  }
}

/**
 * Perfil: the caller's own nombre, teléfono, correo, puestos and firma, plus
 * this week's hours. The staff id is always the session's, and only these
 * fields leave the server (no HR data, no credentials). The photo is
 * `qk.me.profile()`.
 */
export async function loadAjustesPerfil(user: AuthenticatedUser): Promise<AjustesPerfilPageData> {
  const staffId = user.member.id;
  const [rows, positionRows, week] = await Promise.all([
    db
      .select({
        name: staff.name,
        phone: staff.phone,
        email: staff.email,
        emailSignature: staffProfiles.emailSignature,
      })
      .from(staff)
      .leftJoin(staffProfiles, eq(staffProfiles.staffId, staff.id))
      .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)))
      .limit(1),
    // The puesto line is read-only and secondary: a failed read leaves it empty instead of failing the page.
    db
      .select({ name: positions.name })
      .from(staffPositions)
      .innerJoin(positions, eq(positions.id, staffPositions.positionId))
      .where(and(eq(staffPositions.staffId, staffId), isNull(positions.deletedAt)))
      .orderBy(asc(positions.sortOrder), asc(positions.name))
      .catch((error: unknown) => {
        console.error("[ajustes/perfil] puestos", error);
        return [] as { name: string }[];
      }),
    loadOwnWeekHours(user),
  ]);
  const row = rows[0];
  return {
    profile: {
      staffId,
      name: row?.name ?? user.member.name,
      phone: row?.phone ?? "",
      email: row?.email ?? user.email ?? "",
      puesto: positionRows.map((position) => position.name).join(", "),
      emailSignature: row?.emailSignature ?? "",
      week,
    },
  };
}

/** The Gmail card status from the DB (no Google call). */
async function loadOwnGmailStatus(staffId: string): Promise<GmailStatus> {
  if (!GMAIL_IMPLEMENTED.fetchGmailStatusAction) return DISCONNECTED_GMAIL;
  try {
    const access = await loadGmailAccess(db, staffId);
    return {
      connected: access.connected,
      scopeOk: access.scopeOk,
      lastSyncedAt: access.account?.lastSyncedAt?.toISOString() ?? null,
      lastError: access.account?.lastError ?? null,
    };
  } catch (error) {
    console.error("[ajustes/integraciones] gmail status", error);
    return DISCONNECTED_GMAIL;
  }
}

/**
 * Integraciones: the Gmail status and the Drive grant, both **DB only**
 * (`getPickerDriveGrant` never refreshes a token), so rendering the page
 * makes no OAuth HTTP call and no DB write.
 */
export async function loadAjustesIntegraciones(user: AuthenticatedUser): Promise<AjustesIntegracionesPageData> {
  const staffId = user.member.id;
  const [gmail, drive] = await Promise.all([
    loadOwnGmailStatus(staffId),
    getPickerDriveGrant(staffId).catch((error: unknown) => {
      console.error("[ajustes/integraciones] drive grant", error);
      return { configured: isPickerDriveConfigured(), hasDriveGrant: false };
    }),
  ]);
  return { gmail, drive };
}

// ── Organization segments (9c): general, tema, horario, google ─────────────

export type AjustesGeneralPageData = { canManage: boolean; canManageAppearance: boolean };
export type AjustesTemaPageData = { org: OrgAppearance };
export type AjustesHorarioPageData = {
  settings: TimeTrackingSettings;
  rows: TeamHoursRow[];
  canManage: boolean;
  canViewReport: boolean;
};
export type AjustesGooglePageData = {
  mappings: GroupMapping[];
  positions: Pick<Position, "id" | "name">[];
  /** Null when the health read failed (Estado shows its error state). */
  health: GoogleHealth | null;
};

/**
 * General: only the capability flags. The settings themselves are
 * `qk.org.general()`, seeded by the root layout, so the page never reads
 * them again. FORBIDDEN without `canManageGeneralSettings`.
 */
export async function loadAjustesGeneral(user: AuthenticatedUser): Promise<AjustesGeneralPageData> {
  if (!canManageGeneralSettings(user)) throw new Error("FORBIDDEN: general settings");
  return { canManage: true, canManageAppearance: canManageAppearance(user) };
}

/** Tema: the published org appearance (per-request cache, 0 q after the layout). FORBIDDEN without `canManageAppearance`. */
export async function loadAjustesTema(user: AuthenticatedUser): Promise<AjustesTemaPageData> {
  if (!canManageAppearance(user)) throw new Error("FORBIDDEN: appearance");
  return { org: withoutVersion(await getStoredOrgAppearance()) };
}

/** Only the report fields leave the server (dehydrated into public HTML). */
function toTeamHoursRow(row: TeamHoursRow): TeamHoursRow {
  return {
    staffId: row.staffId,
    name: row.name,
    days: row.days.map((day) => ({ date: day.date, hours: day.hours })),
    total: row.total,
    target: row.target,
    lateCount: row.lateCount,
    status: row.status,
    needsReview: row.needsReview,
  };
}

/**
 * Horario for the week starting `weekStart` (a Monday). Reads the settings
 * once (`getTimeTrackingSettings` is a per-request cache) and hands them to
 * the report. `rows` is empty unless `canViewTeamHours`. FORBIDDEN without
 * either capability.
 */
export async function loadAjustesHorario(
  user: AuthenticatedUser,
  input: { weekStart: string },
): Promise<AjustesHorarioPageData> {
  const canManage = canManageTimeTracking(user);
  const canViewReport = canViewTeamHours(user);
  if (!canManage && !canViewReport) throw new Error("FORBIDDEN: time tracking");
  const settings = await getTimeTrackingSettings();
  let rows: TeamHoursRow[] = [];
  if (canViewReport && TIME_TRACKING_IMPLEMENTED.fetchTeamHoursAction) {
    try {
      rows = (await teamHoursReport(db, input.weekStart, settings)).map(toTeamHoursRow);
    } catch (error) {
      console.error("[ajustes/horario] team hours", error);
    }
  }
  return { settings, rows, canManage, canViewReport };
}

/** Estado without anything but the fields the card shows (no tokens, no secret values). */
function toGoogleHealth(health: GoogleHealth): GoogleHealth {
  return {
    workspaceDomain: health.workspaceDomain,
    oauthClientConfigured: health.oauthClientConfigured,
    groupMappingCount: health.groupMappingCount,
    roleGroupMappingCount: health.roleGroupMappingCount,
    serviceAccountEmail: health.serviceAccountEmail,
    sharedDriveId: health.sharedDriveId,
    tokenKeyConfigured: health.tokenKeyConfigured,
    lastDirectoryError: health.lastDirectoryError
      ? {
          at: health.lastDirectoryError.at,
          source: health.lastDirectoryError.source,
          kind: health.lastDirectoryError.kind,
          status: health.lastDirectoryError.status,
          message: health.lastDirectoryError.message,
        }
      : null,
    lastDriveError: health.lastDriveError
      ? { at: health.lastDriveError.at, message: health.lastDriveError.message }
      : null,
    googleLinkedStaff: health.googleLinkedStaff,
    activeStaff: health.activeStaff,
    pendingGoogleStaff: health.pendingGoogleStaff.map((person) => ({ id: person.id, name: person.name })),
    projectsWithoutFolder: health.projectsWithoutFolder,
    projectsWithFolder: health.projectsWithFolder,
  };
}

/**
 * Google (and `google/primeros-pasos`): mappings (with their Directory member
 * count and existence, cached: `withGroupStats`), the puestos a mapping can
 * point at (active or Google-managed) and Estado, in one `Promise.all`.
 * Read-only: the health read writes nothing. FORBIDDEN for anyone but an
 * Administrador (today's rule).
 */
export async function loadAjustesGoogle(user: Pick<AuthenticatedUser, "access">): Promise<AjustesGooglePageData> {
  if (user.access !== SYSTEM_ADMIN_ROLE) throw new Error("FORBIDDEN: google settings");
  const [mappings, positionRows, health] = await Promise.all([
    listGroupMappings().then((rows) => withGroupStats(rows)),
    listPositions(),
    loadGoogleHealth().then(toGoogleHealth, (error: unknown) => {
      console.error("[ajustes/google] health", error);
      return null;
    }),
  ]);
  const positionOptions = positionRows
    .filter((position) => position.active || position.googleManaged)
    .map((position) => ({ id: position.id, name: position.name }));
  return { mappings, positions: positionOptions, health };
}

// ── Monday (9d) ─────────────────────────────────────────────────────────────

export {
  loadAjustesMonday,
  type AjustesMondayPageData,
  type MondayPageViewer,
} from "@/lib/loaders/ajustes-monday";

// ── Catalog segments (9b): estatus, puestos, etapas, permisos ───────────────

export {
  loadAjustesEstatus,
  loadAjustesPermisos,
  loadAjustesPuestos,
  loadAjustesEtapas,
} from "@/lib/loaders/ajustes-catalogs";
