// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  PEOPLE_EMPTY_TEXT,
  PeopleWidget,
  availabilitySentence,
  buildAvailabilityTable,
  buildPeopleTable,
  loadPercent,
  loadTone,
  type PeopleShow,
} from "@/components/widgets/PeopleWidget";
import {
  PEOPLE_AVAILABILITY_SENTENCES,
  PEOPLE_AVERAGES,
  PEOPLE_FIXTURE,
} from "@/components/widgets/fixtures/people";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: (props: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{props.title}</p>
      {props.description ? <p>{props.description}</p> : null}
    </div>
  ),
}));

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: (props: { variant: string; rows?: number }) => (
    <div data-testid="loading-skeleton" data-variant={props.variant} data-rows={props.rows} />
  ),
}));

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

afterEach(cleanup);

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const ALL: PeopleShow[] = ["load", "hours", "availability", "projects"];

function renderIn(style: PresentationStyle, ui: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>
  );
}

function text(el: HTMLElement) {
  return (el.textContent ?? "").replace(/\s+/g, " ");
}

describe("PeopleWidget per style (same fixture)", () => {
  it("Visual renders avatar cards with load, projects, hours and the availability grid", () => {
    const { container, getByRole, getAllByRole } = renderIn("visual", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />);
    const cards = getAllByRole("article");
    expect(cards).toHaveLength(PEOPLE_FIXTURE.length);

    const paul = within(getByRole("article", { name: "Paul Langarica Soubic" }));
    expect(paul.getByRole("link", { name: "Paul Langarica Soubic" }).getAttribute("href")).toBe("/personas/equipo/p-paul");
    expect(paul.getByText("Residente de obra")).toBeTruthy();
    expect(paul.getByText("PL")).toBeTruthy();
    expect(paul.getByText("18 tareas abiertas")).toBeTruthy();
    expect(paul.getByText("6 vencidas")).toBeTruthy();
    expect(paul.getByText("3 proyectos")).toBeTruthy();
    expect(paul.getByText("Carga")).toBeTruthy();
    expect(paul.getByText("100%")).toBeTruthy();
    expect(paul.getByText("41.5")).toBeTruthy();

    // Availability grid: one row per person, the state as text for assistive tech.
    expect(getByRole("heading", { name: "Disponibilidad esta semana" })).toBeTruthy();
    const grid = getByRole("table");
    const sofia = within(within(grid).getByRole("row", { name: /Sofía Castro/ }));
    expect(sofia.getAllByRole("cell").map((c) => c.textContent)).toEqual(["Libre", "Libre", "Ocupado", "Libre", "Libre"]);

    // Only the Visual style is rendered.
    expect(container.textContent).not.toContain(PEOPLE_AVAILABILITY_SENTENCES["p-luis"]);
    expect(container.textContent).not.toContain("Abiertas");
  });

  it("Esencial renders a directory list and availability as a sentence", () => {
    const { container, getAllByRole, queryByRole } = renderIn(
      "esencial",
      <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />
    );
    expect(queryByRole("article")).toBeNull();
    expect(queryByRole("table")).toBeNull();
    // No avatars: names only, no initials.
    expect(container.textContent).not.toContain("PL");
    const links = getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(PEOPLE_FIXTURE.map((p) => p.name));

    const body = text(container);
    expect(body).toContain("Residente de obra · Construcción · 3 proyectos");
    expect(body).toContain("18 tareas abiertas · 6 vencidas · 100% de ocupación · 41.5 h esta semana");
    expect(body).toContain("Disponibilidad esta semana");
    for (const sentence of Object.values(PEOPLE_AVAILABILITY_SENTENCES)) expect(body).toContain(sentence);
  });

  it("Analítico renders the occupancy table and the per-day availability table", () => {
    const { getAllByRole, queryByRole } = renderIn("analitico", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />);
    expect(queryByRole("article")).toBeNull();
    const [main, availability] = getAllByRole("table");
    const headers = within(main).getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
    expect(headers).toEqual([
      "Persona",
      "Puesto",
      "Etapa",
      "Abiertas",
      "Vencidas",
      "Horas semana",
      "% ocupación",
      "Proyectos activos",
    ]);
    const paul = within(within(main).getByRole("row", { name: /Paul Langarica Soubic/ }));
    expect(paul.getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Paul Langarica Soubic",
      "Residente de obra",
      "Construcción",
      "18",
      "6",
      "41.5",
      "100%",
      "3",
    ]);
    // Hours not returned for Alejandro read as a dash.
    const alejandro = within(within(main).getByRole("row", { name: /Alejandro Riofrio/ }));
    expect(alejandro.getAllByRole("cell")[5].textContent).toBe("—");

    expect(within(availability).getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""))).toEqual([
      "Persona",
      "lun",
      "mar",
      "mié",
      "jue",
      "vie",
      "Libres",
      "Saturados",
      "Vacaciones",
    ]);
    const luis = within(within(availability).getByRole("row", { name: /Luis Ramírez/ }));
    expect(luis.getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Luis Ramírez",
      "Vacaciones",
      "Vacaciones",
      "Vacaciones",
      "Libre",
      "Ocupado",
      "1",
      "0",
      "3",
    ]);
  });

  it("renders the same open / overdue / occupancy / project numbers in every style", () => {
    const openText = (n: number) => `${n} ${n === 1 ? "tarea abierta" : "tareas abiertas"}`;
    const projectsText = (n: number) => `${n} ${n === 1 ? "proyecto" : "proyectos"}`;

    const visual = renderIn("visual", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />);
    for (const p of PEOPLE_FIXTURE) {
      const card = text(visual.getByRole("article", { name: p.name }));
      expect(card, p.name).toContain(openText(p.open));
      if (p.overdue > 0) expect(card, p.name).toContain(`${p.overdue} vencida`);
      expect(card, p.name).toContain(`${p.occupancyPct}%`);
      expect(card, p.name).toContain(projectsText(p.activeProjects ?? 0));
    }
    visual.unmount();

    const esencial = renderIn("esencial", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />);
    for (const p of PEOPLE_FIXTURE) {
      const row = text(esencial.getByRole("link", { name: p.name }).closest("li") as HTMLElement);
      expect(row, p.name).toContain(openText(p.open));
      if (p.overdue > 0) expect(row, p.name).toContain(`${p.overdue} vencida`);
      expect(row, p.name).toContain(`${p.occupancyPct}% de ocupación`);
      expect(row, p.name).toContain(projectsText(p.activeProjects ?? 0));
    }
    esencial.unmount();

    const analitico = renderIn("analitico", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} />);
    const main = analitico.getAllByRole("table")[0];
    for (const p of PEOPLE_FIXTURE) {
      const cells = within(within(main).getByRole("row", { name: new RegExp(p.name) }))
        .getAllByRole("cell")
        .map((c) => c.textContent);
      expect(cells.slice(3), p.name).toEqual([
        String(p.open),
        String(p.overdue),
        typeof p.weekHours === "number" ? p.weekHours.toFixed(1) : "—",
        `${p.occupancyPct}%`,
        String(p.activeProjects),
      ]);
    }
  });

  it("omits the hours everywhere when the server returned none", () => {
    const people = PEOPLE_FIXTURE.map((p) => ({ ...p, weekHours: null }));
    for (const style of STYLES) {
      const { container, unmount } = renderIn(style, <PeopleWidget people={people} show={ALL} />);
      expect(container.textContent, style).not.toMatch(/Horas semana|h esta semana/);
      unmount();
    }
  });

  it("respects `show`: no load, projects or availability when not requested", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderIn(style, <PeopleWidget people={PEOPLE_FIXTURE} show={[]} />);
      const body = text(container);
      expect(body, style).not.toMatch(/Carga|ocupación|proyectos|Proyectos activos|Disponibilidad/);
      expect(body, style).toContain(PEOPLE_FIXTURE[0].name);
      unmount();
    }
  });

  it("rows layout: Visual inline availability strip, Esencial inline sentence", () => {
    const visual = renderIn("visual", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} layout="rows" />);
    expect(visual.queryByRole("article")).toBeNull();
    expect(visual.queryByRole("table")).toBeNull();
    expect(visual.getAllByText("Disponibilidad")).toHaveLength(PEOPLE_FIXTURE.length);
    expect(text(visual.container)).toContain("18 tareas abiertas");
    visual.unmount();

    const esencial = renderIn("esencial", <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} layout="rows" />);
    expect(esencial.queryByRole("heading", { name: "Disponibilidad esta semana" })).toBeNull();
    expect(text(esencial.container)).toContain(PEOPLE_AVAILABILITY_SENTENCES["p-maria"]);
  });

  it("renders the `actions` slot once per person in every style", () => {
    for (const style of STYLES) {
      const { getAllByRole, unmount } = renderIn(
        style,
        <PeopleWidget
          people={PEOPLE_FIXTURE}
          show={ALL}
          actions={(p) => (
            <button type="button" aria-label={`Ver tareas de ${p.name}`}>
              Ver tareas
            </button>
          )}
        />
      );
      const buttons = getAllByRole("button", { name: /^Ver tareas de / });
      expect(buttons.map((b) => b.getAttribute("aria-label")), style).toEqual(
        PEOPLE_FIXTURE.map((p) => `Ver tareas de ${p.name}`)
      );
      unmount();
    }
  });
});

