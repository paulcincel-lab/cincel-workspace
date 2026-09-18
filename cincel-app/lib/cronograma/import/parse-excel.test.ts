import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseScheduleExcel, MAX_IMPORT_BYTES } from "./parse-excel";
import { stableKey } from "@/lib/cronograma/hash";

const HEADERS = ["ID", "Planta", "Partida/Sección", "Responsable", "Inicio", "Fin", "Tarea"];

function buildWorkbookBuffer(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows], { cellDates: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Cronograma");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseScheduleExcel", () => {
  it("parses a valid workbook into normalized tasks with stable keys", () => {
    const buffer = buildWorkbookBuffer([
      ["PB-1", "PB", "Preliminares", "Chava", "2026-06-22", "2026-06-27", "Habilitado de áreas"],
      ["PB-2", "PB", "Acabados", "Aaron", new Date(Date.UTC(2026, 6, 1)), new Date(Date.UTC(2026, 6, 5)), "Pintura"],
    ]);

    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toEqual({
      legacyId: "PB-1",
      planta: "PB",
      seccion: "Preliminares",
      responsable: "Chava",
      inicio: "2026-06-22",
      fin: "2026-06-27",
      tarea: "Habilitado de áreas",
      stableKey: stableKey("PB", "Habilitado de áreas"),
    });
    expect(result.tasks[1].inicio).toBe("2026-07-01");
    expect(result.tasks[1].fin).toBe("2026-07-05");
  });

  it("parses DD/MM/YYYY string dates", () => {
    const buffer = buildWorkbookBuffer([["PB-1", "PB", "Preliminares", "Chava", "05/07/2026", "10/07/2026", "Tarea"]]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks[0].inicio).toBe("2026-07-05");
    expect(result.tasks[0].fin).toBe("2026-07-10");
  });

  it("rejects a workbook missing required columns", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["ID", "Planta", "Tarea"],
      ["PB-1", "PB", "Tarea"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Cronograma");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Faltan columnas/);
  });

  it("rejects a row missing a required field", () => {
    const buffer = buildWorkbookBuffer([["PB-1", "PB", "", "Chava", "2026-06-22", "2026-06-27", "Tarea"]]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Fila 2/);
  });

  it("rejects a row with an unparseable date", () => {
    const buffer = buildWorkbookBuffer([["PB-1", "PB", "Preliminares", "Chava", "not-a-date", "2026-06-27", "Tarea"]]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(false);
  });

  it("rejects a (planta, tarea) collision within the same planta", () => {
    const buffer = buildWorkbookBuffer([
      ["PB-1", "PB", "Preliminares", "Chava", "2026-06-22", "2026-06-27", "Tarea duplicada"],
      ["PB-2", "PB", "Acabados", "Aaron", "2026-07-01", "2026-07-05", "Tarea duplicada"],
    ]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/colisiona/);
  });

  it("does not reject the same tarea text in a different planta (key includes planta)", () => {
    const buffer = buildWorkbookBuffer([
      ["PB-1", "PB", "Preliminares", "Chava", "2026-06-22", "2026-06-27", "Tarea repetida"],
      ["PA-1", "PA", "Preliminares", "Aaron", "2026-07-01", "2026-07-05", "Tarea repetida"],
    ]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty workbook (header only)", () => {
    const buffer = buildWorkbookBuffer([]);
    const result = parseScheduleExcel(buffer);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the 5 MB limit", () => {
    const oversized = new ArrayBuffer(MAX_IMPORT_BYTES + 1);
    const result = parseScheduleExcel(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/5 MB/);
  });

  it("rejects a malformed (non-spreadsheet) buffer", () => {
    const buffer = new TextEncoder().encode("this is not a spreadsheet at all, just plain text").buffer;
    const result = parseScheduleExcel(buffer as ArrayBuffer);
    expect(result.ok).toBe(false);
  });
});
