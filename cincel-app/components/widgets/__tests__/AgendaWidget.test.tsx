// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  AGENDA_CUTTO_LABEL,
  AGENDA_EMPTY_TEXT,
  AGENDA_MEET_LABEL,
  AGENDA_ONLY_CINCEL_LABEL,
  AgendaWidget,
  agendaHeat,
  agendaRange,
  agendaTableData,
  formatAgendaDuration,
  localDayKey,
  toAgendaEntries,
  type AgendaWidgetProps,
} from "@/components/widgets/AgendaWidget";
import { agendaEmptyFixture, agendaFixture, agendaFixtureDayCounts } from "@/components/widgets/fixtures/agenda";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const TITLES = agendaFixture.items.map((item) => item.title);

function renderWidget(style: PresentationStyle, props: Partial<AgendaWidgetProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <AgendaWidget
        title={agendaFixture.title}
        items={agendaFixture.items}
        mode="week"
        anchorDate={agendaFixture.anchorDate}
        {...props}
      />
    </StyleProvider>,
  );
}

function region() {
  return screen.getByRole("region", { name: agendaFixture.title });
}

/** Non-zero `data-count` per `data-day` the rendered style exposes. */
function dayCounts(container: HTMLElement, selector = "[data-day][data-count]"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of Array.from(container.querySelectorAll(selector))) {
    const count = Number(node.getAttribute("data-count"));
    if (count > 0) counts[node.getAttribute("data-day") as string] = count;
  }
  return counts;
}

afterEach(() => {
  cleanup();
});

describe("AgendaWidget · Visual", () => {
  it("week: time grid 8:00–19:00 with an all-day row and tinted blocks", () => {
    const { container } = renderWidget("visual");
    const widget = container.querySelector('[data-slot="agenda-widget"]') as HTMLElement;
    expect(widget.getAttribute("data-style")).toBe("visual");
    expect(widget.getAttribute("data-mode")).toBe("week");
    expect(container.querySelector("table")).toBeNull();

    expect(dayCounts(container)).toEqual(agendaFixtureDayCounts);
    expect(container.querySelectorAll('[data-slot="agenda-event"]')).toHaveLength(agendaFixture.items.length);
    for (const title of TITLES) expect(within(region()).getByText(title)).toBeTruthy();

    const allDay = container.querySelector('[data-slot="agenda-all-day-row"]') as HTMLElement;
    expect(allDay.querySelector('[data-event-id="ev-render"]')).not.toBeNull();
    expect(allDay.querySelector('[data-event-id="ev-planos"]')).toBeNull();

    expect(widget.textContent).toContain("08:00");
    expect(widget.textContent).toContain("18:00");

    const planos = container.querySelector('[data-event-id="ev-planos"]') as HTMLElement;
    expect(planos.style.top).toBe("48px");
    expect(planos.style.height).toBe("72px");
    expect(planos.className).toContain("border-l-3");
    expect(planos.className).toContain("var(--chart-2)");
    expect(planos.textContent).toContain("09:00–10:30");

    const junta = container.querySelector('[data-event-id="ev-junta"]') as HTMLElement;
    expect(junta.className).toContain("bg-muted");

    expect(screen.getByText("≈16:00–16:30")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Revisión de planos" }).getAttribute("href")).toBe("/tareas?tarea=t-planos");
  });

  it("day: tinted time blocks of the anchor day only", () => {
    const { container } = renderWidget("visual", { mode: "day" });
    const widget = container.querySelector('[data-slot="agenda-widget"]') as HTMLElement;
    expect(widget.getAttribute("data-mode")).toBe("day");
    expect(dayCounts(container)).toEqual({ "2026-11-09": 3 });
    const ids = Array.from(container.querySelectorAll('[data-slot="agenda-event"]')).map((n) => n.getAttribute("data-event-id"));
    expect(ids).toEqual(["ev-render", "ev-planos", "ev-obra"]);
    expect(widget.textContent).toContain("lunes, 9 de noviembre · 3 eventos");
    expect(screen.queryByText("Llamada con cliente")).toBeNull();
  });

  it("month: month grid with tinted blocks and “+n más”", () => {
    const busy = Array.from({ length: 4 }, (_, i) => ({
      id: `extra-${i}`,
      title: `Pendiente ${i + 1}`,
      start: `2026-11-09T${String(15 + i).padStart(2, "0")}:00:00`,
      tramo: "presale",
    }));
    const { container } = renderWidget("visual", { mode: "month", items: [...agendaFixture.items, ...busy] });
    const widget = container.querySelector('[data-slot="agenda-widget"]') as HTMLElement;
    expect(widget.getAttribute("data-mode")).toBe("month");
    expect(widget.textContent).toContain("noviembre de 2026");
    expect(container.querySelectorAll("[data-day]").length % 7).toBe(0);

    const monday = container.querySelector('[data-day="2026-11-09"]') as HTMLElement;
    expect(monday.getAttribute("data-count")).toBe("7");
    expect(monday.querySelectorAll('[data-slot="agenda-event"]')).toHaveLength(3);
    expect(within(monday).getByText("+4 más")).toBeTruthy();
    expect(container.querySelector('[data-day="2026-10-26"]')?.getAttribute("data-outside")).toBe("true");
  });
});

describe("AgendaWidget · Esencial", () => {
  it("list grouped by day, plain text, no grid or table", () => {
    const { container } = renderWidget("esencial");
    const widget = container.querySelector('[data-slot="agenda-widget"]') as HTMLElement;
    expect(widget.getAttribute("data-style")).toBe("esencial");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-slot="agenda-all-day-row"]')).toBeNull();

    expect(dayCounts(container)).toEqual(agendaFixtureDayCounts);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "lunes, 9 de noviembre · 3 eventos",
      "miércoles, 11 de noviembre · 1 evento",
      "viernes, 13 de noviembre · 1 evento",
    ]);
    for (const title of TITLES) expect(within(region()).getByText(title)).toBeTruthy();
    expect(screen.getByText("Todo el día")).toBeTruthy();
    expect(screen.getByText("≈16:00–16:30")).toBeTruthy();
    expect(screen.getByText("Casa Lomas · Diseño · 2 asistentes")).toBeTruthy();
  });

  it("groupBy none: one flat list with the date in each row", () => {
    const { container } = renderWidget("esencial", { groupBy: "none" });
    expect(container.querySelectorAll("section")).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="agenda-event"]')).toHaveLength(agendaFixture.items.length);
    expect(container.textContent).toContain("viernes, 13 de noviembre · 10:00–11:00");
  });
});

