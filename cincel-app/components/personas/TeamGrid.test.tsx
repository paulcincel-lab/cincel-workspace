// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PeopleWidgetProps } from "@/components/widgets/PeopleWidget";
import { buildTeamPeople } from "@/lib/personas/team";
import type { PresentationStyle } from "@/lib/types/redesign";

import { EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_STAFF, EQUIPO_TRAMOS } from "./fixtures/equipo";

// The people widget owns the per-style markup; these tests check what the
// Equipo instances hand it, so it renders its props as plain data here.
const calls = vi.hoisted(() => ({ widget: [] as PeopleWidgetProps[] }));
vi.mock("@/components/widgets/PeopleWidget", () => ({
  PeopleWidget: (props: PeopleWidgetProps) => {
    calls.widget.push(props);
    return (
      <ul data-testid="people-widget" data-show={props.show.join(",")} data-layout={props.layout ?? ""}>
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
  WidgetCard: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <section aria-label={title}>
      {actions}
      {children}
    </section>
  ),
}));

import { AvailabilityWeek } from "./AvailabilityWeek";
import { TeamGrid } from "./TeamGrid";
import { TeamTable } from "./TeamTable";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

beforeEach(() => {
  calls.widget = [];
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

describe("TeamGrid / TeamTable hours", () => {
  it("leaves the hours column out when weekHours is null for all rows", () => {
    const { people } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_TRAMOS);
    render(
      <>
        <TeamGrid people={people} />
        <TeamTable people={people} />
      </>,
    );
    expect(calls.widget).toHaveLength(2);
    for (const props of calls.widget) expect(props.show).not.toContain("hours");
  });

  it("shows the hours column when the server returned hours, even if they are all zero", () => {
    const { people } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
    render(
      <>
        <TeamGrid people={people} />
        <TeamTable people={people} />
      </>,
    );
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
