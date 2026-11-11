/**
 * Capabilities of the Ajustes › Organización segments (redesign FE §3.8, §8;
 * BE §12.2). One rule per segment, shared by the server segment guards in
 * `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` and by `AjustesNav`, so a
 * nav item is shown exactly when its page opens. Client-safe (no server-only
 * imports): client gating mirrors the rules for rendering only.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canManageAppearance,
  canManageGeneralSettings,
  canManageTimeTracking,
  canViewTeamHours,
} from "@/lib/auth/permissions";

export type AjustesAdminSegment =
  | "general"
  | "tema"
  | "horario"
  | "tramos"
  | "puestos"
  | "estatus"
  | "permisos"
  | "monday"
  | "google"
  | "eliminados";

export const AJUSTES_ADMIN_SEGMENTS: readonly AjustesAdminSegment[] = [
  "general",
  "tema",
  "horario",
  "tramos",
  "puestos",
  "estatus",
  "permisos",
  "monday",
  "google",
  "eliminados",
];

export type AjustesSegmentCapability = (user: AuthenticatedUser) => boolean;

/** Today's rule of the legacy `/configuracion` pages: access "Administrador". */
export function isSettingsAdministrator(user: AuthenticatedUser | null): boolean {
  return user?.access === "Administrador";
}

/**
 * Project Flow's settings pages ("Tramos y fases", "Puestos", FE §21.2). They
 * exist on this branch (`app/configuracion/tramos`, `app/configuracion/puestos`);
 * a page set to false 404s under `/ajustes` and is hidden from `AjustesNav`.
 */
export const PROJECT_FLOW_SETTINGS_PAGES: Readonly<Record<"tramos" | "puestos", boolean>> = {
  tramos: true,
  puestos: true,
};

/** The capability that guards each segment (and shows its nav item). */
export const AJUSTES_SEGMENT_CAPABILITY: Readonly<Record<AjustesAdminSegment, AjustesSegmentCapability>> = {
  general: (user) => canManageGeneralSettings(user),
  tema: (user) => canManageAppearance(user),
  // The settings sections need canManageTimeTracking and the report canViewTeamHours;
  // the segment admits either and each section checks its own capability.
  horario: (user) => canManageTimeTracking(user) || canViewTeamHours(user),
  tramos: (user) => PROJECT_FLOW_SETTINGS_PAGES.tramos && isSettingsAdministrator(user),
  puestos: (user) => PROJECT_FLOW_SETTINGS_PAGES.puestos && isSettingsAdministrator(user),
  estatus: (user) => isSettingsAdministrator(user),
  permisos: (user) => isSettingsAdministrator(user),
  monday: (user) => isSettingsAdministrator(user),
  google: (user) => isSettingsAdministrator(user),
  // "Proyectos eliminados" (#1050): restore within 30 days, admins only.
  eliminados: (user) => isSettingsAdministrator(user),
};

export type AjustesVisibleSegments = Readonly<Record<AjustesAdminSegment, boolean>>;

/** Which Organización segments the viewer may open (all false without a user). */
export function resolveAjustesSegments(user: AuthenticatedUser | null): AjustesVisibleSegments {
  const out = {} as Record<AjustesAdminSegment, boolean>;
  for (const segment of AJUSTES_ADMIN_SEGMENTS) {
    out[segment] = user ? AJUSTES_SEGMENT_CAPABILITY[segment](user) : false;
  }
  return out;
}
