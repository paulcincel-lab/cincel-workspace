import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CalEventItem } from "@/lib/types/calendario";

import { CalendarItemChip } from "./CalendarItemChip";

const meeting: CalEventItem = {
  kind: "event",
  id: "e:1",
  eventId: "1",
  source: "cincel",
  title: "Revisión con cliente",
  date: "2026-11-12",
  start: "2026-11-12T10:00:00-06:00",
  end: "2026-11-12T11:00:00-06:00",
  allDay: false,
  project: null,
  tramo: { id: "w", key: "diseno", name: "Diseño", colorSlot: 2 },
  location: "Madrid 22",
  meetUrl: null,
  attendees: [{ name: "Ana García", staffId: null, response: "pendiente" }],
  attendeeCount: 3,
  organizer: null,
  googleHtmlLink: null,
  syncedAt: null,
  syncError: null,
  minutes: "ninguna",
  canEdit: true,
};

describe("CalendarItemChip meetings", () => {
  it("shows the time and the title in the chip density", () => {
    render(<CalendarItemChip item={meeting} density="chip" />);
    expect(screen.getByText("10:00")).toBeTruthy();
    expect(screen.getByText("Revisión con cliente")).toBeTruthy();
    expect(screen.queryByText("Madrid 22")).toBeNull();
  });
  it("adds place and attendees in the card density", () => {
    render(<CalendarItemChip item={meeting} density="card" />);
    expect(screen.getByText("Madrid 22")).toBeTruthy();
    expect(screen.getByText("Ana García +2")).toBeTruthy();
  });
  it("shows the range in the block density", () => {
    render(<CalendarItemChip item={meeting} density="block" />);
    expect(screen.getByText("10:00 – 11:00")).toBeTruthy();
  });
  it("uses the etapa token for the edge", () => {
    const { container } = render(<CalendarItemChip item={meeting} density="chip" />);
    expect((container.firstChild as HTMLElement).style.borderLeftColor).toBe("var(--chart-2)");
  });
});