describe("PeopleWidget empty and loading states", () => {
  it("renders the default empty state in every style", () => {
    for (const style of STYLES) {
      const { getByTestId, unmount } = renderIn(style, <PeopleWidget people={[]} show={ALL} />);
      expect(getByTestId("empty-state").textContent).toBe(PEOPLE_EMPTY_TEXT);
      unmount();
    }
  });

  it("uses `emptyText` and lets `emptyState` win over it", () => {
    const a = renderIn("visual", <PeopleWidget people={[]} show={ALL} emptyText="Sin personas en esta etapa" />);
    expect(a.getByTestId("empty-state").textContent).toBe("Sin personas en esta etapa");
    a.unmount();
    const b = renderIn(
      "analitico",
      <PeopleWidget
        people={[]}
        show={ALL}
        emptyText="ignorado"
        emptyState={{ title: "Aún no hay contratistas", description: "Agrega el primero." }}
      />
    );
    expect(b.getByTestId("empty-state").textContent).toBe("Aún no hay contratistasAgrega el primero.");
  });

  it("renders the LoadingSkeleton variant of the current style", () => {
    const expected: Record<PresentationStyle, string> = { visual: "cards", esencial: "list", analitico: "table" };
    for (const style of STYLES) {
      const { getAllByTestId, queryByText, unmount } = renderIn(
        style,
        <PeopleWidget people={PEOPLE_FIXTURE} show={ALL} loading />
      );
      const skeletons = getAllByTestId("loading-skeleton");
      expect(skeletons).toHaveLength(1);
      expect(skeletons[0].dataset.variant).toBe(expected[style]);
      expect(queryByText(PEOPLE_FIXTURE[0].name)).toBeNull();
      unmount();
    }
    const rows = renderIn("visual", <PeopleWidget people={[]} show={ALL} layout="rows" loading />);
    expect(rows.getByTestId("loading-skeleton").dataset.variant).toBe("list");
  });
});

