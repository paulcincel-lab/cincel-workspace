// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { AgendaItem } from "@/lib/types/widgets";

vi.mock("@/components/widgets/AgendaWidget", () => ({
  AgendaWidget: (props: { title: string; items: AgendaItem[]; mode: string; emptyText?: string }) => (
    <section aria-label={props.title} data-mode={props.mode}>
      {props.items.length === 0 ? <p>{props.emptyText}</p> : null}
      <ul>
        {props.items.map((item) => (
          <li key={item.id} data-start={item.start} data-end={item.end}>
            {item.title}
          </li>
        ))}
      </ul>
    </section>
  ),
}));

import { TeamAbsencesStrip } from "./TeamAbsencesStrip";
import { ABSENCES } from "./vacaciones.fixtures";
import { absencesToAgendaItems } from "./vacation-format";

afterEach(() => {
  cleanup();
});

describe("TeamAbsencesStrip", () => {
  it("shows the month strip titled with the month in lowercase", () => {
    render(<TeamAbsencesStrip month="2026-11" absences={ABSENCES} />);

    const strip = screen.getByRole("region", { name: "Quién está fuera · noviembre" });
    expect(strip.getAttribute("data-mode")).toBe("month");
  });

  it("shows Ausencia for masked kinds and the real kind for the viewer's own row", () => {
    render(<TeamAbsencesStrip month="2026-11" absences={ABSENCES} />);

    expect(screen.getByText("Ana López · Incapacidad")).toBeTruthy();
    expect(screen.getByText("Juan Pérez · Ausencia")).toBeTruthy();
    expect(screen.getByText("Sofía Castro · Ausencia")).toBeTruthy();
    expect(screen.queryByText(/Juan Pérez · (Vacaciones|Incapacidad|Día personal)/)).toBeNull();
  });

  it("shows the kind a decider receives for everyone", () => {
    render(
      <TeamAbsencesStrip
        month="2026-11"
        absences={[{ staffId: "s2", name: "Juan Pérez", from: "2026-11-12", to: "2026-11-14", kind: "vacaciones" }]}
      />,
    );

    expect(screen.getByText("Juan Pérez · Vacaciones")).toBeTruthy();
  });

  it("maps each absence to an all-day item over its range", () => {
    const items = absencesToAgendaItems(ABSENCES);
    expect(items[1]).toMatchObject({ start: "2026-11-12", end: "2026-11-14", allDay: true, title: "Juan Pérez · Ausencia" });
    expect(new Set(items.map((i) => i.id)).size).toBe(ABSENCES.length);
  });

  it("says nobody is away when the month is empty", () => {
    render(<TeamAbsencesStrip month="2026-11" absences={[]} />);

    expect(screen.getByText("Nadie del equipo está fuera este mes.")).toBeTruthy();
  });
});
