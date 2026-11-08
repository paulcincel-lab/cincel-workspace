// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { AgendaWidgetProps } from "@/components/widgets/AgendaWidget";
import type { DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  getTareasCalendarData: vi.fn(),
  syncGoogleCalendarAction: vi.fn(),
  capabilities: { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: true },
  agendaCalls: [] as AgendaWidgetProps[],
  distributionCalls: [] as DistributionWidgetProps[],
  /** `useSearchParams` subscribers, notified on `history.replaceState` (as Next does). */
  listeners: new Set<() => void>(),
}));

// `useSearchParams` follows `window.location`, and `history.replaceState` re-renders its readers.
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => "/tareas",
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => window.location.search
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
    useRouter: () => {
      throw new Error("the calendar never uses the router");
    },
  };
});
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasCalendarData: mocks.getTareasCalendarData,
  getTareasStartSlotData: vi.fn(),
}));
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
import { calendarFetchRange } from "@/lib/calendar/calendar-agenda";
import { qk, type TareasListFilters } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { selectSelectedDay, useTareasUi } from "@/lib/stores/tareas-ui-store";
import { CALENDAR_AUTO_SYNC_KEY } from "@/lib/tareas/calendar-auto-sync";
import { parseTareasQuery } from "@/lib/tareas/query";
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

const NO_FILTERS: TareasListFilters = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };

const realReplaceState = window.history.replaceState.bind(window.history);

/** Puts `/tareas?<search>` in the address bar without counting it as a calendar write. */
function setUrl(search: string) {
  realReplaceState(null, "", `/tareas?${search}`);
  for (const listener of mocks.listeners) listener();
}

const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
  realReplaceState(...args);
  for (const listener of mocks.listeners) listener();
});

/** The `/tareas` query in the address bar. */
const urlQuery = () => parseTareasQuery(new URLSearchParams(window.location.search));

/**
 * Renders the view for `cal` on the current URL (or `search`). The first range
 * is already cached, as after the page prefetch; other ranges go through
 * `getTareasCalendarData`.
 */
function renderCalendario(
  cal: "mes" | "semana" | "dia",
  style: PresentationStyle = "visual",
  extra: Partial<Parameters<typeof TareasCalendario>[0]> = {},
  opts: { search?: string; client?: QueryClient } = {}
) {
  setUrl(opts.search ?? `vista=calendario&cal=${cal}`);
  const client = opts.client ?? createTestQueryClient();
  const fecha = urlQuery().fecha;
  const today = extra.today ?? TODAY;
  const cursor = fecha ? new Date(`${fecha}T00:00:00`) : today;
  const range = calendarFetchRange(cal, cursor);
  if (!client.getQueryData(qk.tareas.calendar(NO_FILTERS, range.from, range.to))) {
    client.setQueryData(qk.tareas.calendar(NO_FILTERS, range.from, range.to), TASKS);
  }
  const wrap = (children: ReactNode) => (
    <StyleProvider style={style} scope="staff">
      {children}
    </StyleProvider>
  );
  replaceState.mockClear();
  return renderWithQueryClient(wrap(<TareasCalendario tramos={TRAMOS} today={TODAY} {...extra} />), { client });
}

beforeEach(() => {
  mocks.getTareasCalendarData.mockReset().mockResolvedValue(TASKS);
  mocks.syncGoogleCalendarAction.mockReset().mockResolvedValue(null);
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
  it("reads one range per new month and none for a cached one, with no fetch on mount", async () => {
    renderCalendario("mes");
    expect(mocks.getTareasCalendarData).not.toHaveBeenCalled();

    // Diciembre's grid (Nov 30 – Jan 3) is a new key.
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(mocks.getTareasCalendarData).toHaveBeenCalledTimes(1));
    expect(mocks.getTareasCalendarData).toHaveBeenCalledWith({ filters: NO_FILTERS, from: "2026-11-30", to: "2027-01-03" });

    // Back to noviembre: cached and fresh, no call.
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await act(async () => {});
    expect(mocks.getTareasCalendarData).toHaveBeenCalledTimes(1);
  });

  it("puts the URL filters in the key", async () => {
    renderCalendario("mes", "visual", {}, { search: "vista=calendario&cal=mes&tramo=diseno&responsable=yo&q=planos" });
    await waitFor(() => expect(mocks.getTareasCalendarData).toHaveBeenCalledTimes(1));
    expect(mocks.getTareasCalendarData).toHaveBeenCalledWith({
      filters: { ...NO_FILTERS, tramo: "diseno", responsable: "yo", q: "planos" },
      from: "2026-10-26",
      to: "2026-12-06",
    });
  });

  it("shows only the viewer's events without the team calendar", () => {
    mocks.capabilities = { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: false };
    renderCalendario("mes");
    const main = mocks.agendaCalls.find((c) => c.mode === "month");
    expect(main?.items.every((i) => i.attendees?.[0] === "Ana Ruiz")).toBe(true);
    expect(main?.items).toHaveLength(2);
  });

  it("renders the permission copy without calendar access, and neither reads nor syncs", async () => {
    mocks.capabilities = { canViewCalendar: false, canViewDailyAgenda: false, canViewTeamCalendar: false };
    renderCalendario("mes", "visual", {}, { client: createTestQueryClient() });
    expect(screen.getByText("No tienes permiso para ver el calendario.")).toBeTruthy();
    expect(mocks.agendaCalls).toHaveLength(0);
    await act(async () => {});
    expect(mocks.syncGoogleCalendarAction).not.toHaveBeenCalled();
  });

  it("shows the error copy when a range fails to load", async () => {
    mocks.getTareasCalendarData.mockRejectedValue(new Error("boom"));
    renderCalendario("mes");
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(await screen.findByText(/No se pudo sincronizar el calendario con el servidor/)).toBeTruthy();
  });
});

