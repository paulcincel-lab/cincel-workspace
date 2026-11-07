/**
 * Import history of Ajustes › Importar de monday (redesign FE §3.8, frame
 * `AjustesMonday`): one entry per `import_batches` row, read only. Pure and
 * client-safe; the query lives in `lib/repositories/import-history-repository.ts`.
 */
import type { RecordTableData } from "@/lib/types/widgets";

export type MondayImportBatchStatus = "applying" | "applied" | "rolled_back";

/** One `import_batches` row as the repository reads it. */
export type MondayImportBatchRow = {
  id: string;
  status: MondayImportBatchStatus;
  accountName: string | null;
  accountSlug: string | null;
  appliedAt: Date;
  rolledBackAt: Date | null;
  appliedByName: string | null;
  mapping: unknown;
  stats: unknown;
};

/** One row of the history, serializable for the client. */
export type MondayImportHistoryEntry = {
  batchId: string;
  status: MondayImportBatchStatus;
  /** ISO timestamp. */
  appliedAt: string;
  rolledBackAt: string | null;
  account: string | null;
  appliedBy: string | null;
  boards: number;
  /** Tasks and subtasks created from monday items. */
  cards: number;
  projects: number;
  /** Files uploaded to Drive (or linked, before the upload phase). */
  files: number;
  /** Projects whose Drive upload failed. */
  errors: number;
  /** True when the Drive upload was skipped (no Shared Drive configured). */
  driveSkipped: boolean;
};

export type MondayImportResultKey = "completada" | "con_avisos" | "en_curso" | "deshecha";

export const MONDAY_IMPORT_RESULT_LABELS: Readonly<Record<MondayImportResultKey, string>> = {
  completada: "Completada",
  con_avisos: "Con avisos",
  en_curso: "En curso",
  deshecha: "Deshecha",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** `import_batches` row → history entry. Missing or malformed stats count as zero. */
export function toMondayImportHistoryEntry(row: MondayImportBatchRow): MondayImportHistoryEntry {
  const stats = record(row.stats);
  const created = record(stats.created);
  const drive = record(stats.drive);
  const boards = record(row.mapping).boards;
  const uploaded = count(drive.files);

  return {
    batchId: row.id,
    status: row.status,
    appliedAt: row.appliedAt.toISOString(),
    rolledBackAt: row.rolledBackAt ? row.rolledBackAt.toISOString() : null,
    account: row.accountName?.trim() || row.accountSlug?.trim() || null,
    appliedBy: row.appliedByName?.trim() || null,
    boards: Array.isArray(boards) ? boards.length : 0,
    cards: count(created.tasks) + count(created.childTasks),
    projects: count(created.projects),
    files: uploaded > 0 ? uploaded : count(created.files),
    errors: count(drive.failedProjects),
    driveSkipped: typeof drive.skipped === "string" && drive.skipped.length > 0,
  };
}

/** Resultado column: undone, still applying, applied with warnings, or applied. */
export function mondayImportResult(entry: MondayImportHistoryEntry): MondayImportResultKey {
  if (entry.status === "rolled_back") return "deshecha";
  if (entry.status === "applying") return "en_curso";
  return entry.errors > 0 || entry.driveSkipped ? "con_avisos" : "completada";
}

const TIME_ZONE = "America/Mexico_City";
const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: TIME_ZONE });
const longDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const numbers = new Intl.NumberFormat("es-MX");

/** "3 nov" (lower case, no period: FE §13). */
export function formatHistoryDate(iso: string): string {
  return shortDate.format(new Date(iso)).replace(/\./g, "");
}

/** "3 de noviembre de 2026". */
export function formatHistoryLongDate(iso: string): string {
  return longDate.format(new Date(iso));
}

export function formatHistoryCount(value: number): string {
  return numbers.format(value);
}

/** Caption of "Última importación": date, account and what happened to it. */
export function lastImportCaption(entry: MondayImportHistoryEntry): string {
  const parts = [formatHistoryLongDate(entry.appliedAt)];
  if (entry.account) parts.push(entry.account);
  if (entry.status === "rolled_back") {
    parts.push(entry.rolledBackAt ? `deshecha el ${formatHistoryLongDate(entry.rolledBackAt)}` : "deshecha");
  } else if (entry.status === "applying") {
    parts.push("subiendo archivos a Drive");
  } else if (entry.driveSkipped) {
    parts.push("sin archivos en Drive (falta la unidad compartida)");
  } else {
    parts.push("las tarjetas ya existentes se actualizaron, no se duplicaron");
  }
  return `${parts.join(" · ")}.`;
}

/** The history as `RecordTable` data; values are display strings, `resultado` is the result key. */
export function mondayImportHistoryTable(entries: readonly MondayImportHistoryEntry[]): RecordTableData {
  return {
    columns: [
      { key: "fecha", label: "Fecha", format: "text" },
      { key: "tableros", label: "Tableros", align: "right", format: "text" },
      { key: "tarjetas", label: "Tarjetas", align: "right", format: "text" },
      { key: "proyectos", label: "Proyectos", align: "right", format: "text", hideOn: ["esencial"] },
      { key: "errores", label: "Errores", align: "right", format: "text" },
      { key: "quien", label: "Quién", format: "text", hideOn: ["esencial"] },
      { key: "resultado", label: "Resultado", format: "text" },
    ],
    rows: entries.map((entry) => ({
      id: entry.batchId,
      fecha: formatHistoryDate(entry.appliedAt),
      tableros: formatHistoryCount(entry.boards),
      tarjetas: formatHistoryCount(entry.cards),
      proyectos: formatHistoryCount(entry.projects),
      errores: formatHistoryCount(entry.errors),
      quien: entry.appliedBy ?? "—",
      resultado: mondayImportResult(entry),
    })),
  };
}
