// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

import type { VacationRequest } from "@/lib/types/redesign";
import type { AgendaItem, KpiDatum, RecordTableData } from "@/lib/types/widgets";

const actions = vi.hoisted(() => ({
  requestVacationAction: vi.fn(),
  cancelVacationRequestAction: vi.fn(),
}));
const pageData = vi.hoisted(() => ({ getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => pageData);
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/widgets/KpiWidget", () => ({
  KpiWidget: (props: { items: KpiDatum[] }) => (
    <dl>
      {props.items.map((item) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          <dt>{item.label}</dt>
          <dd>{item.display ?? String(item.value)}</dd>
        </div>
      ))}
    </dl>
  ),
}));
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
vi.mock("@/components/widgets/AgendaWidget", () => ({
  AgendaWidget: (props: { title: string; items: AgendaItem[] }) => (
    <section aria-label={props.title}>
      {props.items.map((item) => (
        <p key={item.id}>{item.title}</p>
      ))}
    </section>
  ),
}));
vi.mock("@/components/patterns/FormSheet", async () => ({ FormSheet: (await import("./form-shell.test-double")).FormShellDouble }));
vi.mock("@/components/patterns/FormDialog", async () => ({ FormDialog: (await import("./form-shell.test-double")).FormShellDouble }));

import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { MisVacacionesPageData } from "@/lib/loaders/biblioteca";

import { MisVacacionesClient } from "./MisVacacionesClient";
import { DOCUMENTS, PENDING_FUTURE, REQUESTS, misVacacionesData, seededVacacionesClient } from "./vacaciones.fixtures";

const CREATED: VacationRequest = {
  id: "new",
  from: "2099-11-02",
  to: "2099-11-03",
  kind: "vacaciones",
  comment: "",
  status: "pendiente",
};

/** The client part of the page, its queries seeded as the server page leaves them. */
function renderPage(overrides: Partial<MisVacacionesPageData> = {}) {
  return renderWithQueryClient(<MisVacacionesClient month="2026-11" year={2026} />, {
    client: seededVacacionesClient(overrides),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(flags.IMPLEMENTED) as (keyof typeof flags.IMPLEMENTED)[]) {
    flags.IMPLEMENTED[key] = true;
  }
});

afterEach(() => {
  cleanup();
});

describe("MisVacacionesClient", () => {
  it("renders the balance, history, team strip and the mis-vacaciones documents", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Mis vacaciones" })).toBeTruthy();
    expect(within(screen.getByTestId("kpi-disponibles")).getByText("9 de 20")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Historial" })).toBeTruthy();
    expect(screen.getByText("Juan Pérez · Ausencia")).toBeTruthy();
    const docs = screen.getByRole("region", { name: "Documentos" });
    const link = within(docs).getByRole("link", { name: "Formato de solicitud de vacaciones" });
    expect(link.getAttribute("href")).toBe(DOCUMENTS[0].url);
  });

  it("refetches the balance after a request with one page-data call, no hand-written reload", async () => {
    actions.requestVacationAction.mockResolvedValue({ ok: true, data: CREATED });
    pageData.getMisVacacionesPageData.mockResolvedValue(
      misVacacionesData({ mine: { balance: { entitled: 20, taken: 6, pending: 7, available: 7 }, requests: [CREATED, ...REQUESTS] } }),
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Nueva solicitud/ }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: CREATED.from } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: CREATED.to } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(within(screen.getByTestId("kpi-disponibles")).getByText("7 de 20")).toBeTruthy());
    expect(within(screen.getByTestId("kpi-pendientes")).getByText("7")).toBeTruthy();
    expect(screen.getByTestId("new")).toBeTruthy();
    // me.vacations, the absences and the pending list refetch through one shared call.
    expect(pageData.getMisVacacionesPageData).toHaveBeenCalledTimes(1);
    expect(pageData.getMisVacacionesPageData).toHaveBeenCalledWith({ month: "2026-11" });
  });

  it("refetches the balance after a cancel", async () => {
    actions.cancelVacationRequestAction.mockResolvedValue({ ok: true, data: null });
    pageData.getMisVacacionesPageData.mockResolvedValue(
      misVacacionesData({
        mine: {
          balance: { entitled: 20, taken: 6, pending: 0, available: 14 },
          requests: REQUESTS.map((r) => (r.id === PENDING_FUTURE.id ? { ...r, status: "cancelada" as const } : r)),
        },
      }),
    );
    renderPage();

    fireEvent.click(within(screen.getByTestId(PENDING_FUTURE.id)).getByRole("button", { name: /Cancelar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));

    await waitFor(() => expect(within(screen.getByTestId("kpi-disponibles")).getByText("14 de 20")).toBeTruthy());
    expect(within(screen.getByTestId(PENDING_FUTURE.id)).getByText("Cancelada")).toBeTruthy();
  });

  it("hides the request entry point while requestVacationAction is not implemented", () => {
    flags.IMPLEMENTED.requestVacationAction = false;
    flags.IMPLEMENTED.cancelVacationRequestAction = false;
    renderPage();

    expect(screen.queryByRole("button", { name: /Nueva solicitud/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
  });

  it("hides balance, history and the strip while their reads are stubs, keeping the documents", () => {
    renderPage({ mine: null, absences: null });

    expect(screen.queryByTestId("kpi-disponibles")).toBeNull();
    expect(screen.queryByRole("region", { name: "Historial" })).toBeNull();
    expect(screen.queryByRole("region", { name: /Quién está fuera/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nueva solicitud/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Documentos" })).toBeTruthy();
  });
});
