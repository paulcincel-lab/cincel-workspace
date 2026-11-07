import { describe, expect, it } from "vitest";

import {
  formatHistoryDate,
  lastImportCaption,
  mondayImportHistoryTable,
  mondayImportResult,
  toMondayImportHistoryEntry,
  type MondayImportBatchRow,
} from "./history";

function batch(overrides: Partial<MondayImportBatchRow> = {}): MondayImportBatchRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "applied",
    accountName: "Cincel",
    accountSlug: "cincel",
    // 18:00 UTC = 12:00 in Mexico City, same calendar day.
    appliedAt: new Date("2026-11-03T18:00:00Z"),
    rolledBackAt: null,
    appliedByName: "Alejandro Riofrio",
    mapping: { boards: [{ boardId: "1" }, { boardId: "2" }, { boardId: "3" }] },
    stats: {
      created: { projects: 6, tasks: 400, childTasks: 12, files: 40 },
      drive: { projects: 6, files: 38, pending: 0, failedProjects: 0 },
    },
    ...overrides,
  };
}

describe("toMondayImportHistoryEntry", () => {
  it("reads boards, cards, projects, files and errors from the batch", () => {
    expect(toMondayImportHistoryEntry(batch())).toEqual({
      batchId: "00000000-0000-4000-8000-000000000001",
      status: "applied",
      appliedAt: "2026-11-03T18:00:00.000Z",
      rolledBackAt: null,
      account: "Cincel",
      appliedBy: "Alejandro Riofrio",
      boards: 3,
      cards: 412,
      projects: 6,
      files: 38,
      errors: 0,
      driveSkipped: false,
    });
  });

  it("counts the linked files while the Drive upload has not run", () => {
    const entry = toMondayImportHistoryEntry(batch({ status: "applying", stats: { created: { files: 40 } } }));
    expect(entry.files).toBe(40);
    expect(entry.errors).toBe(0);
  });

  it("treats missing or malformed stats and mapping as zero", () => {
    const entry = toMondayImportHistoryEntry(
      batch({ stats: null, mapping: "nope", accountName: null, accountSlug: " ", appliedByName: null }),
    );
    expect(entry).toMatchObject({ boards: 0, cards: 0, projects: 0, files: 0, errors: 0, account: null, appliedBy: null });
  });

  it("ignores negative or non-numeric counts", () => {
    const entry = toMondayImportHistoryEntry(batch({ stats: { created: { tasks: -3, projects: "6" } } }));
    expect(entry.cards).toBe(0);
    expect(entry.projects).toBe(0);
  });

  it("falls back to the account slug", () => {
    expect(toMondayImportHistoryEntry(batch({ accountName: null })).account).toBe("cincel");
  });
});

describe("mondayImportResult", () => {
  it("is completada for a clean applied batch", () => {
    expect(mondayImportResult(toMondayImportHistoryEntry(batch()))).toBe("completada");
  });

  it("is con avisos when projects failed or Drive was skipped", () => {
    const failed = batch({ stats: { created: {}, drive: { failedProjects: 2 } } });
    const skipped = batch({ stats: { created: {}, drive: { skipped: "no_shared_drive" } } });
    expect(mondayImportResult(toMondayImportHistoryEntry(failed))).toBe("con_avisos");
    expect(mondayImportResult(toMondayImportHistoryEntry(skipped))).toBe("con_avisos");
  });

  it("is en curso while applying and deshecha once rolled back", () => {
    expect(mondayImportResult(toMondayImportHistoryEntry(batch({ status: "applying" })))).toBe("en_curso");
    expect(mondayImportResult(toMondayImportHistoryEntry(batch({ status: "rolled_back" })))).toBe("deshecha");
  });
});

describe("formatting", () => {
  it("writes short dates in lower case without a period", () => {
    expect(formatHistoryDate("2026-11-03T18:00:00Z")).toBe("3 nov");
  });

  it("uses the Mexico City calendar day", () => {
    // 03:00 UTC on the 4th is still the 3rd in Mexico City.
    expect(formatHistoryDate("2026-11-04T03:00:00Z")).toBe("3 nov");
  });

  it("captions the last import", () => {
    expect(lastImportCaption(toMondayImportHistoryEntry(batch()))).toBe(
      "3 de noviembre de 2026 · Cincel · las tarjetas ya existentes se actualizaron, no se duplicaron.",
    );
    const undone = toMondayImportHistoryEntry(
      batch({ status: "rolled_back", rolledBackAt: new Date("2026-11-05T18:00:00Z") }),
    );
    expect(lastImportCaption(undone)).toBe("3 de noviembre de 2026 · Cincel · deshecha el 5 de noviembre de 2026.");
  });
});

describe("mondayImportHistoryTable", () => {
  it("has the frame's columns and one display row per batch", () => {
    const table = mondayImportHistoryTable([
      toMondayImportHistoryEntry(batch()),
      toMondayImportHistoryEntry(batch({ id: "00000000-0000-4000-8000-000000000002", status: "rolled_back" })),
    ]);
    expect(table.columns.map((c) => c.label)).toEqual([
      "Fecha",
      "Tableros",
      "Tarjetas",
      "Proyectos",
      "Errores",
      "Quién",
      "Resultado",
    ]);
    expect(table.rows[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      fecha: "3 nov",
      tableros: "3",
      tarjetas: "412",
      proyectos: "6",
      errores: "0",
      quien: "Alejandro Riofrio",
      resultado: "completada",
    });
    expect(table.rows[1].resultado).toBe("deshecha");
  });

  it("shows a dash when nobody is recorded", () => {
    const table = mondayImportHistoryTable([toMondayImportHistoryEntry(batch({ appliedByName: null }))]);
    expect(table.rows[0].quien).toBe("—");
  });
});
