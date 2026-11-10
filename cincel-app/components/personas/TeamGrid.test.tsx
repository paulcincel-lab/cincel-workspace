// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PeopleWidgetProps } from "@/components/widgets/PeopleWidget";
import { PEOPLE_EMPTY_TEXT } from "@/components/widgets/PeopleWidget";
import { availabilityRows, buildTeamPeople } from "@/lib/personas/team";
import { usePersonasDashboard } from "@/lib/stores/personas-dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";

import { EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_STAFF, EQUIPO_TRAMOS } from "./fixtures/equipo";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(),
}));

// The people widget owns the per-style markup; these tests check what the
// Equipo instances hand it, so it renders its props as plain data here.
const calls = vi.hoisted(() => ({ widget: [] as PeopleWidgetProps[] }));
vi.mock("@/components/widgets/PeopleWidget", () => ({
  PEOPLE_EMPTY_TEXT: "Aún no hay personas",
  PeopleWidget: (props: PeopleWidgetProps) => {
    calls.widget.push(props);
    if (props.people.length === 0) return <p>{props.emptyText ?? "Aún no hay personas"}</p>;
    return (
      <ul
        data-testid="people-widget"
        data-show={props.show.join(",")}
        data-layout={props.layout ?? ""}
        data-view={props.view ?? ""}
      >
        {props.people.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            {props.actions ? props.actions(p) : null}
          </li>
        ))}
      </ul>
    );
  },
}));
vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: ({
    title,
    actions,
    children,
    collapsible,
  }: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
    collapsible?: { collapsed: boolean; onToggle(): void };
  }) => (
    <section aria-label={title}>
      {actions}
      {collapsible ? (
        <button type="button" aria-expanded={!collapsible.collapsed} onClick={collapsible.onToggle}>
          {collapsible.collapsed ? "Expandir" : "Contraer"}
        </button>
      ) : null}
      {collapsible?.collapsed ? null : children}
    </section>
  ),
}));

const PERSIST_KEY = "cincel.ui.dashboard.personas.v1";

import { AvailabilityWeek } from "./AvailabilityWeek";
import { TeamGrid } from "./TeamGrid";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

beforeEach(() => {
  calls.widget = [];
  usePersonasDashboard.getState().reset();
  localStorage.clear();
});
afterEach(cleanup);

describe("Equipo data", () => {
  it("shows puesto from the positions, never the access role", () => {
    const { people } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);
    expect(people.map((p) => p.puesto)).toEqual(["Arquitecta proyectista", "Residente de obra", null]);
    for (const person of people) {
      expect(["Administrador", "Colaborador", "Dirección"]).not.toContain(person.puesto);
    }
    expect(people.map((p) => p.tramo)).toEqual(["diseno", "construccion", null]);
    expect(people[0].href).toBe(`/personas/equipo/${EQUIPO_STAFF[0].id}`);
  });

  it("keeps weekHours null when the server returned no hours and 0 when it did", () => {
    expect(buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, []).people.map((p) => p.weekHours)).toEqual([
      null,
      null,
      null,
    ]);
    expect(buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, []).people.map((p) => p.weekHours)).toEqual([
      0, 0, 0,
    ]);
    expect(buildTeamPeople(EQUIPO_STAFF, [], []).people.every((p) => p.weekHours === null)).toBe(true);
  });
});

describe("TeamGrid hours", () => {
  it("leaves the hours column out when weekHours is null for all rows", () => {
    const { people } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);
    render(<TeamGrid people={people} />);
    expect(calls.widget).toHaveLength(1);
    for (const props of calls.widget) expect(props.show).not.toContain("hours");
  });

  it("shows the hours column when the server returned hours, even if they are all zero", () => {
    const { people } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
    render(<TeamGrid people={people} />);
    for (const props of calls.widget) expect(props.show).toContain("hours");
  });
});

describe("TeamGrid styles", () => {
  it.each(STYLES)("hands the widget the same people and show list in %s", (style) => {
    const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);
    render(
      <StyleProvider style={style} scope="staff">
        <TeamGrid people={people} emails={emails} />
      </StyleProvider>,
    );
    const [props] = calls.widget;
    expect(props.people).toBe(people);
    expect(props.show).toEqual(["load", "projects"]);
    expect(props.layout).toBe("cards");
  });

  it("renders Ver tareas, correo and the Cutto chat as links; Cutto opens in a new tab", () => {
    const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);
    render(<TeamGrid people={people} emails={emails} />);
    const ana = within(screen.getByText("Ana Ruiz").closest("li") as HTMLElement);
    expect(ana.getByRole("link", { name: /Ver tareas/ }).getAttribute("href")).toBe(
      `/tareas?vista=lista&responsable=${EQUIPO_STAFF[0].id}`,
    );
    expect(ana.getByRole("link", { name: /correo/ }).getAttribute("href")).toBe("mailto:ana@cincel.mx");
    const cutto = ana.getByRole("link", { name: /Abrir chat en Cutto/ });
    expect(cutto.getAttribute("href")).toMatch(/\/dm\/ana%40cincel\.mx$/);
    expect(cutto.getAttribute("target")).toBe("_blank");
    expect(cutto.getAttribute("rel")).toContain("noopener");
    expect(document.querySelector("iframe")).toBeNull();

    // Without an email there is nothing to mail or chat with.
    const carla = within(screen.getByText("Carla Méndez").closest("li") as HTMLElement);
    expect(carla.queryByRole("link", { name: /Cutto/ })).toBeNull();
    expect(carla.queryByRole("link", { name: /correo/ })).toBeNull();
  });
});

