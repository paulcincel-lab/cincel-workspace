import type { RecordTableData } from "@/lib/types/widgets";

/**
 * One cronograma fixture for the three styles of `CronogramaWidget`
 * (canvas `ProyectoCronograma`, `ProyectoCronogramaEsencial`,
 * `ProyectoCronogramaAnalitico`). Rows follow the cronograma row keys read by
 * the widget: `kind` ("partida" | "tarea" | "hito"), `partida`, `responsable`,
 * `inicio` / `fin` (ISO dates), `duracion` (days), `real` / `plan` (0–100),
 * `desviacion` (points), `holgura` (days) and `timeline` (derived by the widget).
 */
export const CRONOGRAMA_PROJECT_ID = "proj-espinopapa";

type Kind = "partida" | "tarea" | "hito";

function row(
  id: string,
  kind: Kind,
  partida: string,
  responsable: string | null,
  inicio: string,
  fin: string,
  duracion: number,
  real: number | null,
  plan: number | null,
  desviacion: number | null,
  holgura: number | null,
): Record<string, unknown> {
  return { id, kind, partida, responsable, inicio, fin, duracion, real, plan, desviacion, holgura };
}

export const cronogramaTable: RecordTableData = {
  columns: [
    { key: "partida", label: "Partida" },
    { key: "responsable", label: "Responsable" },
    { key: "inicio", label: "Inicio", format: "date", mono: true },
    { key: "fin", label: "Fin", format: "date", mono: true },
    { key: "duracion", label: "Duración", format: "days", align: "right", mono: true },
    { key: "real", label: "% real", format: "percent", align: "right", mono: true },
    { key: "plan", label: "% plan", format: "percent", align: "right", mono: true, hideOn: ["esencial"] },
    { key: "desviacion", label: "Desv.", format: "delta", align: "right", mono: true, hideOn: ["esencial"] },
    { key: "holgura", label: "Holgura", format: "days", align: "right", mono: true },
    { key: "timeline", label: "Meses", mono: true, hideOn: ["esencial"] },
  ],
  rows: [
    row("p-demoliciones", "partida", "Demoliciones", null, "2026-07-01", "2026-07-27", 26, 100, 100, 0, 0),
    row("t-retiro-muros", "tarea", "Retiro de muros y pisos", "Paul", "2026-07-02", "2026-07-17", 15, 100, 100, 0, 0),
    row("t-retiro-cascajo", "tarea", "Retiro de cascajo", "Paul", "2026-07-17", "2026-07-27", 10, 100, 100, 0, 0),
    row("p-instalaciones", "partida", "Instalaciones", null, "2026-07-27", "2026-10-12", 77, 90, 100, -10, -8),
    row("t-hidraulica", "tarea", "Hidráulica y sanitaria", "Juanma", "2026-07-27", "2026-09-12", 47, 85, 100, -15, -7),
    row("t-electrica", "tarea", "Eléctrica e iluminación", "Paul", "2026-08-13", "2026-10-12", 60, 95, 100, -5, -3),
    row("p-albanileria", "partida", "Albañilería y muros", null, "2026-09-03", "2026-11-13", 71, 75, 90, -15, -11),
    row("t-tablaroca", "tarea", "Muros de tablaroca", "Paul", "2026-09-03", "2026-10-29", 56, 80, 100, -20, -11),
    row("t-plafones", "tarea", "Plafones", "Paul", "2026-10-07", "2026-11-13", 37, 60, 81, -21, -8),
    row("h-obra-negra", "hito", "Entrega de obra negra", "Alejandro", "2026-11-18", "2026-11-18", 0, null, null, null, null),
    row("p-acabados", "partida", "Acabados y pisos", null, "2026-10-27", "2026-12-19", 53, 40, 19, 21, 11),
    row("t-porcelanato", "tarea", "Porcelanato área de venta", "Paul", "2026-10-27", "2026-11-26", 30, 45, 33, 12, 4),
    row("t-pintura", "tarea", "Pintura interior y fachada", "María", "2026-11-19", "2026-12-19", 30, 0, 0, 0, 0),
    row("p-mobiliario", "partida", "Mobiliario y decoración", null, "2026-12-15", "2027-01-27", 43, 0, 0, 0, 0),
    row("t-fabricacion", "tarea", "Fabricación de mobiliario", "Alejandro", "2026-12-02", "2027-01-05", 34, 10, 0, 10, 3),
    row("t-montaje", "tarea", "Instalación y montaje", "Alejandro", "2027-01-05", "2027-01-25", 20, 0, 0, 0, 0),
    row("h-entrega", "hito", "Entrega al cliente", "Alejandro", "2027-01-29", "2027-01-29", 0, null, null, null, -9),
  ],
  totals: {
    partida: "Proyecto",
    inicio: "2026-07-01",
    fin: "2027-01-29",
    duracion: 210,
    real: 82,
    plan: 85,
    desviacion: -3,
    holgura: -9,
  },
};

/** Same columns, no rows (empty state). */
export const cronogramaEmptyTable: RecordTableData = { columns: cronogramaTable.columns, rows: [] };