describe("AgendaWidget · Analítico", () => {
  it("RecordTable with daily subtotals and a total row", () => {
    const { container } = renderWidget("analitico");
    const widget = container.querySelector('[data-slot="agenda-widget"]') as HTMLElement;
    expect(widget.getAttribute("data-style")).toBe("analitico");
    const table = within(widget).getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
    expect(headers).toEqual(["Día", "Hora", "Duración", "Evento", "Proyecto", "Tramo", "Asistentes"]);

    expect(dayCounts(container, '[data-slot="agenda-subtotal"]')).toEqual(agendaFixtureDayCounts);
    const subtotalMonday = container.querySelector('[data-slot="agenda-subtotal"][data-day="2026-11-09"]') as HTMLElement;
    const mondayRow = subtotalMonday.closest("tr") as HTMLElement;
    expect(mondayRow.textContent).toContain("Subtotal lun. 9");
    expect(mondayRow.textContent).toContain("3 h 30 min");

    const total = container.querySelector('[data-slot="agenda-total"]') as HTMLElement;
    expect(total.getAttribute("data-count")).toBe("5");
    const totalRow = total.closest("tr") as HTMLElement;
    expect(totalRow.textContent).toContain("5 eventos");
    expect(totalRow.textContent).toContain("5 h");
    expect(totalRow.textContent).toContain("6");

    for (const title of TITLES) expect(within(table).getByText(title)).toBeTruthy();
    expect(within(table).getByText("≈16:00–16:30")).toBeTruthy();
  });

  it("month: load heat table above the events table", () => {
    const { container } = renderWidget("analitico", { mode: "month" });
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "Carga por día · noviembre de 2026" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Eventos del mes" })).toBeTruthy();

    const load = (day: string) => container.querySelector(`[data-slot="agenda-load-cell"][data-day="${day}"]`) as HTMLElement;
    expect(load("2026-11-09").textContent).toBe("3");
    expect(load("2026-11-09").getAttribute("data-heat")).toBe("crit");
    expect(load("2026-11-11").getAttribute("data-heat")).toBe("none");
    expect(load("2026-11-10").textContent).toBe("0");
    expect(load("2026-10-26")).toBeNull();
    expect(dayCounts(container, '[data-slot="agenda-load-cell"]')).toEqual(agendaFixtureDayCounts);
    expect(dayCounts(container, '[data-slot="agenda-subtotal"]')).toEqual(agendaFixtureDayCounts);
  });

  it("groupBy none: no subtotal rows", () => {
    const { container } = renderWidget("analitico", { groupBy: "none" });
    expect(container.querySelectorAll('[data-slot="agenda-subtotal"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="agenda-total"]')).toHaveLength(1);
  });
});

