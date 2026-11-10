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

/**
 * Refusal of a role or área change for staff whose role and áreas come from
 * Google Workspace (BE §A.7, §A.11 #12).
 */
export const GOOGLE_MANAGED_ERROR = "Se administra en Google Workspace";

/**
 * What the staff and áreas actions return for that refusal. A returned value,
 * not a thrown error: production builds hide thrown Server Action messages.
 */
export type GoogleManagedRefusal = { ok: false; error: typeof GOOGLE_MANAGED_ERROR };

export const GOOGLE_MANAGED_REFUSAL: GoogleManagedRefusal = { ok: false, error: GOOGLE_MANAGED_ERROR };

export function isGoogleManagedRefusal(value: unknown): value is GoogleManagedRefusal {
  return (
    typeof value === "object" && value !== null && "ok" in value && value.ok === false &&
    "error" in value && value.error === GOOGLE_MANAGED_ERROR
  );
}

/** Which Workspace group means which role or puesto (BE §A.7, §7.7; FE §7.7). */
export type GroupMappingKind = "role" | "position";

export type GroupMapping = {
  id: string;
  groupEmail: string;
  kind: GroupMappingKind;
  role: string | null;
  positionId: string | null;
  positionName: string | null;
  rank: number;
  /** Members of the group in the Directory (`members.list`, count only); null = not checked yet. */
  memberCount: number | null;
  /** `groups.get` found the group; false → "El grupo no existe"; null = not checked yet. */
  exists: boolean | null;
};

export type GroupMappingInput = {
  groupEmail: string;
  kind: GroupMappingKind;
  role?: string | null;
  positionId?: string | null;
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
  /** Active staff who haven't signed in with Google yet (`google_sub` is null), by name. */
  pendingGoogleStaff: { id: string; name: string }[];
  /** Live projects without their Drive folders yet (`drive_folder_status` pending or failed), and with them (ready). */
  projectsWithoutFolder: number;
  projectsWithFolder: number;
};

/** `recheckStaffAccessAction` (BE §A.7). */
export type RecheckStaffAccessResult =
  | { ok: true; allowed: boolean; reason?: string }
  | { ok: false; error: "directory_error" | "not_google_linked" | "forbidden" };

/** One entry of a project's Drive folder in the staff Archivos tab (BE §A.6.3, FE §5). */
export type StaffFileItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedAt: string;
  iconLink: string | null;
  webViewLink: string | null;
  /** Drive's preview image (short-lived link); null for folders and files without one. */
  thumbnailLink: string | null;
  kind: "file" | "folder";
};

/** `GET /api/proyectos/[id]/archivos?folder=` (BE §A.6.3). */
export type StaffFilesResult =
  | { status: "pending" | "failed"; error?: string }
  | { status: "needs_consent" }
  | { status: "no_drive_access" }
  | { status: "ok"; folderId: string; breadcrumbs: { id: string; name: string }[]; items: StaffFileItem[] };
