// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { Position, WorkflowDetail } from "@/lib/types/core";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ access: "Administrador", email: "ana@cincel.mx", member: { id: "viewer" } }),
}));

const actions = vi.hoisted(() => ({
  fetchPositionsAction: vi.fn(),
  createPositionAction: vi.fn(),
  updatePositionAction: vi.fn(),
  deletePositionAction: vi.fn(),
  reorderPositionsAction: vi.fn(),
  setPositionPhasesAction: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => actions);
const pageData = vi.hoisted(() => ({ getAjustesPuestosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

/** The table as a plain list plus one button that drops the last row on top (the drag-and-drop outcome). */
vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({
    data,
    getRowId,
    onReorderRows,
  }: {
    data: Position[];
    getRowId: (row: Position) => string;
    onReorderRows?: (ids: string[]) => void;
  }) => (
    <div>
      <ol aria-label="Puestos">
        {data.map((row) => (
          <li key={getRowId(row)}>{row.name}</li>
        ))}
      </ol>
      {onReorderRows ? (
        <button
          type="button"
          onClick={() => {
            const ids = data.map(getRowId);
            onReorderRows([ids[ids.length - 1], ...ids.slice(0, -1)]);
          }}
        >
          Subir el último
        </button>
      ) : null}
    </div>
  ),
}));

import { PuestosClient, reorderCachedPositions } from "./PuestosClient";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

function position(id: string, name: string, sortOrder: number): Position {
  return { id, name, sortOrder, active: true, staffCount: 0, googleManaged: false, phases: [] };
}

const A = position("p1", "Arquitecto", 0);
const B = position("p2", "Residente", 1);
const C = position("p3", "Dibujante", 2);
const workflows: WorkflowDetail[] = [];

function names(): string[] {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

function renderPuestos() {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("puestos"), { positions: [A, B, C], workflows });
  return renderWithQueryClient(<PuestosClient />, { client });
}

beforeEach(() => {
  seedSessionUser(getCurrentAuthenticatedUser());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PuestosClient reorder (optimistic on ajustes.page('puestos'))", () => {
  it("shows the new order at once, before the server answers", async () => {
    let finish: (value: unknown) => void = () => undefined;
    actions.reorderPositionsAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    pageData.getAjustesPuestosPageData.mockResolvedValue({ positions: [C, A, B], workflows });
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "Subir el último" }));

    await waitFor(() => expect(names()).toEqual(["Dibujante", "Arquitecto", "Residente"]));
    expect(actions.reorderPositionsAction).toHaveBeenCalledWith(["p3", "p1", "p2"]);
    finish({ ok: true, data: undefined });
    await waitFor(() => expect(pageData.getAjustesPuestosPageData).toHaveBeenCalledTimes(1));
    expect(names()).toEqual(["Dibujante", "Arquitecto", "Residente"]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rolls back and shows a toast when the server refuses", async () => {
    actions.reorderPositionsAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    pageData.getAjustesPuestosPageData.mockResolvedValue({ positions: [A, B, C], workflows });
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "Subir el último" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(names()).toEqual(["Arquitecto", "Residente", "Dibujante"]);
  });
});

describe("reorderCachedPositions", () => {
  it("reorders the cached rows and returns the previous data", async () => {
    const client = createTestQueryClient();
    const before = { positions: [A, B, C], workflows };
    client.setQueryData(qk.ajustes.page("puestos"), before);

    const previous = await reorderCachedPositions(client, ["p2", "p3", "p1"]);

    expect(previous).toBe(before);
    expect(client.getQueryData(qk.ajustes.page("puestos"))).toEqual({ positions: [B, C, A], workflows });
  });
});
