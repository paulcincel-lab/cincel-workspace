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
