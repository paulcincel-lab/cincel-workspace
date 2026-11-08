// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  flags: { decideVacationAction: true } as Record<string, boolean>,
  pageData: { getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@/lib/actions/vacations-actions", () => ({ decideVacationAction: mocks.decide }));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => mocks.pageData);
vi.mock("@/components/patterns/FormDialog", async () => ({
  FormDialog: (await import("./vacation-deciders.fixtures")).patternMocks.FormDialog,
}));
vi.mock("@/components/shell/EmptyState", async () => ({
  EmptyState: (await import("./vacation-deciders.fixtures")).patternMocks.EmptyState,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";

import { TeamRequests, decisionInvalidations, teamRequestsTable, type TeamRequestRow } from "./TeamRequests";
import { ANA_ID, pendingRequestsFixture, seededDeciderClient, VIEWER_ID } from "./vacation-deciders.fixtures";
import { misVacacionesData } from "./vacaciones.fixtures";

function renderRequests(options: { canDecide?: boolean; requests?: TeamRequestRow[] } = {}) {
  const client = seededDeciderClient({ requests: options.requests });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <TeamRequests month="2026-11" viewerStaffId={VIEWER_ID} canDecide={options.canDecide ?? true} />
    </StyleProvider>,
    { client },
  );
  return { ...view, invalidate };
}

function openDecision(name: string, decision: "Aprobar" | "Rechazar", note?: string) {
  fireEvent.click(screen.getByRole("button", { name: `${decision} solicitud de ${name}` }));
  const dialog = screen.getByRole("dialog");
  if (note !== undefined) {
    fireEvent.change(within(dialog).getByLabelText("Nota (opcional)"), { target: { value: note } });
  }
  return dialog;
}

async function decide(name: string, decision: "Aprobar" | "Rechazar", note?: string) {
  const dialog = openDecision(name, decision, note);
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: decision }));
  });
}

function invalidatedKeys(invalidate: ReturnType<typeof renderRequests>["invalidate"]) {
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

beforeEach(() => {
  mocks.flags.decideVacationAction = true;
  mocks.decide.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.pageData.getMisVacacionesPageData.mockReset();
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
  it("approves with a note, removes the row and invalidates absences, Personas and Inicio", async () => {
    mocks.decide.mockResolvedValue({ ok: true, data: { id: "req-ana", status: "aprobada" } });
    const { invalidate } = renderRequests();
    await decide("Ana Torres", "Aprobar", "  Disfruta  ");
    expect(mocks.decide).toHaveBeenCalledWith("req-ana", "aprobada", "Disfruta");
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Solicitud aprobada"));
    expect(screen.queryByText("Ana Torres")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([
        ["vacations", "absences"],
        qk.personas.equipo(),
        qk.personas.detail(ANA_ID),
        qk.inicio(),
      ]),
    );
  });

  it("names the requester's Personas detail in the invalidation list", () => {
    const [request] = pendingRequestsFixture();
    expect(decisionInvalidations({ request, decision: "aprobada" })).toEqual([
      ["vacations", "absences"],
      ["personas", "equipo"],
      ["personas", "detail", ANA_ID],
      ["inicio"],
    ]);
  });

  it("removes the row before the server answers (optimistic vacations.pending)", async () => {
    let resolve!: (value: unknown) => void;
    mocks.decide.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client } = renderRequests();
    const dialog = openDecision("Luis Méndez", "Rechazar");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rechazar" }));
    // The dialog still names the request; the table row is gone.
    await waitFor(() => expect(screen.queryByText("Luis Méndez")).toBeNull());
    expect(client.getQueryData<TeamRequestRow[]>(qk.vacations.pending())?.map((r) => r.id)).not.toContain("req-luis");
    await act(async () => resolve({ ok: true, data: { id: "req-luis", status: "rechazada" } }));
    expect(mocks.decide).toHaveBeenCalledWith("req-luis", "rechazada", undefined);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Solicitud rechazada"));
  });

  it("shows an error toast on FORBIDDEN and puts the row back", async () => {
    mocks.decide.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const { client } = renderRequests();
    await decide("Ana Torres", "Aprobar");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("Ana Torres")).toBeTruthy();
    expect(client.getQueryData<TeamRequestRow[]>(qk.vacations.pending())?.map((r) => r.id)).toContain("req-ana");
    expect(mocks.pageData.getMisVacacionesPageData).not.toHaveBeenCalled();
  });

  it("shows an error toast on INVALID and refetches the stale pending list", async () => {
    mocks.decide.mockResolvedValue({ ok: false, error: "INVALID: not pendiente" });
    mocks.pageData.getMisVacacionesPageData.mockResolvedValue(
      misVacacionesData({ deciders: { viewerStaffId: VIEWER_ID, requests: [], settings: null } }),
    );
    const { invalidate } = renderRequests();
    await decide("Ana Torres", "Rechazar", "No hay cobertura");
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo."),
    );
    await waitFor(() => expect(invalidatedKeys(invalidate)).toContainEqual(qk.vacations.pending()));
    await waitFor(() => expect(mocks.pageData.getMisVacacionesPageData).toHaveBeenCalledWith({ month: "2026-11" }));
    await waitFor(() => expect(screen.getByText("No hay solicitudes pendientes")).toBeTruthy());
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
