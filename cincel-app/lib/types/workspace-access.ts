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

/** Which Workspace group means which role or area (BE §A.7, FE §5). */
export type GroupMappingKind = "role" | "area";

export type GroupMapping = {
  id: string;
  groupEmail: string;
  kind: GroupMappingKind;
  role: string | null;
  areaId: string | null;
  areaName: string | null;
  rank: number;
};

export type GroupMappingInput = {
  groupEmail: string;
  kind: GroupMappingKind;
  role?: string | null;
  areaId?: string | null;
  rank?: number | null;
};

export type GroupMappingError = "group_not_found" | "duplicate" | "invalid" | "directory_error" | "forbidden";

export type GroupMappingResult = { ok: true; mapping: GroupMapping } | { ok: false; error: GroupMappingError };

/** Where a Directory failure happened (Configuración → Google → Estado). */
export type DirectoryErrorSource = "sign_in" | "group_mapping" | "recheck";

/** Integration health and cutover progress (BE §A.7, FE §5). Never carries a key or secret. */
export type GoogleHealth = {
  /** `GOOGLE_WORKSPACE_DOMAIN`, null when unset. */
  workspaceDomain: string | null;
  /** `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are both set. */
  oauthClientConfigured: boolean;
  /** Group mappings in total and of kind role; no role mapping means nobody can sign in with Google. */
  groupMappingCount: number;
  roleGroupMappingCount: number;
  serviceAccountEmail: string | null;
  sharedDriveId: string | null;
  /** `TOKEN_ENCRYPTION_KEY` is set and well formed. */
  tokenKeyConfigured: boolean;
  lastDirectoryError: {
    at: string;
    source: DirectoryErrorSource;
    /** `timeout`, `network` or `http`. */
    kind: string;
    status: number | null;
    message: string;
  } | null;
  lastDriveError: { at: string; message: string } | null;
  /** Active staff who already signed in with Google (`google_sub` set). */
  googleLinkedStaff: number;
  activeStaff: number;
};

/** `recheckStaffAccessAction` (BE §A.7). */
export type RecheckStaffAccessResult =
  | { ok: true; allowed: boolean; reason?: string }
  | { ok: false; error: "directory_error" | "not_google_linked" | "forbidden" };
