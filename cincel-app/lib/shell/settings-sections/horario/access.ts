/**
 * Capabilities of Ajustes › Control de horario (redesign FE §3.8, §8; BE
 * §12): the segment admits `canManageTimeTracking` (settings) or
 * `canViewTeamHours` (team report); each section checks its own.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canManageTimeTracking, canViewTeamHours } from "@/lib/auth/permissions";

/** Segment guard of `/ajustes/horario`. */
export function canOpenHorario(user: AuthenticatedUser | null): boolean {
  return canManageTimeTracking(user) || canViewTeamHours(user);
}
