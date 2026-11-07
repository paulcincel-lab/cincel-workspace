/**
 * Client-portal DTOs (BE §B.4.3). Portal pages and routes only ever see these
 * shapes, built by lib/portal/queries.ts. They carry client-safe data only: no
 * `tarea`, no `responsable`, no staff other than the project's manager, no
 * money, flags, payments, imprevistos or adicionales (BE §0.3, §B.8 #10).
 */

export type PortalProjectDTO = {
  id: string;
  name: string;
  code: string | null;
  /** address_street, address_city, address_state joined with ", " (blanks skipped). */
  address: string | null;
  status: string;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  /** projects.manager_id */
  manager: { name: string; email: string | null } | null;
};

/** One `seccion` (partida) of one `planta`: first `inicio`, last `fin`, % of its tasks done. */
export type PortalScheduleSectionDTO = {
  key: string;
  planta: string;
  seccion: string;
  start: string;
  end: string;
  progressPct: number;
};

/** Null when the project has no schedule. */
export type PortalScheduleDTO = {
  sections: PortalScheduleSectionDTO[];
} | null;

/**
 * One tramo of the project as the client sees it (FE §3.11 `PhaseStepper`): the tramo catalog in order, with
 * the project's progress through it. Only the key, the name and the state; no ids, dates or staff.
 */
export type PortalTramoDTO = {
  key: string;
  name: string;
  state: "completado" | "en_curso" | "por_iniciar";
};

/** One file the client sent (Mis envíos), from `portal_file_events` (`upload`). */
export type PortalUploadDTO = { id: string; fileName: string; sizeBytes: number | null; at: string };

/** One entry of a `02 Cliente` folder (BE §B.4.4). Never a Drive link, owner or permission. */
export type PortalFileDTO = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedAt: string;
  kind: "file" | "folder";
  /** `pdf` for Google Docs, Sheets, Slides and Drawings, which download as an exported PDF. */
  deliveredAs: "original" | "pdf";
};

/** `breadcrumbs` run from the client folder (first) to `folderId` (last). */
export type PortalFolderDTO = { folderId: string; breadcrumbs: { id: string; name: string }[]; items: PortalFileDTO[] };

/** `GET /api/portal/projects/[pid]/files` while the project's Drive folders aren't ready. */
export type PortalFolderPendingDTO = { pending: true };

// ── Staff side (FE §5): the Clientes tab, never sent to the portal ──────────

export type PortalAccessStatus = "invited" | "active" | "disabled" | "revoked";

export type PortalAccessRow = {
  accessId: string;
  portalUserId: string;
  name: string;
  email: string;
  contact: { id: string; name: string; type: "cliente" | "socio" };
  /** `revoked` when this project's access row is revoked, else the portal user's status. */
  status: PortalAccessStatus;
  invitedBy: string;
  lastLoginAt: string | null;
};

export type PortalActionError =
  | "forbidden"
  | "not_found"
  | "staff_domain"
  | "disabled"
  | "already_active"
  | "not_project_contact"
  | "socio_unconfirmed"
  | "invalid_email"
  | "rate_limited"
  /** The project has no client yet (project flow); invitations wait until one is set. */
  | "no_client";

export type PortalActivityRow = {
  id: string;
  clientName: string;
  fileName: string;
  action: "download" | "preview" | "upload";
  at: string;
};

export type InvitePortalClientInput = {
  projectId: string;
  contactId: string;
  email: string;
  name: string;
  confirmSocio?: boolean;
};

export type InvitePortalClientResult = { ok: true; emailSent: boolean } | { ok: false; error: PortalActionError };

export type ResendPortalInviteResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; error: "forbidden" | "not_found" | "rate_limited" };

export type PortalMutationResult = { ok: true } | { ok: false; error: "forbidden" | "not_found" };
