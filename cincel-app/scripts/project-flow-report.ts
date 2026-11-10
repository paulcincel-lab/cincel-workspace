/**
 * Project flow migration report (backend spec §4.4): prints, as markdown, what
 * the project flow data migration changed or could not place, read from
 * `core.project_flow_migration_report` and grouped by `kind` with counts and rows.
 * Read only: it never writes to the database.
 *
 * Run with: npm run flow:report (needs DATABASE_URL), e.g.
 *   npm run flow:report > report.md
 * Exits non-zero only when the report can't be read.
 */
import { pathToFileURL } from "node:url";

import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { projectFlowMigrationReport } from "../lib/db/schema/flow-report";
import { PROJECT_FLOW_REPORT_KINDS } from "../lib/project-flow/catalog";

export type ReportRow = {
  kind: string;
  entity: string;
  entityId: string | null;
  value: string | null;
  detail: unknown;
};

/** What each kind means and who acts on it (BE §4.4). */
export const REPORT_KIND_INFO: Record<(typeof PROJECT_FLOW_REPORT_KINDS)[number], { title: string; action: string }> = {
  task_phase_unmatched: {
    title: "Tareas sin fase («Sin fase · revisar»)",
    action: "Líderes del tramo, o el remapeo",
  },
  task_tramo_inferred: {
    title: "Tareas sin tramo a las que se asignó el único tramo con esa fase",
    action: "Solo revisar",
  },
  task_linked_to_template: {
    title: "Tareas «Iniciar plantilla» enlazadas a su plantilla",
    action: "Solo revisar",
  },
  status_reused: {
    title: "Estados existentes actualizados (Cancelado / No se requiere / En espera)",
    action: "Revisar; avisar al equipo si tasksReopened > 0",
  },
  status_created: {
    title: "Estados creados (Cancelado / En espera)",
    action: "Solo revisar",
  },
  template_phase_defaulted: {
    title: "Plantillas colocadas en la primera fase del tramo",
    action: "Administrador, en Tramos y fases",
  },
  project_phases: {
    title: "Valores anteriores de las fases del proyecto",
    action: "Solo revisar (se eliminan en la versión B)",
  },
  project_without_tramo: {
    title: "Proyectos sin tramo actual («Asignar tramo»)",
    action: "Administrador",
  },
  project_renamed_duplicate: {
    title: "Proyectos renombrados por nombre duplicado",
    action: "Administrador",
  },
  area: {
    title: "Áreas (se eliminan en la versión B)",
    action: "Administrador: recrearlas como puestos si se necesitan",
  },
  area_member: {
    title: "Miembros de áreas (se eliminan en la versión B)",
    action: "Administrador: recrearlos como puestos si se necesitan",
  },
  area_workflow: {
    title: "Tramos de áreas (se eliminan en la versión B)",
    action: "Administrador: recrearlos como puestos si se necesitan",
  },
  group_mapping_area_removed: {
    title: "Grupos de Google que otorgaban un área",
    action: "Administrador: reasignar el grupo a un puesto",
  },
};

export const EMPTY_REPORT_MESSAGE = "Nada que revisar: el informe de migración está vacío.";

/** Reads every report row, ordered for a stable output. */
export async function loadReport(db: ReturnType<typeof drizzle>): Promise<ReportRow[]> {
  const t = projectFlowMigrationReport;
  return db
    .select({ kind: t.kind, entity: t.entity, entityId: t.entityId, value: t.value, detail: t.detail })
    .from(t)
    .orderBy(asc(t.kind), asc(t.entity), asc(t.value), asc(t.entityId));
}

/** Escapes a value for a markdown table cell. */
function cell(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function detailText(detail: unknown): string | null {
  if (detail == null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

/** Formats the rows as markdown: known kinds in BE §4.4 order, then any unknown kind. */
export function formatReport(rows: ReportRow[]): string {
  if (rows.length === 0) return `# Informe de migración del flujo de proyectos\n\n${EMPTY_REPORT_MESSAGE}\n`;

  const byKind = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const list = byKind.get(row.kind);
    if (list) list.push(row);
    else byKind.set(row.kind, [row]);
  }
  const known: readonly string[] = PROJECT_FLOW_REPORT_KINDS;
  const kinds = [
    ...PROJECT_FLOW_REPORT_KINDS.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !known.includes(k)).sort(),
  ];

  const out: string[] = ["# Informe de migración del flujo de proyectos", ""];
  out.push("| Tipo | Filas |", "|---|---|");
  for (const kind of kinds) out.push(`| \`${kind}\` | ${byKind.get(kind)!.length} |`);
  out.push(`| **Total** | **${rows.length}** |`, "");

  for (const kind of kinds) {
    const list = byKind.get(kind)!;
    const info = REPORT_KIND_INFO[kind as keyof typeof REPORT_KIND_INFO];
    out.push(`## \`${kind}\` (${list.length})`, "");
    if (info) out.push(`${info.title}. Responsable: ${info.action}.`, "");
    out.push("| Entidad | ID | Valor | Detalle |", "|---|---|---|---|");
    for (const row of list) {
      out.push(`| ${cell(row.entity)} | ${cell(row.entityId)} | ${cell(row.value)} | ${cell(detailText(row.detail))} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await loadReport(drizzle(client));
    process.stdout.write(formatReport(rows));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