describe("AgendaWidget · every style", () => {
  it("renders the same numbers and only the chosen style", () => {
    for (const style of STYLES) {
      const selector = style === "analitico" ? '[data-slot="agenda-subtotal"]' : "[data-day][data-count]";
      const { container, unmount } = renderWidget(style);
      const styles = new Set(Array.from(container.querySelectorAll("[data-style]")).map((n) => n.getAttribute("data-style")));
      expect([...styles]).toEqual([style]);
      expect(dayCounts(container, selector)).toEqual(agendaFixtureDayCounts);
      for (const title of TITLES) expect(within(region()).getByText(title)).toBeTruthy();
      unmount();
    }
  });

  it("renders “Abrir en Cutto” only for the item that has a meetingUrl", () => {
    for (const style of STYLES) {
      const { unmount } = renderWidget(style);
      const links = screen.getAllByRole("link", { name: new RegExp(AGENDA_CUTTO_LABEL) });
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe("https://cutto.example.com/reuniones/r-planos");
      expect(links[0].getAttribute("target")).toBe("_blank");
      expect(links[0].getAttribute("rel")).toContain("noopener");
      expect(links[0].getAttribute("aria-label")).toBe(`${AGENDA_CUTTO_LABEL}: Revisión de planos`);
      unmount();
    }
  });

  it("renders the Meet link (first), the Cutto link and the Cincel-only origin per Estilo", () => {
    const day = agendaFixture.anchorDate;
    const items = [
      { id: "m-meet", title: "Reunión con Meet", start: `${day}T09:00:00`, meetUrl: "https://meet.example.com/abc", href: "/calendario?evento=e:m-meet" },
      { id: "m-both", title: "Reunión con ambos", start: `${day}T10:00:00`, meetUrl: "https://meet.example.com/def", meetingUrl: "https://cutto.example.com/r/1" },
      { id: "m-local", title: "Reunión local", start: `${day}T11:00:00`, onlyInCincel: true, meetUrl: "https://meet.example.com/x" },
    ];
    for (const style of STYLES) {
      const { unmount } = renderWidget(style, { items });
      const meet = screen.getAllByRole("link", { name: new RegExp(AGENDA_MEET_LABEL) });
      expect(meet).toHaveLength(2);
      expect(meet[0].getAttribute("href")).toBe("https://meet.example.com/abc");
      expect(meet[0].getAttribute("target")).toBe("_blank");
      expect(meet[0].getAttribute("rel")).toBe("noopener noreferrer");
      expect(screen.getAllByRole("link", { name: new RegExp(AGENDA_CUTTO_LABEL) })).toHaveLength(1);
      expect(screen.getAllByText(AGENDA_ONLY_CINCEL_LABEL)).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Reunión con Meet" }).getAttribute("href")).toBe("/calendario?evento=e:m-meet");
      unmount();
    }
  });

  it("drops items outside the visible range", () => {
    const later = { id: "ev-later", title: "Entrega final", start: "2026-11-20T10:00:00" };
    for (const style of STYLES) {
      const { unmount } = renderWidget(style, { items: [...agendaFixture.items, later] });
      expect(screen.queryByText("Entrega final")).toBeNull();
      unmount();
    }
  });

  it("anchors on the earliest item when no anchorDate is given", () => {
    const { container } = renderWidget("esencial", { anchorDate: undefined });
    expect(dayCounts(container)).toEqual(agendaFixtureDayCounts);
  });

  it("renders the empty state through emptyText / emptyState", () => {
    for (const style of STYLES) {
      const first = renderWidget(style, { items: agendaEmptyFixture.items });
      expect(within(region()).getByText(AGENDA_EMPTY_TEXT)).toBeTruthy();
      expect(first.container.querySelector('[data-slot="agenda-widget"]')).toBeNull();
      first.unmount();

      const custom = renderWidget(style, { items: [], emptyText: "Sin reuniones hoy" });
      expect(within(region()).getByText("Sin reuniones hoy")).toBeTruthy();
      custom.unmount();

      const full = renderWidget(style, {
        items: [],
        emptyText: "ignorado",
        emptyState: { title: "Agenda libre", description: "No hay eventos esta semana." },
      });
      expect(within(region()).getByText("Agenda libre")).toBeTruthy();
      expect(screen.queryByText("ignorado")).toBeNull();
      full.unmount();
    }
  });

  it("renders the LoadingSkeleton variant of the style while loading", () => {
    const expected: Record<PresentationStyle, string> = { visual: "calendar", esencial: "list", analitico: "table" };
    for (const style of STYLES) {
      const { container, unmount } = renderWidget(style, { loading: true });
      expect(region().getAttribute("aria-busy")).toBe("true");
      expect(container.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe(expected[style]);
      expect(container.querySelector('[data-slot="agenda-widget"]')).toBeNull();
      unmount();
    }
    const day = renderWidget("visual", { loading: true, mode: "day" });
    expect(day.container.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe("list");
  });
});

describe("AgendaWidget helpers", () => {
  it("formats durations", () => {
    expect(formatAgendaDuration(90)).toBe("1 h 30 min");
    expect(formatAgendaDuration(120)).toBe("2 h");
    expect(formatAgendaDuration(45)).toBe("45 min");
    expect(formatAgendaDuration(null)).toBe("—");
  });

  it("shades load above 45 % / 60 % of the busiest day", () => {
    expect(agendaHeat(0, 4)).toBe("none");
    expect(agendaHeat(1, 4)).toBe("none");
    expect(agendaHeat(2, 4)).toBe("warn");
    expect(agendaHeat(3, 4)).toBe("crit");
    expect(agendaHeat(1, 0)).toBe("none");
  });

  it("builds Monday-first week and whole-month ranges", () => {
    const week = agendaRange("week", new Date(2026, 10, 12));
    expect([week.fromKey, week.toKey]).toEqual(["2026-11-09", "2026-11-15"]);
    const month = agendaRange("month", new Date(2026, 10, 12));
    expect([month.fromKey, month.toKey]).toEqual(["2026-11-01", "2026-11-30"]);
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("parses date-only starts as all-day and sorts all-day first", () => {
    const entries = toAgendaEntries(agendaFixture.items);
    expect(entries.map((e) => e.item.id)).toEqual(["ev-render", "ev-planos", "ev-obra", "ev-cliente", "ev-junta"]);
    expect(entries[0].allDay).toBe(true);
    expect(entries[1].minutes).toBe(90);
    expect(toAgendaEntries([{ id: "x", title: "x", start: "no es fecha" }])).toEqual([]);
  });

  it("table data keeps the same counts as the fixture", () => {
    const data = agendaTableData(toAgendaEntries(agendaFixture.items));
    const subtotals = data.rows.filter((r) => r.kind === "subtotal");
    expect(Object.fromEntries(subtotals.map((r) => [r.dayKey, r.count]))).toEqual(agendaFixtureDayCounts);
    expect(data.rows.at(-1)?.kind).toBe("total");
  });
});
