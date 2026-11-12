// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EDITED_REASON, type ConfirmationPart } from "../ConfirmationCard";
import { ProposalConfirmation } from "../ProposalConfirmation";
import { qk } from "@/lib/query/keys";
import type { Proposal } from "@/lib/types/calendario";

const actions = vi.hoisted(() => ({
  applyProposalAction: vi.fn(),
  undoProposalAction: vi.fn(),
  cancelProposalAction: vi.fn(),
}));
vi.mock("@/lib/actions/calendario-actions", () => actions);
vi.mock("next/navigation", () => ({ usePathname: () => "/tareas" }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const proposal = {
  id: "p1",
  kind: "mover_tareas",
  status: "abierta",
  title: "Mover",
  line: "",
  rangeFrom: null,
  rangeTo: null,
  deferred: [],
  createdAt: "2026-11-09T10:00:00Z",
  expiresAt: "2026-11-09T11:00:00Z",
  changes: ["a", "b"].map((id) => ({
    changeId: id,
    type: "task_date",
    taskId: `t-${id}`,
    title: `Tarea ${id}`,
    projectName: "Casa Lomas",
    before: { date: "2026-11-10", field: "commitmentDate" },
    after: { date: "2026-11-12" },
    staffId: null,
  })),
} as unknown as Proposal;

function part(overrides: Partial<ConfirmationPart> = {}): ConfirmationPart {
  return {
    toolCallId: "c1",
    toolName: "apply_proposal",
    input: { proposalId: "p1" },
    state: "approval-requested",
    approvalId: "ap1",
    ...overrides,
  };
}

function renderCard(onRespond = vi.fn(), p = part()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.calendario.proposal("p1"), proposal);
  render(
    <QueryClientProvider client={qc}>
      <ProposalConfirmation part={p} onRespond={onRespond} />
    </QueryClientProvider>,
  );
  return onRespond;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("apply_proposal confirmation", () => {
  it("shows one checkbox per change and counts the checked ones", () => {
    renderCard();
    expect(screen.getByRole("checkbox", { name: "Incluir Tarea a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar 2 cambios" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Tarea b" }));
    expect(screen.getByRole("button", { name: "Aplicar 1 cambio" })).toBeTruthy();
  });

  it("approves the whole proposal when every row is checked", () => {
    const onRespond = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar 2 cambios" }));
    expect(onRespond).toHaveBeenCalledWith(true);
    expect(actions.applyProposalAction).not.toHaveBeenCalled();
  });

  it("denies with the edited reason and applies only the checked rows", async () => {
    actions.applyProposalAction.mockResolvedValue({
      ok: true,
      data: { proposalId: "p1", applied: ["a"], skipped: [], undoToken: "tok", undoExpiresAt: null, toast: "Apliqué 1 cambio." },
    });
    const onRespond = renderCard();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Tarea b" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar 1 cambio" }));
    expect(onRespond).toHaveBeenCalledWith(false, EDITED_REASON);
    await waitFor(() => expect(actions.applyProposalAction).toHaveBeenCalledWith("p1", ["a"]));
    expect(await screen.findByText("Apliqué 1 cambio.")).toBeTruthy();
  });

  it("undoes from the card after a subset apply", async () => {
    actions.applyProposalAction.mockResolvedValue({
      ok: true,
      data: { proposalId: "p1", applied: ["a"], skipped: [], undoToken: "tok", undoExpiresAt: null, toast: "Apliqué 1 cambio." },
    });
    actions.undoProposalAction.mockResolvedValue({ ok: true, data: { restored: ["a"], skipped: [], toast: "Deshice 1 cambio." } });
    renderCard();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Tarea b" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar 1 cambio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(actions.undoProposalAction).toHaveBeenCalledWith("tok"));
    expect(await screen.findByText("Deshice 1 cambio.")).toBeTruthy();
  });

  it("offers Deshacer after a full approval from the tool output", async () => {
    actions.undoProposalAction.mockResolvedValue({ ok: true, data: { restored: ["a", "b"], skipped: [], toast: "Deshice 2 cambios." } });
    renderCard(
      vi.fn(),
      part({
        state: "output-available",
        approved: true,
        output: { applied: ["a", "b"], skipped: [], undoToken: "tok2", undoExpiresAt: null, toast: "Apliqué 2 cambios." },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(actions.undoProposalAction).toHaveBeenCalledWith("tok2"));
  });
});
