/**
 * Why a Google staff sign-in was refused or access was revoked (BE §A.4).
 * These are the `motivo` values of `/login/denegado?motivo=…`, shared by the
 * sign-in callback, the periodic re-check and the frontend. `revoked` comes
 * from the re-check (§A.5).
 */
export const WORKSPACE_DENIAL_REASONS = [
  "no_role_group",
  "workspace_suspended",
  "workspace_deleted",
  "domain",
  "inactive",
  "sub_mismatch",
  "needs_link",
  "revoked",
] as const;

export type WorkspaceDenialReason = (typeof WORKSPACE_DENIAL_REASONS)[number];

export function isWorkspaceDenialReason(value: unknown): value is WorkspaceDenialReason {
  return typeof value === "string" && (WORKSPACE_DENIAL_REASONS as readonly string[]).includes(value);
}
