// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

import type { AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";
import type { MondayImportHistoryEntry } from "@/lib/monday-import/history";
import type { MondayImportJob, MondayImportRunState } from "@/lib/types/monday-import";
import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

/** What the "server" holds: the page data and the run polls read it. */
const server = vi.hoisted(() => ({ run: null as unknown, polls: [] as unknown[] }));
const mondayActions = vi.hoisted(() => {
  const failed = async () => ({ ok: false as const, error: "No disponible en la prueba." });
  return {
    getMondayImportStatusAction: vi.fn(failed),
    openMondayImportRunAction: vi.fn(failed),
    getMondayImportRunAction: vi.fn(async () => {
      if (server.polls.length > 0) server.run = server.polls.shift();
      return { ok: true as const, run: server.run };
    }),
    saveMondayImportStepAction: vi.fn(failed),
    connectMondayAction: vi.fn(failed),
    startMondayExportAction: vi.fn(failed),
    getMondayExportSourceAction: vi.fn(failed),
    getMondayImportChoicesAction: vi.fn(failed),
    createMondayStaffAction: vi.fn(failed),
    saveMondayMappingDraftAction: vi.fn(failed),
    downloadMondayMappingAction: vi.fn(failed),
    uploadMondayMappingAction: vi.fn(failed),
    getMondayImportOptionsAction: vi.fn(failed),
    previewMondayImportAction: vi.fn(failed),
    startMondayApplyAction: vi.fn(failed),
    getMondayImportedProjectsAction: vi.fn(async () => ({ ok: true as const, projects: [] })),
    checkMondayRollbackAction: vi.fn(async () => ({
      ok: true as const,
      check: { canRollback: true, blockers: [] },
    })),
    startMondayRollbackAction: vi.fn(failed),
    getMondayImportHistoryAction: vi.fn(async () => ({ ok: true as const, history: [] })),
    suggestMondayPositionAction: vi.fn(failed),
    saveMondayStatusMapAction: vi.fn(failed),
    getMondayRemapAction: vi.fn(failed),
    previewMondayRemapAction: vi.fn(failed),
    applyMondayRemapAction: vi.fn(failed),
  };
});
const pageData = vi.hoisted(() => ({ getAjustesMondayPageData: vi.fn() }));
vi.mock("@/lib/actions/monday-import-actions", () => mondayActions);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);
vi.mock("@/lib/actions/onboarding-actions", () => ({ completeOnboardingAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ createTaskStatusAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AjustesMondayScreen } from "./AjustesMondayScreen";
import { MondayImportHistory, MondayLastImport } from "./MondayImportSections";
import { qk } from "@/lib/query/keys";
import { seedMondayQueries } from "@/lib/query/options/monday";
import { createTestQueryClient, hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";

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
  vi.useRealTimers();
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

// --- Ajustes › Importar de monday on TanStack Query (#966) ---------------------------------------------------------

const RUN_ID = "12345678-1234-4234-8234-123456789012";

function job(kind: MondayImportJob["kind"], status: MondayImportJob["status"]): MondayImportJob {
  return {
    kind,
    status,
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: status === "running" ? null : "2026-11-01T00:05:00.000Z",
    progress: { done: 1, total: 4, label: "Importando" },
    log: [],
    notes: [],
    error: null,
  };
}

function runState(patch: Partial<MondayImportRunState> = {}): MondayImportRunState {
  return {
    runId: RUN_ID,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    step: "equivalencias",
    account: null,
    boardIds: [],
    exportOptions: { updates: true, files: true },
    exported: false,
    mapping: null,
    jobs: {},
    batchId: null,
    batchStatus: null,
    ...patch,
  };
}

const APPLYING = runState({ batchId: "b-1", batchStatus: "applying", jobs: { apply: job("apply", "running") } });
const APPLIED_RUN = runState({ batchId: "b-1", batchStatus: "applied", jobs: { apply: job("apply", "succeeded") } });

function page(run: MondayImportRunState | null): AjustesMondayPageData {
  return {
    status: { hasServerToken: true },
    run,
    choices: null,
    history: [],
    errors: { load: null, history: null },
  };
}

/** Every server action the screen can call; none may run on a hydrated mount. */
function actionCalls(): number {
  return (
    Object.values(mondayActions).reduce((sum, fn) => sum + fn.mock.calls.length, 0) +
    pageData.getAjustesMondayPageData.mock.calls.length
  );
}

function resetServer(run: MondayImportRunState | null, polls: MondayImportRunState[] = []) {
  vi.clearAllMocks();
  server.run = run;
  server.polls = polls;
  pageData.getAjustesMondayPageData.mockImplementation(async () => page(server.run as MondayImportRunState | null));
}

/** Seeds the client as the page's prefetch does and renders the screen. */
function renderScreen(run: MondayImportRunState | null) {
  const client = createTestQueryClient();
  const data = page(run);
  client.setQueryData(qk.ajustes.page("monday"), data);
  seedMondayQueries(client, data);
  return renderWithQueryClient(<AjustesMondayScreen />, { client });
}

/** Lets pending promises (mutations, query fetches) settle under fake timers. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("AjustesMondayScreen: hydration", () => {
  it("renders from the dehydrated page data with 0 client action calls on mount", async () => {
    resetServer(null);
    const data = page(null);
    const { client, state } = await hydrationRoundtrip(async (serverClient) => {
      serverClient.setQueryData(qk.ajustes.page("monday"), data);
      seedMondayQueries(serverClient, data);
    });
    renderWithQueryClient(<AjustesMondayScreen />, { client, hydrate: state });
    expect(screen.getByRole("button", { name: "Iniciar importación" })).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(actionCalls()).toBe(0);
  });

  it("puts no Monday token in the dehydrated status", () => {
    expect(Object.keys(page(null).status)).toEqual(["hasServerToken"]);
  });
});

describe("MondayImportWizard: start / continue button", () => {
  it("offers Iniciar importación with no run and creates one with a single call", async () => {
    resetServer(null);
    mondayActions.openMondayImportRunAction.mockImplementation(async () => {
      server.run = runState({ step: "conectar" });
      return { ok: true, run: server.run } as never;
    });
    renderScreen(null);
    expect(screen.queryByRole("button", { name: "Continuar importación" })).toBeNull();
    expect(mondayActions.openMondayImportRunAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar importación" }));
    expect(await screen.findByRole("list", { name: "Pasos" })).toBeTruthy();
    expect(mondayActions.openMondayImportRunAction).toHaveBeenCalledTimes(1);
    expect(mondayActions.openMondayImportRunAction).toHaveBeenCalledWith(true);
  });

  it("offers Continuar importación with the current step for an open run and resumes it", async () => {
    const run = runState({ jobs: { export: job("export", "running") }, step: "tableros" });
    resetServer(run);
    mondayActions.openMondayImportRunAction.mockImplementation(async () => ({ ok: true, run }) as never);
    renderScreen(run);
    expect(screen.queryByRole("button", { name: "Iniciar importación" })).toBeNull();
    expect(screen.getByText("Tableros")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar importación" }));
    expect(await screen.findByRole("list", { name: "Pasos" })).toBeTruthy();
    expect(mondayActions.openMondayImportRunAction).toHaveBeenCalledTimes(1);
    // Resuming never starts a fresh run.
    expect(mondayActions.openMondayImportRunAction).toHaveBeenCalledWith(false);
  });
});

describe("MondayImportWizard: run poll", () => {
  it("polls every 2 s while the apply runs, stops when it is done and invalidates what the import changed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    resetServer(APPLYING, [APPLYING, APPLIED_RUN]);
    mondayActions.openMondayImportRunAction.mockImplementation(async () => ({ ok: true, run: APPLYING }) as never);
    const { client } = renderScreen(APPLYING);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: "Continuar importación" }));
    await flush();
    expect(screen.getByRole("list", { name: "Pasos" })).toBeTruthy();
    const poll = mondayActions.getMondayImportRunAction;
    expect(poll).not.toHaveBeenCalled();

    await flush(2000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenLastCalledWith(RUN_ID);
    await flush(2000);
    expect(poll).toHaveBeenCalledTimes(2);

    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    for (const key of [qk.proyectos.all, qk.tareas.all, qk.catalog.staff(), qk.inicio(), qk.monday.history()]) {
      expect(keys).toContain(JSON.stringify(key));
    }

    // Done: no more polls.
    await flush(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
