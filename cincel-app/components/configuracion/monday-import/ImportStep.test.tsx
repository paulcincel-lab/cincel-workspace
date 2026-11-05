// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ImportStep } from "./ImportStep";
import type { MondayImportJob, MondayImportRunState } from "@/lib/types/monday-import";

const boards = [
  { id: "b1", name: "Casa Ruiz" },
  { id: "b2", name: "Clientes" },
];

function job(status: MondayImportJob["status"], error: string | null = null): MondayImportJob {
  return {
    kind: "apply",
    status,
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: status === "running" ? null : "2026-11-01T00:01:00.000Z",
    progress: { done: status === "running" ? 1 : 2, total: 2, label: "Importando a Cincel" },
    log: [],
    notes: [],
    error,
  };
}

function runWith(overrides: Partial<MondayImportRunState>): MondayImportRunState {
  return {
    runId: "r1",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    step: "importar",
    account: null,
    boardIds: ["b1", "b2"],
    exportOptions: { updates: true, files: false },
    exported: true,
    mapping: null,
    jobs: {},
    batchId: null,
    batchStatus: null,
    ...overrides,
  };
}

function renderStep(run: MondayImportRunState, projects: Parameters<typeof ImportStep>[0]["projects"] = null) {
  return render(
    <ImportStep
      run={run}
      projects={projects}
      rollbackCheck={null}
      isPending={false}
      error=""
      onStartApply={() => {}}
      onStartRollback={() => {}}
      onFinish={() => {}}
      boards={boards}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("ImportStep board cards (#685)", () => {
  it("shows one card per board, ready before the import", () => {
    renderStep(runWith({}));

    expect(within(screen.getByRole("group", { name: "Casa Ruiz" })).getByText("Listo para importar.")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Clientes" })).getByText("Listo para importar.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar a Cincel" })).toBeTruthy();
  });

  it("shows each card's progress while the import runs", () => {
    renderStep(runWith({ jobs: { apply: job("running") } }));

    expect(screen.getByRole("progressbar", { name: "Importando Casa Ruiz" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Importando Clientes" })).toBeTruthy();
  });

  it("turns each card into the links of the projects its board created", () => {
    renderStep(runWith({ jobs: { apply: job("succeeded") }, batchId: "x", batchStatus: "applied" }), [
      { id: "p1", name: "Casa Ruiz", href: "/proyectos/p1/ficha", boardId: "b1" },
    ]);

    const ruiz = within(screen.getByRole("group", { name: "Casa Ruiz" }));
    expect(ruiz.getByRole("link", { name: "Casa Ruiz" }).getAttribute("href")).toBe("/proyectos/p1/ficha");
    expect(within(screen.getByRole("group", { name: "Clientes" })).getByText(/sin proyectos/)).toBeTruthy();
    expect(screen.getByText("Importación terminada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deshacer importación" })).toBeTruthy();
  });

  it("shows a failure on the cards", () => {
    renderStep(runWith({ jobs: { apply: job("failed", "La importación no se aplicó. Revisa el registro.") } }));

    const card = within(screen.getByRole("group", { name: "Casa Ruiz" }));
    expect(card.getByText("La importación no se aplicó. Revisa el registro.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar importación" })).toBeTruthy();
  });
});
