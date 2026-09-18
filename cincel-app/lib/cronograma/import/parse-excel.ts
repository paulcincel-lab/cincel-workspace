import * as XLSX from "xlsx";

import { stableKey } from "@/lib/cronograma/hash";
import type { NormalizedScheduleTask } from "@/lib/types/schedule";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const HEADER_ALIASES: Record<string, string[]> = {
  id: ["id"],
  planta: ["planta"],
  seccion: ["partida/seccion", "partida", "seccion"],
  responsable: ["responsable"],
  inicio: ["inicio"],
  fin: ["fin"],
  tarea: ["tarea"],
};

type ColumnKey = keyof typeof HEADER_ALIASES;

function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function resolveColumns(sampleRow: Record<string, unknown>): Record<ColumnKey, string> | null {
  const normalizedToActual = new Map(Object.keys(sampleRow).map((k) => [normalizeHeader(k), k]));
  const result = {} as Record<ColumnKey, string>;
  for (const canonical of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
    const match = HEADER_ALIASES[canonical].map((alias) => normalizedToActual.get(alias)).find((v) => v !== undefined);
    if (!match) return null;
    result[canonical] = match;
  }
  return result;
}

function parseDateCell(v: unknown): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return null;
  }
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return null;
}

export type ParseExcelResult = { ok: true; tasks: NormalizedScheduleTask[] } | { ok: false; error: string };

/** Parses the schedule Excel/CSV per docs/specs/backend.md §8.1. Rejects on missing columns, missing required fields per row, or a (planta, tarea) collision (identical stableKey within the same planta). */
export function parseScheduleExcel(buffer: ArrayBuffer): ParseExcelResult {
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `El archivo excede el límite de 5 MB (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB).`,
    };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return { ok: false, error: "No se pudo leer el archivo. Verifica que sea un Excel o CSV válido." };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { ok: false, error: "El archivo no contiene hojas." };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (rows.length === 0) return { ok: false, error: "El archivo no contiene filas de datos." };

  const columns = resolveColumns(rows[0]);
  if (!columns) {
    return {
      ok: false,
      error: "Faltan columnas requeridas: ID, Planta, Partida/Sección, Responsable, Inicio, Fin, Tarea.",
    };
  }

  const tasks: NormalizedScheduleTask[] = [];
  const seenKeys = new Map<string, string>();

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 2; // header is row 1
    const legacyIdRaw = row[columns.id];
    const planta = String(row[columns.planta] ?? "").trim();
    const seccion = String(row[columns.seccion] ?? "").trim();
    const responsableRaw = row[columns.responsable];
    const inicio = parseDateCell(row[columns.inicio]);
    const fin = parseDateCell(row[columns.fin]);
    const tarea = String(row[columns.tarea] ?? "").trim();

    if (!planta || !seccion || !tarea || !inicio || !fin) {
      return {
        ok: false,
        error: `Fila ${rowNum}: faltan datos requeridos (planta, sección, tarea, inicio o fin) o la fecha tiene un formato inválido.`,
      };
    }

    const key = stableKey(planta, tarea);
    const collidesWith = seenKeys.get(key);
    if (collidesWith) {
      return {
        ok: false,
        error: `Fila ${rowNum}: la tarea "${tarea}" colisiona con otra tarea idéntica ya vista en la planta ${planta}. Ajusta el texto para diferenciarlas.`,
      };
    }
    seenKeys.set(key, tarea);

    tasks.push({
      legacyId: legacyIdRaw != null ? String(legacyIdRaw).trim() : null,
      planta,
      seccion,
      responsable: responsableRaw != null && String(responsableRaw).trim() ? String(responsableRaw).trim() : null,
      inicio,
      fin,
      tarea,
      stableKey: key,
    });
  }

  return { ok: true, tasks };
}