describe("TareasCalendario URL and selected day", () => {
  it("writes the cursor to ?fecha with history.replaceState and reads it back after a reload", () => {
    const { unmount } = renderCalendario("mes");
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(urlQuery()).toMatchObject({ vista: "calendario", cal: "mes", fecha: "2026-12-01" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("diciembre de 2026");

    // Reload: a fresh mount on the same URL opens on diciembre.
    unmount();
    renderCalendario("mes", "visual", {}, { search: window.location.search.slice(1) });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("diciembre de 2026");

    // Hoy drops ?fecha.
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(urlQuery().fecha).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("noviembre de 2026");
  });

  it("opens on the ?fecha day (back / forward restore the URL, the view follows it)", () => {
    renderCalendario("semana", "visual", {}, { search: "vista=calendario&cal=semana&fecha=2026-11-18" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("16 – 22 de noviembre de 2026");
    // A history move changes the URL under the mounted view.
    act(() => setUrl("vista=calendario&cal=semana&fecha=2026-11-04"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("2 – 8 de noviembre de 2026");
  });

  it("changes the mode on the URL without a navigation, Día opening on the selected day", () => {
    renderCalendario("mes");
    const grid = screen.getByTestId("agenda-month");
    fireEvent.click(within(grid).getByText(/Cotización inicial/, { selector: "a[href*='c-presale']" }));
    const nav = screen.getByRole("navigation", { name: "Vista del calendario" });
    fireEvent.click(within(nav).getByRole("link", { name: "Día" }));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(urlQuery()).toMatchObject({ cal: "dia", fecha: "2026-11-03" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("martes, 3 de noviembre de 2026");
  });

  it("keeps the selected day in the store across a switch to Lista and back", () => {
    const { unmount } = renderCalendario("mes");
    const grid = screen.getByTestId("agenda-month");
    fireEvent.click(within(grid).getByText(/Cotización inicial/, { selector: "a[href*='c-presale']" }));
    expect(selectSelectedDay(useTareasUi.getState())).toBe("2026-11-03");

    unmount(); // vista=lista
    mocks.agendaCalls.length = 0;
    renderCalendario("mes");
    expect(mocks.agendaCalls.find((c) => c.mode === "day")?.title).toBe("martes 3");
  });

  it("clears the selected day when ?fecha moves the view past it", () => {
    renderCalendario("mes");
    const grid = screen.getByTestId("agenda-month");
    fireEvent.click(within(grid).getByText(/Cotización inicial/, { selector: "a[href*='c-presale']" }));
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(selectSelectedDay(useTareasUi.getState())).toBeNull();
    // Without a stored day the aside shows the ?fecha day.
    expect(mocks.agendaCalls.at(-1)?.title).toBe("martes 1");
  });
});

describe("TareasCalendario Google auto-sync", () => {
  it("runs once per browser session, as a mutation, however often the calendar mounts", async () => {
    const first = renderCalendario("mes");
    await waitFor(() => expect(mocks.syncGoogleCalendarAction).toHaveBeenCalledTimes(1));
    expect(mocks.syncGoogleCalendarAction).toHaveBeenCalledWith({ auto: true });
    expect(window.sessionStorage.getItem(CALENDAR_AUTO_SYNC_KEY)).toBe("1");

    first.unmount();
    renderCalendario("mes");
    await act(async () => {});
    expect(mocks.syncGoogleCalendarAction).toHaveBeenCalledTimes(1);
  });

  it("refreshes the calendar after a sync that ran, not after a skipped one", async () => {
    mocks.syncGoogleCalendarAction.mockResolvedValue({ ok: true, result: {} });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderCalendario("mes", "visual", {}, { client });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tareas", "calendar"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.ajustes.page("integraciones") });
  });

  it("does nothing more when the server skips the sync (null)", async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderCalendario("mes", "visual", {}, { client });
    await waitFor(() => expect(mocks.syncGoogleCalendarAction).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("skips a session that already synced (a reload in the same tab)", async () => {
    window.sessionStorage.setItem(CALENDAR_AUTO_SYNC_KEY, "1");
    renderCalendario("mes");
    await act(async () => {});
    expect(mocks.syncGoogleCalendarAction).not.toHaveBeenCalled();
  });
});