describe("PeopleWidget helpers", () => {
  it("writes availability as a sentence", () => {
    for (const p of PEOPLE_FIXTURE) {
      expect(availabilitySentence(p.availability), p.name).toBe(PEOPLE_AVAILABILITY_SENTENCES[p.id]);
    }
    expect(availabilitySentence(["ocupado", "ocupado", "ocupado", "ocupado", "ocupado"])).toBe("Ocupado toda la semana.");
    expect(availabilitySentence(["libre", "libre", "libre", "libre", "libre"])).toBe("Libre toda la semana.");
    expect(availabilitySentence(["ocupado", "ocupado", "ocupado", "libre", "libre"])).toBe("Libre jue y vie.");
    expect(availabilitySentence([])).toBeNull();
    expect(availabilitySentence(undefined)).toBeNull();
  });

  it("builds the Analítico table with the averages row and occupancy heat", () => {
    const table = buildPeopleTable(PEOPLE_FIXTURE, ["load", "hours", "projects"]);
    expect(table.totals).toEqual(PEOPLE_AVERAGES);
    expect(table.heat).toEqual([{ key: "occupancyPct", warnAt: 60, critAt: 90 }]);
    expect(table.rows.map((r) => r.open)).toEqual(PEOPLE_FIXTURE.map((p) => p.open));
    const noHours = buildPeopleTable(
      PEOPLE_FIXTURE.map((p) => ({ ...p, weekHours: null })),
      ["load", "hours", "projects"]
    );
    expect(noHours.columns.some((c) => c.key === "weekHours")).toBe(false);
    expect(noHours.totals).not.toHaveProperty("weekHours");
  });

  it("builds the availability table with the team row", () => {
    const table = buildAvailabilityTable(PEOPLE_FIXTURE);
    expect(table.totals).toEqual({
      name: "Equipo",
      d0: "2 libres",
      d1: "1 libre",
      d2: "1 libre",
      d3: "3 libres",
      d4: "2 libres",
      libres: 9,
      saturados: 3,
      vacaciones: 3,
    });
  });

  it("derives load from occupancy, or from open tasks against the busiest person", () => {
    expect(loadPercent(PEOPLE_FIXTURE[1], 18)).toBe(67);
    expect(loadPercent({ ...PEOPLE_FIXTURE[3], occupancyPct: undefined }, 18)).toBe(33);
    expect(loadPercent({ ...PEOPLE_FIXTURE[3], occupancyPct: undefined }, 0)).toBe(0);
    expect(loadTone(100)).toBe("critical");
    expect(loadTone(67)).toBe("warn");
    expect(loadTone(56)).toBe("ok");
  });
});
