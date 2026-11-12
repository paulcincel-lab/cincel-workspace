import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetCalendarioUi, useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { AssistantCalendarContext, Proposal } from "@/lib/types/calendario";
import type { PresentationStyle } from "@/lib/types/redesign";
import { settle } from "@/tests/helpers/settle";

const actions = vi.hoisted(() => ({
  proposeFromTextAction: vi.fn(),
  applyProposalAction: vi.fn(),
  cancelProposalAction: vi.fn(),
  undoProposalAction: vi.fn(),
}));
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/calendario-actions", () => actions);
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

vi.mock("./ProposalCard", () => ({
  ProposalCard: (p: { proposal: Proposal; onApply?(): void; onCancel?(): void; onEdit?(): void }) => (
    <div>
      <p>{p.proposal.title}</p>
      <button onClick={p.onApply}>Aplicar</button>
      <button onClick={p.onEdit}>Editar</button>
      <button onClick={p.onCancel}>Cancelar</button>
    </div>
  ),
}));

import { barraExamples, recentProjectName } from "@/components/calendario/barra-examples";
import { emptyCalendarioRange } from "@/lib/calendario/empty";

import { BarraParaPedir } from "./BarraParaPedir";

const context: AssistantCalendarContext = {
  view: "semana",
  from: "2026-11-09",
  to: "2026-11-15",
  selectedDate: "2026-11-11",
  filters: { mostrar: "todo", quien: "yo", proyectos: [], ocultarCompletadas: false },
};

const proposal: Proposal = {
  id: "p1",
  kind: "move_tasks",
  status: "propuesta",
  title: "Mover 3 tareas vencidas al jueves 12 nov",
  line: "Propuesta económica e Ingenierías",
  rangeFrom: null,
  rangeTo: null,
  changes: [
    {
      changeId: "c1",
      type: "task_date",
      taskId: "t1",
      title: "Ingenierías",
      projectName: null,
      before: { date: "2026-11-09", field: "commitmentDate" },
      after: { date: "2026-11-12" },
      staffId: null,
    },
  ],
  deferred: [],
  createdAt: "2026-11-11T10:00:00Z",
  expiresAt: "2026-11-12T10:00:00Z",
} as unknown as Proposal;

function renderBarra(style: PresentationStyle = "visual") {
  const client = createTestQueryClient();
  const ui = renderWithQueryClient(
    <StyleProvider style={style} scope="staff" isOverridden>
      <BarraParaPedir context={context} examples={["Pasa lo vencido al jueves"]} />
    </StyleProvider>,
    { client },
  );
  return { ...ui, client };
}

beforeEach(() => {
  resetCalendarioUi();
  Object.values(actions).forEach((fn) => fn.mockReset());
  toastSuccess.mockReset();
});

describe("BarraParaPedir", () => {
  it("submits with Enter and sends the calendar context", async () => {
    actions.proposeFromTextAction.mockResolvedValue({ ok: true, data: proposal });
    const { client } = renderBarra();
    const input = screen.getByLabelText("Pide algo para tu calendario");
    fireEvent.change(input, { target: { value: "Pasa lo vencido al jueves" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() =>
      expect(actions.proposeFromTextAction).toHaveBeenCalledWith({
        text: "Pasa lo vencido al jueves",
        view: "semana",
        from: "2026-11-09",
        to: "2026-11-15",
        selectedDate: "2026-11-11",
      }),
    );
    await screen.findByText(proposal.title);
    expect(useCalendarioUi.getState().proposal).toEqual({ id: "p1", checked: ["c1"] });
    await settle(client);
  });

  it("clears the draft with Escape", () => {
    renderBarra();
    const input = screen.getByLabelText("Pide algo para tu calendario") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hola" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("a chip fills the input and submits", async () => {
    actions.proposeFromTextAction.mockResolvedValue({ ok: true, data: proposal });
    const { client } = renderBarra("esencial");
    expect(screen.getByText("Ejemplos")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pasa lo vencido al jueves" }));
    });
    await waitFor(() => expect(actions.proposeFromTextAction).toHaveBeenCalledTimes(1));
    await screen.findByText(proposal.title);
    expect((screen.getByLabelText("Pide algo para tu calendario") as HTMLInputElement).value).toBe("Pasa lo vencido al jueves");
    await settle(client);
  });

  it("shows Pensando… and disables the input while running", async () => {
    let resolve!: (v: unknown) => void;
    actions.proposeFromTextAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBarra();
    const input = screen.getByLabelText("Pide algo para tu calendario") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "algo" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await screen.findByText("Pensando…");
    expect(input.disabled).toBe(true);
    await act(async () => resolve({ ok: true, data: proposal }));
  });

  it("shows the NO_INTENT hint inline", async () => {
    actions.proposeFromTextAction.mockResolvedValue({ ok: false, error: "NO_INTENT" });
    renderBarra();
    const input = screen.getByLabelText("Pide algo para tu calendario");
    fireEvent.change(input, { target: { value: "blah" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("No entendí qué cambiar");
  });

  it("shows the RATE_LIMITED copy inline", async () => {
    actions.proposeFromTextAction.mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    renderBarra();
    const input = screen.getByLabelText("Pide algo para tu calendario");
    fireEvent.change(input, { target: { value: "blah" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Demasiadas solicitudes");
  });

  it("applies the checked changes and offers Deshacer", async () => {
    actions.applyProposalAction.mockResolvedValue({
      ok: true,
      data: { proposalId: "p1", applied: ["c1"], skipped: [], undoToken: "u1", undoExpiresAt: null, toast: "Pasé 1 tarea al jueves." },
    });
    const { client } = renderBarra();
    client.setQueryData(qk.calendario.proposal("p1"), proposal);
    act(() => useCalendarioUi.getState().setProposal({ id: "p1", checked: ["c1"] }));
    await screen.findByText(proposal.title);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));
    await waitFor(() => expect(actions.applyProposalAction).toHaveBeenCalledWith("p1", ["c1"]));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const [text, opts] = toastSuccess.mock.calls[0]!;
    expect(text).toBe("Pasé 1 tarea al jueves.");
    expect(opts.action.label).toBe("Deshacer");
    expect(useCalendarioUi.getState().proposal).toBeNull();
  });
});

describe("Editar", () => {
  it("cancels the proposal and keeps the text in the input", async () => {
    actions.cancelProposalAction.mockResolvedValue({ ok: true, data: { id: "p1" } });
    const { client } = renderBarra();
    client.setQueryData(qk.calendario.proposal("p1"), proposal);
    act(() => {
      useCalendarioUi.getState().setBarDraft("Pasa lo vencido al jueves");
      useCalendarioUi.getState().setProposal({ id: "p1", checked: ["c1"] });
    });
    const editar = await screen.findByRole("button", { name: "Editar" });
    await act(async () => {
      fireEvent.click(editar);
    });
    expect(useCalendarioUi.getState().proposal).toBeNull();
    expect((screen.getByLabelText("Pide algo para tu calendario") as HTMLInputElement).value).toBe("Pasa lo vencido al jueves");
    await waitFor(() => expect(actions.cancelProposalAction).toHaveBeenCalledWith("p1"));
    await settle(client);
  });
});

describe("barra examples", () => {
  it("uses the most recent project of the range", () => {
    const range = emptyCalendarioRange({ from: "2026-11-09", to: "2026-11-15" }, "2026-11-11");
    expect(recentProjectName(range)).toBeNull();
    expect(barraExamples("Madrid 22")[0]).toBe("Junta con el cliente de Madrid 22 mañana a las 10");
    expect(barraExamples(null)[1]).toBe("Pasa lo vencido al jueves");
  });
});