describe("AvailabilityWeek", () => {
  it("renders the libre / ocupado / saturado / vacaciones legend around an availability widget", () => {
    render(
      <AvailabilityWeek
        rows={[{ staffId: "s1", name: "Ana Ruiz", days: ["libre", "ocupado", "saturado", "vacaciones", "libre"] }]}
      />,
    );
    expect(screen.getByRole("region", { name: "Disponibilidad esta semana" })).toBeTruthy();
    const legend = screen.getByRole("list", { name: "Leyenda de disponibilidad" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Libre",
      "Ocupado",
      "Saturado",
      "Vacaciones",
    ]);
    expect(calls.widget[0].show).toEqual(["availability"]);
    expect(calls.widget[0].people[0].availability).toEqual(["libre", "ocupado", "saturado", "vacaciones", "libre"]);
  });

  it("renders nothing without rows", () => {
    const { container } = render(<AvailabilityWeek rows={[]} />);
    expect(container.innerHTML).toBe("");
    expect(calls.widget).toHaveLength(0);
  });
});

describe("Personas dashboard: availability filter", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);

  function Equipo() {
    return (
      <>
        <AvailabilityWeek rows={availabilityRows(people)} />
        <TeamGrid people={people} emails={emails} />
      </>
    );
  }

  function teamNames(): string[] {
    const last = calls.widget.filter((props) => props.layout === "cards").at(-1);
    return last ? last.people.map((p) => p.name) : [];
  }

  it("renders the legend items as toggle buttons, none pressed by default", () => {
    render(<Equipo />);
    const legend = screen.getByRole("list", { name: "Leyenda de disponibilidad" });
    const buttons = within(legend).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Libre", "Ocupado", "Saturado", "Vacaciones"]);
    for (const button of buttons) expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(teamNames()).toEqual(people.map((p) => p.name));
  });

  it("Saturado shows only the people saturated on at least one day; pressing it again clears it", () => {
    render(<Equipo />);
    const saturado = screen.getByRole("button", { name: "Saturado" });
    fireEvent.click(saturado);
    expect(saturado.getAttribute("aria-pressed")).toBe("true");
    expect(usePersonasDashboard.getState().selectedKpi).toBe("saturado");
    expect(teamNames()).toEqual([people[0].name]);
    // The availability grid itself keeps everyone.
    const availability = calls.widget.filter((props) => props.layout === "rows").at(-1)!;
    expect(availability.people).toHaveLength(people.length);

    fireEvent.click(saturado);
    expect(saturado.getAttribute("aria-pressed")).toBe("false");
    expect(teamNames()).toEqual(people.map((p) => p.name));
  });

  it("shows the existing empty text when nobody matches", () => {
    const onlyCarla = people.filter((p) => p.name.startsWith("Carla"));
    render(
      <>
        <AvailabilityWeek rows={availabilityRows(onlyCarla)} />
        <TeamGrid people={onlyCarla} emails={emails} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Vacaciones" }));
    expect(screen.getByText(PEOPLE_EMPTY_TEXT)).toBeTruthy();
  });

  it("keeps the selection across a remount (navigating to a persona and back) but never persists it", () => {
    const first = render(<Equipo />);
    fireEvent.click(screen.getByRole("button", { name: "Saturado" }));
    first.unmount();
    render(<Equipo />);
    expect(screen.getByRole("button", { name: "Saturado" }).getAttribute("aria-pressed")).toBe("true");
    expect(teamNames()).toEqual([people[0].name]);
    expect(localStorage.getItem(PERSIST_KEY) ?? "").not.toContain("saturado");
  });
});

describe("Personas dashboard: collapse", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);

  it("collapses Disponibilidad esta semana and persists the choice", () => {
    render(<AvailabilityWeek rows={availabilityRows(people)} />);
    const toggle = screen.getByRole("button", { name: "Contraer" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Expandir" }).getAttribute("aria-expanded")).toBe("false");
    expect(usePersonasDashboard.getState().collapsed.availability).toBe(true);
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY)!).state.collapsed).toEqual({ availability: true });
    // The legend filter stays usable while collapsed.
    expect(screen.getByRole("button", { name: "Saturado" })).toBeTruthy();
  });

  it.each(STYLES)("renders no Tarjetas / Tabla switch and lets the style pick the layout in %s", (style) => {
    render(
      <StyleProvider style={style} scope="staff">
        <AvailabilityWeek rows={availabilityRows(people)} />
        <TeamGrid people={people} emails={emails} />
      </StyleProvider>,
    );
    expect(screen.queryByRole("group", { name: "Vista del equipo" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Vista de disponibilidad" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tabla" })).toBeNull();
    for (const props of calls.widget) expect(props.view).toBeUndefined();
  });

  it("first render equals the server render with a persisted value present; it applies after rehydration", async () => {
    const tree = (
      <StyleProvider style="visual" scope="staff">
        <AvailabilityWeek rows={availabilityRows(people)} />
        <TeamGrid people={people} emails={emails} />
      </StyleProvider>
    );
    const defaults = renderToString(tree);
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        state: { range: "8w", collapsed: { availability: true }, views: {}, hiddenSeries: {} },
        version: 1,
      }),
    );
    expect(renderToString(tree)).toBe(defaults);

    render(tree);
    expect(screen.getByRole("button", { name: "Contraer" })).toBeTruthy();
    await act(async () => {
      await usePersonasDashboard.persist.rehydrate();
    });
    expect(screen.getByRole("button", { name: "Expandir" })).toBeTruthy();
  });
});
