// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

import type { MondayImportHistoryEntry } from "@/lib/monday-import/history";
import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { MondayImportHistory, MondayLastImport } from "./MondayImportSections";

const APPLIED: MondayImportHistoryEntry = {
  batchId: "00000000-0000-4000-8000-000000000001",
  status: "applied",
  appliedAt: "2026-11-03T18:00:00.000Z",
  rolledBackAt: null,
  account: "Cincel",
  appliedBy: "Alejandro Riofrio",
  boards: 6,
  cards: 412,
  projects: 6,
  files: 38,
  errors: 0,
  driveSkipped: false,
};
const WARNED: MondayImportHistoryEntry = {
  ...APPLIED,
  batchId: "00000000-0000-4000-8000-000000000002",
  appliedAt: "2026-10-21T18:00:00.000Z",
  appliedBy: "Sofía",
  boards: 2,
  cards: 96,
  errors: 3,
};
const UNDONE: MondayImportHistoryEntry = {
  ...APPLIED,
  batchId: "00000000-0000-4000-8000-000000000003",
  status: "rolled_back",
  appliedAt: "2026-10-02T18:00:00.000Z",
  rolledBackAt: "2026-10-03T18:00:00.000Z",
};

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", theme);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("MondayLastImport", () => {
  it("shows what the newest import created, with its date and account", () => {
    render(<MondayLastImport entry={APPLIED} />);
    const section = screen.getByRole("region", { name: "Última importación" });
    expect(within(section).getByText(/3 de noviembre de 2026 · Cincel/)).toBeTruthy();
    for (const [label, value] of [
      ["Tarjetas importadas", "412"],
      ["Proyectos creados", "6"],
      ["Archivos enlazados", "38"],
      ["Errores", "0"],
    ]) {
      expect(within(within(section).getByRole("group", { name: label })).getByText(value)).toBeTruthy();
    }
  });
});

describe("MondayImportHistory", () => {
  it("lists every batch with its result", () => {
    render(<MondayImportHistory history={[APPLIED, WARNED, UNDONE]} error={null} />);
    const section = screen.getByRole("region", { name: "Historial" });
    const table = within(section).getByRole("table");
    for (const header of ["Fecha", "Tableros", "Tarjetas", "Errores", "Resultado"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeTruthy();
    }
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("3 nov")).toBeTruthy();
    expect(within(rows[0]).getByText("412")).toBeTruthy();
    expect(within(rows[0]).getByText("Completada")).toBeTruthy();
    expect(within(rows[1]).getByText("Con avisos")).toBeTruthy();
    expect(within(rows[2]).getByText("Deshecha")).toBeTruthy();
  });

  it("shows the load error instead of the table", () => {
    render(<MondayImportHistory history={[]} error="No se pudo cargar el historial de importaciones." />);
    const section = screen.getByRole("region", { name: "Historial" });
    expect(within(section).getByText("No se pudo cargar el historial de importaciones.")).toBeTruthy();
    expect(within(section).queryByRole("table")).toBeNull();
  });

  it("has no serious axe violations in any theme, light and dark", async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        applyTheme(theme, mode);
        const { container, unmount } = render(
          <div>
            <MondayLastImport entry={APPLIED} />
            <MondayImportHistory history={[APPLIED, WARNED, UNDONE]} error={null} />
          </div>,
        );
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    }
  });
});
