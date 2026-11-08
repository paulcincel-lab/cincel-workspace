/**
 * Pure mappers from database rows to the client-portal DTOs (BE §B.4.3). Each
 * mapper copies only the fields the DTO names, so extra columns on the input
 * row (coordinator, contract amount, Drive ids, `tarea`, `responsable`, ...)
 * never reach a portal response (BE §B.8 #10).
 */
import type { PortalProjectDTO, PortalScheduleDTO, PortalScheduleSectionDTO, PortalTramoDTO } from "@/lib/types/portal";

export type PortalProjectRow = {
  id: string;
  name: string;
  code: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  status: string;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  managerName: string | null;
  managerLastName: string | null;
  managerEmail: string | null;
};

/** The schedule columns the portal reads. `tarea` and `responsable` are not among them. */
export type PortalScheduleTaskRow = {
  planta: string;
  seccion: string;
  seccionOrder: number;
  sortOrder: number;
  inicio: string;
  fin: string;
  status: string;
};

function joinNonBlank(parts: (string | null | undefined)[], sep: string): string | null {
  const kept = parts.map((p) => p?.trim() ?? "").filter((p) => p !== "");
  return kept.length ? kept.join(sep) : null;
}

export function toPortalProjectDTO(row: PortalProjectRow): PortalProjectDTO {
  const managerName = joinNonBlank([row.managerName, row.managerLastName], " ");
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: joinNonBlank([row.addressStreet, row.addressCity, row.addressState], ", "),
    status: row.status,
    progressPct: row.progress,
    startDate: row.startDate,
    endDate: row.endDate,
    manager: managerName ? { name: managerName, email: row.managerEmail } : null,
  };
}

/**
 * Groups schedule tasks per `planta` and `seccion`: first `inicio`, last
 * `fin`, and `done` tasks over all tasks as a whole percentage. Plantas keep
 * the order they first appear in (by `sortOrder`); within a planta, sections
 * follow `seccionOrder`.
 */
export function toPortalScheduleDTO(tasks: PortalScheduleTaskRow[] | null): PortalScheduleDTO {
  if (tasks === null) return null;

  type Group = PortalScheduleSectionDTO & { order: number; total: number; done: number };
  const plantaRank = new Map<string, number>();
  const groups = new Map<string, Group>();

  for (const t of [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!plantaRank.has(t.planta)) plantaRank.set(t.planta, plantaRank.size);
    const key = `${t.planta}::${t.seccion}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, planta: t.planta, seccion: t.seccion, start: t.inicio, end: t.fin, progressPct: 0,
        order: t.seccionOrder, total: 0, done: 0 };
      groups.set(key, g);
    }
    if (t.inicio < g.start) g.start = t.inicio;
    if (t.fin > g.end) g.end = t.fin;
    if (t.seccionOrder < g.order) g.order = t.seccionOrder;
    g.total += 1;
    if (t.status === "done") g.done += 1;
  }

  const sections = [...groups.values()]
    .sort((a, b) =>
      (plantaRank.get(a.planta) ?? 0) - (plantaRank.get(b.planta) ?? 0) || a.order - b.order ||
      a.seccion.localeCompare(b.seccion))
    .map((g) => ({
      key: g.key,
      planta: g.planta,
      seccion: g.seccion,
      start: g.start,
      end: g.end,
      progressPct: g.total ? Math.round((g.done / g.total) * 100) : 0,
    }));

  return { sections };
}

/** The tramo columns the portal reads, joined with the project's `project_stages` row (null when not started). */
export type PortalTramoRow = {
  id: string;
  key: string;
  name: string;
  active: boolean;
  sortOrder: number;
  startedAt: Date | string | null;
  closedAt: Date | string | null;
};

/**
 * Tramos in catalog order with the project's state in each: the project's current tramo and any started,
 * still-open one are `en_curso`; a started and closed one is `completado`; the rest `por_iniciar`. Inactive
 * tramos the project never started are left out. Only `key`, `name` and `state` reach the DTO.
 */
export function toPortalTramosDTO(rows: PortalTramoRow[], currentWorkflowId: string | null): PortalTramoDTO[] {
  return [...rows]
    .filter((r) => r.active || r.startedAt !== null || r.id === currentWorkflowId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"))
    .map((r) => {
      const state: PortalTramoDTO["state"] =
        r.id === currentWorkflowId
          ? "en_curso"
          : r.startedAt === null
            ? "por_iniciar"
            : r.closedAt === null
              ? "en_curso"
              : "completado";
      return { key: r.key, name: r.name, state };
    });
}

/**
 * The exact keys each portal DTO may carry (Query Migration Phase 11, plan §4.8 rule 2): everything a portal
 * loader returns is dehydrated into the page HTML. No payments, no internal notes, no staff other than the
 * project's manager (name and contact email). `lib/portal/dto-allow-list.test.ts` pins these lists against
 * the mappers, so a new field is a reviewed change here.
 */
export const PORTAL_DTO_ALLOWED_KEYS = {
  project: ["address", "code", "endDate", "id", "manager", "name", "progressPct", "startDate", "status"],
  projectManager: ["email", "name"],
  schedule: ["sections"],
  scheduleSection: ["end", "key", "planta", "progressPct", "seccion", "start"],
  tramo: ["key", "name", "state"],
  file: ["deliveredAs", "id", "kind", "mimeType", "modifiedAt", "name", "sizeBytes"],
} as const;
