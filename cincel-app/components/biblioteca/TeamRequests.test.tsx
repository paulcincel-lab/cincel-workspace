// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  decide: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  flags: { decideVacationAction: true } as Record<string, boolean>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh }),
  usePathname: () => "/biblioteca/vacaciones",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@/lib/actions/vacations-actions", () => ({ decideVacationAction: mocks.decide }));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/components/patterns/FormDialog", async () => ({
  FormDialog: (await import("./vacation-deciders.fixtures")).patternMocks.FormDialog,
}));
vi.mock("@/components/shell/EmptyState", async () => ({
  EmptyState: (await import("./vacation-deciders.fixtures")).patternMocks.EmptyState,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";

import { TeamRequests, teamRequestsTable } from "./TeamRequests";
import { pendingRequestsFixture, VIEWER_ID } from "./vacation-deciders.fixtures";

function renderRequests(props: Partial<Parameters<typeof TeamRequests>[0]> = {}) {
  return render(
    <StyleProvider style="visual" scope="staff">
      <TeamRequests requests={pendingRequestsFixture()} viewerStaffId={VIEWER_ID} canDecide {...props} />
    </StyleProvider>,
  );
}

async function decide(name: string, decision: "Aprobar" | "Rechazar", note?: string) {
  fireEvent.click(screen.getByRole("button", { name: `${decision} solicitud de ${name}` }));
  const dialog = screen.getByRole("dialog");
  if (note !== undefined) {
    fireEvent.change(within(dialog).getByLabelText("Nota (opcional)"), { target: { value: note } });
  }
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: decision }));
  });
}

beforeEach(() => {
  mocks.flags.decideVacationAction = true;
  mocks.decide.mockReset();
  mocks.refresh.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => cleanup());

describe("TeamRequests visibility", () => {
  it("is absent from the DOM without canDecideVacations", () => {
    const { container } = renderRequests({ canDecide: false });
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Solicitudes del equipo")).toBeNull();
  });

  it("renders the section for deciders", () => {
    renderRequests();
    expect(screen.getByRole("heading", { name: "Solicitudes del equipo" })).toBeTruthy();
    for (const label of ["Persona", "Desde", "Hasta", "Días", "Tipo", "Comentario", "Solicitada"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeTruthy();
    }
  });
});

describe("TeamRequests own rows", () => {
  it("never lists the viewer's own request", () => {
    renderRequests();
    expect(screen.getByText("Ana Torres")).toBeTruthy();
    expect(screen.getByText("Luis Méndez")).toBeTruthy();
    expect(screen.queryByText("Paul Cincel")).toBeNull();
    expect(screen.queryByText("Trámite")).toBeNull();
  });

  it("drops the viewer's rows from the table data too", () => {
    const rows = pendingRequestsFixture().filter((r) => r.staffId !== VIEWER_ID);
    const data = teamRequestsTable(rows, { withActions: true });
    expect(data.rows.map((r) => r.id)).toEqual(["req-ana", "req-luis"]);
    expect(data.columns.map((c) => c.label)).toEqual([
      "Persona",
      "Desde",
      "Hasta",
      "Días",
      "Tipo",
      "Comentario",
      "Solicitada",
      "Acciones",
    ]);
  });

  it("shows the empty state when only the viewer's own request is pending", () => {
    renderRequests({ requests: pendingRequestsFixture().filter((r) => r.staffId === VIEWER_ID) });
    expect(screen.getByText("No hay solicitudes pendientes")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("TeamRequests decide", () => {
  it("approves with a note, removes the row and refreshes", async () => {
    mocks.decide.mockResolvedValue({ id: "req-ana", status: "aprobada" });
    renderRequests();
    await decide("Ana Torres", "Aprobar", "  Disfruta  ");
    expect(mocks.decide).toHaveBeenCalledWith("req-ana", "aprobada", "Disfruta");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Solicitud aprobada");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText("Ana Torres")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rejects without a note", async () => {
    mocks.decide.mockResolvedValue({ id: "req-luis", status: "rechazada" });
    renderRequests();
    await decide("Luis Méndez", "Rechazar");
    expect(mocks.decide).toHaveBeenCalledWith("req-luis", "rechazada", undefined);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Solicitud rechazada");
    expect(screen.queryByText("Luis Méndez")).toBeNull();
  });

  it("shows an error toast on FORBIDDEN and keeps the row", async () => {
    mocks.decide.mockRejectedValue(new Error("FORBIDDEN"));
    renderRequests();
    await decide("Ana Torres", "Aprobar");
    expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("Ana Torres")).toBeTruthy();
  });

  it("shows an error toast on INVALID and reloads the stale list", async () => {
    mocks.decide.mockRejectedValue(new Error("INVALID: not pendiente"));
    renderRequests();
    await decide("Ana Torres", "Rechazar", "No hay cobertura");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("offers no decide buttons while decideVacationAction is not implemented", () => {
    mocks.flags.decideVacationAction = false;
    renderRequests();
    expect(screen.getByText("Ana Torres")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Aprobar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rechazar/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).toBeNull();
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
