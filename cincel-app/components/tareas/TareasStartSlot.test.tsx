// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { StartEtapaResult, EtapaBoard } from "@/lib/types/core";
import type { StartSlotCandidate, TareasStartSlotData } from "@/lib/types/tareas-start-slot";
import { seedSessionUser } from "@/tests/helpers/session-user";

const nav = vi.hoisted(() => ({ search: "estilo=analitico&etapa=diseno", replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const pageData = vi.hoisted(() => ({ getTareasStartSlotData: vi.fn() }));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);
vi.mock("@/lib/actions/etapa-start-actions", () => ({
  previewStartEtapaAction: vi.fn(),
  startEtapaAction: vi.fn(),
  undoStartEtapaAction: vi.fn(),
}));

const sonner = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("sonner", () => sonner);

/** What the slot hands the sheet, and buttons to close it or report a start. */
const sheetProps = vi.hoisted(() => ({ staff: [] as unknown[] }));
vi.mock("@/components/tareas/StartEtapaSheet", () => ({
  StartEtapaSheet: ({
    open,
    projectId,
    staff,
    onClose,
    onStarted,
  }: {
    open: boolean;
    projectId: string | null;
    staff: unknown[];
    onClose(): void;
    onStarted(result: unknown): void;
  }) => {
    sheetProps.staff = staff;
    return (
      <div data-testid="start-etapa-sheet" data-open={String(open)} data-project={projectId ?? ""}>
        <button type="button" onClick={onClose}>
          Cerrar hoja
        </button>
        <button
          type="button"
          onClick={() => {
            onStarted(STARTED);
            onClose();
          }}
        >
          Simular inicio
        </button>
      </div>
    );
  },
}));

import { TareasStartSlot } from "./TareasStartSlot";

const DISENO = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };

const BOARD: EtapaBoard = {
  workflow: DISENO,
  ready: [{ project: { id: "p7", name: "Casa Valle" }, currentEtapa: null, readySince: "2026-11-02T10:00:00.000Z", pending: null }],
  upcoming: [
    {
      project: { id: "p8", name: "Loft Centro" },
      currentEtapa: null,
      readySince: null,
      pending: {
        etapa: { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
        phase: { id: "f-cobro", name: "Cobro", sortOrder: 3 },
        open: 1,
        total: 2,
      },
    },
  ],
  started: [],
};

const CANDIDATES: StartSlotCandidate[] = [
  { id: "s1", name: "Ana López", suggested: true },
  { id: "s2", name: "Luis Pérez", suggested: false },
];

function slotData(overrides: Partial<TareasStartSlotData> = {}): TareasStartSlotData {
  return { board: BOARD, candidates: CANDIDATES, canStart: true, ...overrides };
}

const STARTED: StartEtapaResult = {
  batchId: "b-1",
  createdCount: 3,
  skippedCount: 0,
  stageCreated: true,
  project: { id: "p7", name: "Casa Valle" },
  workflow: DISENO,
};

function renderSlot(client = createTestQueryClient()) {
  return renderWithQueryClient(<TareasStartSlot workflow={DISENO} />, { client });
}

function sheet() {
  return screen.getByTestId("start-etapa-sheet");
}

let replaceState: MockInstance<History["replaceState"]>;

beforeEach(() => {
  nav.search = "estilo=analitico&etapa=diseno";
  pageData.getTareasStartSlotData.mockReset().mockResolvedValue(slotData());
  sonner.toast.mockReset();
  sheetProps.staff = [];
  seedSessionUser({ member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" });
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  replaceState.mockRestore();
  vi.clearAllMocks();
});

describe("TareasStartSlot", () => {
  it("loads the slot with one page-data call and renders Listos para iniciar and Próximos", async () => {
    renderSlot();
    expect(await screen.findByText("Listos para iniciar (1)")).toBeTruthy();
    expect(screen.getByText("Próximos (1)")).toBeTruthy();
    expect(pageData.getTareasStartSlotData).toHaveBeenCalledTimes(1);
    expect(pageData.getTareasStartSlotData).toHaveBeenCalledWith({ etapaId: "w-diseno" });
    expect(sheet().getAttribute("data-open")).toBe("false");
  });

  it("renders from a seeded cache without a call, and a remount within staleTime makes none", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.tareas.startSlot("w-diseno"), slotData());
    const first = renderSlot(client);
    expect(screen.getByText("Listos para iniciar (1)")).toBeTruthy();
    first.unmount();

    renderSlot(client);
    expect(screen.getByText("Listos para iniciar (1)")).toBeTruthy();
    await act(async () => {});
    expect(pageData.getTareasStartSlotData).not.toHaveBeenCalled();
  });

  it("hands the sheet the candidates as {id,name,suggested} only", async () => {
    renderSlot();
    await screen.findByText("Listos para iniciar (1)");
    expect(sheetProps.staff).toEqual(CANDIDATES);
    for (const row of sheetProps.staff) expect(Object.keys(row as object).sort()).toEqual(["id", "name", "suggested"]);
  });

  it("opens the sheet from the Iniciar button", async () => {
    renderSlot();
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar Diseño en Casa Valle" }));
    expect(sheet().getAttribute("data-open")).toBe("true");
    expect(sheet().getAttribute("data-project")).toBe("p7");
  });

  it("opens the sheet once from ?project=X&iniciar=1 and strips both params with history.replaceState on close", async () => {
    nav.search = "estilo=analitico&etapa=diseno&project=p9&iniciar=1";
    renderSlot();
    await waitFor(() => expect(sheet().getAttribute("data-open")).toBe("true"));
    expect(sheet().getAttribute("data-project")).toBe("p9");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar hoja" }));
    expect(sheet().getAttribute("data-open")).toBe("false");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/tareas?estilo=analitico&etapa=diseno");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();

    // The URL in the mock still has the params: the sheet must not open again.
    await act(async () => {});
    expect(sheet().getAttribute("data-open")).toBe("false");
  });

  it("does not open the sheet for ?project=X without iniciar=1", async () => {
    nav.search = "estilo=analitico&etapa=diseno&project=p9";
    renderSlot();
    await screen.findByText("Listos para iniciar (1)");
    expect(sheet().getAttribute("data-open")).toBe("false");
  });

  it("without canStart shows a read-only count and ignores iniciar", async () => {
    pageData.getTareasStartSlotData.mockResolvedValue(slotData({ canStart: false }));
    nav.search = "estilo=analitico&etapa=diseno&project=p9&iniciar=1";
    renderSlot();
    expect(await screen.findByTestId("ready-to-start-count")).toBeTruthy();
    expect(sheet().getAttribute("data-open")).toBe("false");
  });

  it("renders no board when the etapa is gone (null)", async () => {
    pageData.getTareasStartSlotData.mockResolvedValue(null);
    renderSlot();
    await waitFor(() => expect(pageData.getTareasStartSlotData).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText(/Listos para iniciar/)).toBeNull();
  });

  it("shows the mapped error when the slot can't load", async () => {
    pageData.getTareasStartSlotData.mockRejectedValue(new Error("FORBIDDEN"));
    renderSlot();
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });

  it("after a start shows the toast with Deshacer and closes the sheet, without a route refresh", async () => {
    renderSlot();
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar Diseño en Casa Valle" }));
    fireEvent.click(screen.getByRole("button", { name: "Simular inicio" }));

    expect(sonner.toast).toHaveBeenCalledWith(
      "Se crearon 3 tareas de Diseño en Casa Valle.",
      expect.objectContaining({ action: expect.objectContaining({ label: "Deshacer" }) }),
    );
    expect(sheet().getAttribute("data-open")).toBe("false");
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    // Nothing reloads by hand: the start mutation's invalidation refetches the slot.
    expect(pageData.getTareasStartSlotData).toHaveBeenCalledTimes(1);
  });
});
