// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

import type { RecordTableData } from "@/lib/types/widgets";

const actions = vi.hoisted(() => ({ cancelVacationRequestAction: vi.fn() }));
const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchMyVacationsAction: true,
    requestVacationAction: true,
    cancelVacationRequestAction: true,
    fetchPendingVacationRequestsAction: true,
    decideVacationAction: true,
    fetchTeamAbsencesAction: true,
    fetchVacationSettingsAction: true,
    saveVacationSettingsAction: true,
  },
}));
vi.mock("@/lib/actions/vacations-actions", () => actions);
vi.mock("@/lib/actions/vacations-actions.flags", () => flags);
const pageData = vi.hoisted(() => ({ getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => pageData);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: (props: { title: string; children: ReactNode }) => (
    <section aria-label={props.title}>{props.children}</section>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: (props: {
    data: RecordTableData;
    renderCell?: (key: string, row: Record<string, unknown>) => ReactNode | undefined;
  }) => (
    <table>
      <thead>
        <tr>
          {props.data.columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.data.rows.map((row) => (
          <tr key={String(row.id)} data-testid={String(row.id)}>
            {props.data.columns.map((c) => (
              <td key={c.key}>{props.renderCell?.(c.key, row) ?? String(row[c.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (props: {
    title: string;
    open: boolean;
    onSubmit(): Promise<void>;
    submitLabel: string;
    error?: string | null;
    children: ReactNode;
  }) =>
    props.open ? (
      <div role="dialog" aria-label={props.title}>
        {props.children}
        {props.error ? <div role="alert">{props.error}</div> : null}
        <button type="button" onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { MyVacations } from "@/lib/vacations/reads";

import { VacationHistory } from "./VacationHistory";
import {
  APPROVED_FUTURE,
  APPROVED_PAST,
  PENDING_FUTURE,
  REJECTED,
  REQUESTS,
  misVacacionesData,
  seededVacacionesClient,
} from "./vacaciones.fixtures";

function renderHistory() {
  const client = seededVacacionesClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(<VacationHistory requests={REQUESTS} />, { client });
  return { ...view, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.IMPLEMENTED.cancelVacationRequestAction = true;
  pageData.getMisVacacionesPageData.mockResolvedValue(misVacacionesData());
});

afterEach(() => {
  cleanup();
});

function row(id: string) {
  return within(screen.getByTestId(id));
}

describe("VacationHistory", () => {
  it("lists every request with its status, kind and work days", () => {
    renderHistory();

    expect(row(PENDING_FUTURE.id).getByText("Pendiente")).toBeTruthy();
    expect(row(PENDING_FUTURE.id).getByText("14 – 18 dic")).toBeTruthy();
    expect(row(PENDING_FUTURE.id).getByText("5")).toBeTruthy();
    expect(row(APPROVED_PAST.id).getByText("Día personal")).toBeTruthy();
    expect(row(REJECTED.id).getByText("Rechazada")).toBeTruthy();
  });

  it("offers Cancelar only for pending requests and approved ones still in the future", () => {
    renderHistory();

    expect(row(PENDING_FUTURE.id).queryByRole("button", { name: /Cancelar/ })).toBeTruthy();
    expect(row(APPROVED_FUTURE.id).queryByRole("button", { name: /Cancelar/ })).toBeTruthy();
    expect(row(APPROVED_PAST.id).queryByRole("button", { name: /Cancelar/ })).toBeNull();
    expect(row(REJECTED.id).queryByRole("button", { name: /Cancelar/ })).toBeNull();
  });

  it("cancels a pending request after confirming and invalidates the vacation keys", async () => {
    actions.cancelVacationRequestAction.mockResolvedValue({ ok: true, data: null });
    const { client, invalidate } = renderHistory();

    fireEvent.click(row(PENDING_FUTURE.id).getByRole("button", { name: /Cancelar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));

    await waitFor(() => expect(actions.cancelVacationRequestAction).toHaveBeenCalledWith(PENDING_FUTURE.id));
    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
        qk.me.vacations(),
        ["vacations", "absences"],
        qk.vacations.pending(),
      ]),
    );
    expect(client.getQueryData<MyVacations>(qk.me.vacations())).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the STARTED copy when an approved request already started", async () => {
    actions.cancelVacationRequestAction.mockResolvedValue({ ok: false, error: "STARTED: req-approved-future" });
    const { client } = renderHistory();

    fireEvent.click(row(APPROVED_FUTURE.id).getByRole("button", { name: /Cancelar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó.",
    );
    expect(client.getQueryData<MyVacations>(qk.me.vacations())?.requests.find((r) => r.id === APPROVED_FUTURE.id)?.status).toBe(
      "aprobada",
    );
  });

  it("hides cancel while cancelVacationRequestAction is not implemented", () => {
    flags.IMPLEMENTED.cancelVacationRequestAction = false;
    renderHistory();

    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
    expect(screen.queryByText("Acciones")).toBeNull();
  });
});
