// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveMeetingNotesAction: vi.fn(),
  runProposingToolAction: vi.fn(),
  applyProposalAction: vi.fn(),
  cancelProposalAction: vi.fn(),
  undoProposalAction: vi.fn(),
  sendMinutesAction: vi.fn(),
}));
vi.mock("@/lib/actions/calendario-actions", () => actions);
vi.mock("@/lib/query/options/catalog", async () => {
  const { queryOptions } = await import("@tanstack/react-query");
  return {
    catalogStaffOptions: () =>
      queryOptions({ queryKey: ["catalog", "staff"], queryFn: async () => [{ id: "s1", name: "Luis Martínez" }] }),
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { resetCalendarioUi, useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { CalEventItem, MeetingMinutes, Proposal } from "@/lib/types/calendario";
import type { PresentationStyle } from "@/lib/types/redesign";

import { MeetingMinutesPanel, NOTES_DEBOUNCE_MS } from "./MeetingMinutesPanel";
import { MeetingsList, meetingChips } from "./MeetingsList";

const minutes = (over: Partial<MeetingMinutes> = {}): MeetingMinutes => ({
  minutesId: "m1", eventId: "e1", notes: "", status: "borrador", openPoints: [], decisions: [], tasks: [], sentAt: null, updatedAt: null, ...over,
});

const proposal: Proposal = {
  id: "p1", kind: "crear_tareas_minuta", status: "propuesta", title: "Minuta", line: "", rangeFrom: null, rangeTo: null,
  deferred: [], createdAt: "2026-11-11T10:00:00Z", expiresAt: "2026-11-12T10:00:00Z",
  changes: [
    { changeId: "c1", type: "decision", minutesId: "m1", text: "cocina en cuarzo blanco" },
    { changeId: "c2", type: "task_create", draft: { title: "Cotizar cuarzo", projectId: "pr", managerId: "s1", commitmentDate: "2026-11-14", tramoId: null, sourceText: "" } },
    { changeId: "c3", type: "task_create", draft: { title: "Llamar al cliente", projectId: "pr", managerId: null, commitmentDate: null, tramoId: null, sourceText: "" } },
  ],
};

function renderPanel(style: PresentationStyle, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <StyleProvider style={style} scope="staff">
        <MeetingMinutesPanel minutes={minutes({ status: "lista" })} eventId="e1" projectId="pr" projectName="Madrid 22" />
      </StyleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.values(actions).forEach((fn) => fn.mockReset());
  actions.saveMeetingNotesAction.mockResolvedValue({ ok: true, data: { minutesId: "m1", updatedAt: "x" } });
  resetCalendarioUi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("meetingChips", () => {
  it("derives Hoy, Próxima, Minuta lista and Sin minuta", () => {
    expect(meetingChips({ date: "2026-11-11", minutes: "ninguna" }, "2026-11-11").map((c) => c.label)).toEqual(["Hoy"]);
    expect(meetingChips({ date: "2026-11-12", minutes: "borrador" }, "2026-11-11").map((c) => c.label)).toEqual(["Próxima"]);
    expect(meetingChips({ date: "2026-11-10", minutes: "enviada" }, "2026-11-11").map((c) => c.label)).toEqual(["Minuta lista"]);
    expect(meetingChips({ date: "2026-11-10", minutes: "ninguna" }, "2026-11-11").map((c) => c.label)).toEqual(["Sin minuta"]);
  });
});

describe("MeetingsList per Estilo", () => {
  const meeting = { kind: "event", id: "e:1", eventId: "1", title: "Junta Madrid", date: "2026-11-12", start: "2026-11-12T10:00:00-06:00", allDay: false, project: { id: "p", name: "Madrid 22" }, minutes: "lista" } as unknown as CalEventItem;
  it.each(["visual", "esencial", "analitico"] as const)("%s shows the title and chips", (style) => {
    const onOpen = vi.fn();
    render(
      <StyleProvider style={style} scope="staff">
        <MeetingsList meetings={[meeting]} today="2026-11-11" onOpen={onOpen} />
      </StyleProvider>,
    );
    expect(screen.getByText("Próxima")).toBeTruthy();
    expect(screen.getByText("Minuta lista")).toBeTruthy();
    fireEvent.click(screen.getByText("Junta Madrid"));
    expect(onOpen).toHaveBeenCalledWith("e:1");
  });
  it("analitico has the four columns", () => {
    render(
      <StyleProvider style="analitico" scope="staff">
        <MeetingsList meetings={[meeting]} today="2026-11-11" />
      </StyleProvider>,
    );
    for (const name of ["Fecha", "Reunión", "Proyecto", "Estado"]) expect(screen.getByRole("columnheader", { name })).toBeTruthy();
  });
});

describe("MeetingMinutesPanel", () => {
  it("autosaves the notes once after the debounce and says Guardado", async () => {
    renderPanel("analitico");
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "a" } });
    fireEvent.change(box, { target: { value: "ab" } });
    expect(actions.saveMeetingNotesAction).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(NOTES_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(screen.getByText("Guardado")).toBeTruthy());
    expect(actions.saveMeetingNotesAction).toHaveBeenCalledTimes(1);
    expect(actions.saveMeetingNotesAction).toHaveBeenCalledWith("e1", "ab");
  });

  it("does not create unchecked tasks", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.calendario.proposal("p1"), proposal);
    useCalendarioUi.getState().setProposal({ id: "p1", checked: ["c1", "c2", "c3"] });
    actions.applyProposalAction.mockResolvedValue({ ok: true, data: { proposalId: "p1", applied: ["c1", "c2"], skipped: [], undoToken: "t", undoExpiresAt: null, toast: "Creé 1 tarea." } });
    renderPanel("analitico", qc);
    await waitFor(() => expect(screen.getByText("Luis Martínez")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Llamar al cliente" }));
    const button = screen.getByRole("button", { name: "Crear 1 tarea en Madrid 22" });
    fireEvent.click(button);
    await waitFor(() => expect(actions.applyProposalAction).toHaveBeenCalledWith("p1", ["c1", "c2"]));
  });

  it("marks an unresolved owner", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.calendario.proposal("p1"), proposal);
    useCalendarioUi.getState().setProposal({ id: "p1", checked: ["c2", "c3"] });
    const { container } = renderPanel("analitico", qc);
    expect(within(container).getAllByText("Sin responsable").length).toBe(1);
  });

  it("sends the minutes", async () => {
    actions.sendMinutesAction.mockResolvedValue({ ok: true, data: { sent: 3 } });
    renderPanel("esencial");
    fireEvent.click(screen.getByRole("button", { name: "Enviar minuta por correo" }));
    await waitFor(() => expect(actions.sendMinutesAction).toHaveBeenCalledWith("e1"));
  });
});
