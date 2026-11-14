// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TicketTimeline, visibleTicketEvents } from "@/components/soporte/TicketTimeline";
import type { TicketEvent } from "@/lib/types/soporte";

const author = { id: "a1", name: "Ana", photoUrl: null };
const admin = { id: "b1", name: "Beto", photoUrl: null };

function ev(partial: Partial<TicketEvent> & Pick<TicketEvent, "id" | "type">): TicketEvent {
  return {
    ticketId: "t1",
    visibility: "public",
    actor: admin,
    payload: {},
    createdAt: "2026-11-13T10:00:00.000Z",
    ...partial,
  };
}

afterEach(cleanup);

describe("TicketTimeline", () => {
  it("never shows internal notes to the author", () => {
    const events = [
      ev({ id: "1", type: "created", actor: author }),
      ev({ id: "2", type: "note", visibility: "internal", payload: { text: "secreto" } }),
      ev({ id: "3", type: "priority", visibility: "internal", payload: { from: null, to: "alta" } }),
    ];
    expect(visibleTicketEvents(events, false).map((e) => e.id)).toEqual(["1"]);
    render(<TicketTimeline events={events} />);
    expect(screen.queryByText("secreto")).toBeNull();
  });

  it("shows status changes with Spanish labels and replies", () => {
    render(
      <TicketTimeline
        authorId={author.id}
        events={[
          ev({ id: "1", type: "status", payload: { from: "nuevo", to: "en_revision" } }),
          ev({ id: "2", type: "reply", createdAt: "2026-11-13T11:00:00.000Z", payload: { text: "Ya lo vemos" } }),
          ev({ id: "3", type: "reply", createdAt: "2026-11-13T12:00:00.000Z", actor: author, payload: { text: "Gracias" } }),
        ]}
      />,
    );
    expect(screen.getByText("Estado: Nueva → En revisión")).toBeTruthy();
    expect(screen.getByText("Ya lo vemos")).toBeTruthy();
    expect(screen.getByText("Ana (autor)")).toBeTruthy();
  });

  it("marks internal notes for admins and orders oldest first", () => {
    const events = [
      ev({ id: "late", type: "note", visibility: "internal", createdAt: "2026-11-14T10:00:00.000Z", payload: { text: "n2" } }),
      ev({ id: "early", type: "created", createdAt: "2026-11-13T10:00:00.000Z" }),
    ];
    expect(visibleTicketEvents(events, true).map((e) => e.id)).toEqual(["early", "late"]);
    render(<TicketTimeline events={events} showInternal />);
    expect(screen.getByText("Nota interna")).toBeTruthy();
  });

  it("shows an empty message", () => {
    render(<TicketTimeline events={[]} />);
    expect(screen.getByText("Todavía no hay actividad.")).toBeTruthy();
  });
});
