// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import type { AgendaWidgetProps } from "@/components/widgets/AgendaWidget";
import type { DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  fetchCalendarAction: vi.fn(),
  syncGoogleCalendarAction: vi.fn(),
  capabilities: { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: true },
  agendaCalls: [] as AgendaWidgetProps[],
  distributionCalls: [] as DistributionWidgetProps[],
  search: "vista=calendario&cal=mes",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ fetchCalendarAction: mocks.fetchCalendarAction }));
vi.mock("@/lib/actions/calendar-actions", () => ({ syncGoogleCalendarAction: mocks.syncGoogleCalendarAction }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s1", name: "Ana Ruiz" } }),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveCalendarCapabilities: () => mocks.capabilities,
}));
vi.mock("@/lib/google/use-google-connect-result", () => ({ useGoogleConnectResult: () => null }));
vi.mock("@/components/calendario/CalendarFeedDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Sincronizar calendario" /> : null),
}));
vi.mock("@/components/tareas/EventDetailPopover", () => ({
  EventDetailPopover: ({ event }: { event: { title: string } }) => (
    <div role="dialog" aria-label="Detalle del evento">
      {event.title}
    </div>
  ),
}));
// Library widgets render their own styles (tested in components/widgets); here they report what they receive.
vi.mock("@/components/widgets/AgendaWidget", () => ({
  AgendaWidget: (props: AgendaWidgetProps) => {
    mocks.agendaCalls.push(props);
    return (
      <section data-testid={`agenda-${props.mode}`} aria-label={props.title}>
        {props.items.map((item) => (
          <a key={item.id} href={item.href}>
            {item.title}
            {item.estimated ? " ≈" : ""}
          </a>
        ))}
      </section>
    );
  },
}));
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: (props: DistributionWidgetProps) => {
    mocks.distributionCalls.push(props);
    return (
      <section aria-label={props.title}>
        {props.segments.map((s) => (
          <span key={s.key}>{`${s.label}: ${s.value}`}</span>
        ))}
      </section>
    );
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { CALENDARIO_DESCRIPTION, TareasCalendario } from "./TareasCalendario";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const TODAY = new Date(2026, 10, 6); // viernes 6 de noviembre de 2026

const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

function task(overrides: Partial<Record<string, unknown>>): TaskListItem {
  return {
    id: "t1",
    title: "Planos ejecutivos",
    kind: "user",
    workflow: { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
    project: { id: "p1", name: "Residencia Valle Alto" },
    manager: { id: "s1", name: "Ana Ruiz" },
    phase: null,
    createdAt: "2026-10-01T09:30:00",
    commitmentDate: "2026-11-06",
    reviewDate: null,
    deliveryDate: "2026-11-06",
    ...overrides,
  } as unknown as TaskListItem;
}

const TASKS: TaskListItem[] = [
  task({}),
  task({
    id: "t2",
    title: "Cotización inicial",
    workflow: { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
    manager: { id: "s2", name: "Luis Pérez" },
    commitmentDate: "2026-11-03",
    deliveryDate: "2026-11-12",
  }),
];

function renderCalendario(
  cal: "mes" | "semana" | "dia",
  style: PresentationStyle = "visual",
  extra: Partial<Parameters<typeof TareasCalendario>[0]> = {}
) {
  mocks.search = `vista=calendario&cal=${cal}`;
  const wrap = (children: ReactNode) => (
    <StyleProvider style={style} scope="staff">
      {children}
    </StyleProvider>
  );
  return render(
    wrap(
      <TareasCalendario
        cal={cal}
        tasks={TASKS}
        tramos={TRAMOS}
        today={TODAY}
        initialRange={{ from: "2026-09-01", to: "2027-01-10" }}
        {...extra}
      />
    )
  );
}

beforeEach(() => {
  mocks.fetchCalendarAction.mockReset().mockResolvedValue(TASKS);
  mocks.syncGoogleCalendarAction.mockReset().mockResolvedValue(undefined);
  mocks.capabilities = { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: true };
  mocks.agendaCalls.length = 0;
  mocks.distributionCalls.length = 0;
});

afterEach(cleanup);

describe("TareasCalendario toolbar", () => {
  it("shows Hoy, the exact prev/next labels, the lowercase month title and the tramo legend", () => {
    renderCalendario("mes");
    expect(screen.getByRole("button", { name: "Hoy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("noviembre de 2026");
    const legend = screen.getByRole("list", { name: "Tramos" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Presale", "Diseño", "Construcción"]);
  });

  it("renders Mes / Semana / Día as links that keep the query and mark the current one", () => {
    renderCalendario("semana");
    const nav = screen.getByRole("navigation", { name: "Vista del calendario" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Mes", "Semana", "Día"]);
    expect(links[0].getAttribute("href")).toBe("/tareas?vista=calendario&cal=mes");
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[0].getAttribute("aria-current")).toBeNull();
  });

  it("moves the month with prev / next and returns with Hoy", () => {
    renderCalendario("mes");
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("diciembre de 2026");
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("octubre de 2026");
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("noviembre de 2026");
  });

  it("uses week and day labels in the other modes", () => {
    renderCalendario("semana");
    expect(screen.getByRole("button", { name: "Semana anterior" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("2 – 8 de noviembre de 2026");
    cleanup();
    renderCalendario("dia");
    expect(screen.getByRole("button", { name: "Día siguiente" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("viernes, 6 de noviembre de 2026");
  });

  it("exports the header description with the ≈ marker", () => {
    expect(CALENDARIO_DESCRIPTION).toBe("Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.");
  });
});

describe("TareasCalendario modes and styles", () => {
  it.each(["visual", "esencial", "analitico"] as const)("Mes passes the same items to AgendaWidget in %s", (style) => {
    renderCalendario("mes", style);
    const main = mocks.agendaCalls.find((c) => c.mode === "month");
    expect(main).toBeTruthy();
    expect(main?.items.map((i) => i.id).sort()).toEqual(
      ["c-diseno-t1-2026-11-06", "e-diseno-t1-2026-11-06", "c-presale-t2-2026-11-03", "e-presale-t2-2026-11-12"].sort()
    );
    expect(main?.groupBy).toBe("day");
  });

  it("marks deliveries as all-day and other times as estimated", () => {
    renderCalendario("mes");
    const main = mocks.agendaCalls.find((c) => c.mode === "month");
    const delivery = main?.items.find((i) => i.id.startsWith("e-"));
    const commitment = main?.items.find((i) => i.id.startsWith("c-"));
    expect(delivery).toMatchObject({ allDay: true, estimated: false });
    expect(commitment).toMatchObject({ allDay: false, estimated: true, tramo: expect.any(String) });
  });

  it("shows the Analítico month extras only in Analítico", () => {
    renderCalendario("mes", "visual");
    expect(screen.queryByRole("heading", { name: "Entregas del mes" })).toBeNull();
    cleanup();
    renderCalendario("mes", "esencial");
    expect(screen.queryByRole("heading", { name: "Entregas del mes" })).toBeNull();
    cleanup();
    renderCalendario("mes", "analitico");
    expect(screen.getByRole("heading", { name: "Entregas del mes" })).toBeTruthy();
    const tramoSummary = mocks.distributionCalls.find((c) => c.title === "Por tramo");
    expect(tramoSummary?.segments.map((s) => [s.key, s.value, s.secondary])).toEqual([
      ["presale", 2, 1],
      ["diseno", 2, 1],
    ]);
  });

  it.each(["visual", "esencial", "analitico"] as const)("Semana renders the week grid from the same data in %s", (style) => {
    renderCalendario("semana", style);
    const week = mocks.agendaCalls.find((c) => c.mode === "week");
    // Nov 2–8: t2 commitment (3rd) and both t1 events (6th); t2's delivery (12th) is next week.
    expect(week?.items).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "Resumen diario" }) !== null).toBe(style === "analitico");
  });

  it("Día renders one timeline with the ≈ times, the now line and the Vence hoy panel in every style", () => {
    for (const style of ["visual", "esencial", "analitico"] as const) {
      renderCalendario("dia", style, { today: new Date() });
      cleanup();
    }
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 6, 10, 42));
    try {
      renderCalendario("dia", "esencial");
      expect(mocks.agendaCalls.some((c) => c.mode === "week" || c.mode === "month")).toBe(false);
      const timeline = screen.getByRole("list", { name: "Eventos" });
      expect(within(timeline).getByRole("button").textContent).toContain("≈09:30");
      expect(screen.getByRole("note", { name: "Ahora, 10:42" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Vence hoy" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TareasCalendario aside", () => {
  it("shows the selected day's agenda, Entregas por semana and the feed dialog", () => {
    renderCalendario("mes");
    const aside = screen.getByRole("complementary", { name: "Agenda del día seleccionado" });
    expect(within(aside).getByText("2 eventos")).toBeTruthy();
    const day = mocks.agendaCalls.find((c) => c.mode === "day");
    expect(day?.title).toBe("viernes 6");
    expect(day?.items).toHaveLength(2);

    const weekly = mocks.distributionCalls.find((c) => c.title === "Entregas por semana");
    expect(weekly?.segments.map((s) => s.value)).toEqual([0, 1, 1, 0, 0, 0]);
    expect(weekly?.extraColumns?.map((c) => c.label)).toEqual(["Presale", "Diseño", "Construcción"]);

    expect(screen.queryByRole("dialog", { name: "Sincronizar calendario" })).toBeNull();
    fireEvent.click(within(aside).getByRole("button", { name: "Sincronizar con Google Calendar" }));
    expect(screen.getByRole("dialog", { name: "Sincronizar calendario" })).toBeTruthy();
  });

  it("opens the event detail and selects its day when an event is clicked", () => {
    renderCalendario("mes");
    const grid = screen.getByTestId("agenda-month");
    fireEvent.click(within(grid).getByText(/Cotización inicial/, { selector: "a[href*='c-presale']" }));
    expect(screen.getByRole("dialog", { name: "Detalle del evento" }).textContent).toBe("Cotización inicial");
    expect(mocks.agendaCalls.at(-1)?.title).toBe("martes 3");
  });
});

describe("TareasCalendario data", () => {
  it("does not fetch while the visible range is inside the loaded one and fetches beyond it", async () => {
    renderCalendario("mes");
    expect(mocks.fetchCalendarAction).not.toHaveBeenCalled();
    // Diciembre's grid (Nov 30 – Jan 3) is still loaded; enero's (Dec 28 – Jan 31) is not.
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(mocks.fetchCalendarAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await act(async () => {});
    expect(mocks.fetchCalendarAction).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCalendarAction).toHaveBeenCalledWith("2026-11-13", "2027-03-17", {});
  });

  it("shows only the viewer's events without the team calendar", () => {
    mocks.capabilities = { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: false };
    renderCalendario("mes");
    const main = mocks.agendaCalls.find((c) => c.mode === "month");
    expect(main?.items.every((i) => i.attendees?.[0] === "Ana Ruiz")).toBe(true);
    expect(main?.items).toHaveLength(2);
  });

  it("renders the permission copy without calendar access", () => {
    mocks.capabilities = { canViewCalendar: false, canViewDailyAgenda: false, canViewTeamCalendar: false };
    renderCalendario("mes");
    expect(screen.getByText("No tienes permiso para ver el calendario.")).toBeTruthy();
    expect(mocks.agendaCalls).toHaveLength(0);
  });
});
