// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TicketListRow } from "@/lib/types/soporte";

const m = vi.hoisted(() => ({ rows: [] as TicketListRow[], apply: vi.fn() }));

vi.mock("@/components/widgets/mejoras/use-triage", () => ({
  useMejorasRows: () => ({ rows: m.rows, isPending: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  useTriage: () => ({ apply: m.apply, isPending: false }),
}));

import { MejorasEsencial } from "@/components/widgets/mejoras/MejorasEsencial";
import { MejorasVisual, neighborStatus } from "@/components/widgets/mejoras/MejorasVisual";

function row(over: Partial<TicketListRow>): TicketListRow {
  return {
    id: "t1",
    code: "SOL-0001",
    kind: "error",
    title: "Falla al guardar",
    area: "tareas",
    status: "nuevo",
    priority: null,
    author: { id: "p1", name: "Ana Pérez", photoUrl: null },
    assignee: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    ...over,
  };
}

const props = { filters: {}, onFiltersChange: vi.fn(), onOpen: vi.fn() };

afterEach(cleanup);

beforeEach(() => {
  m.rows = [row({}), row({ id: "t2", code: "SOL-0002", title: "Otra", status: "en_progreso", githubIssueNumber: 12, githubIssueUrl: "https://example.test/12" })];
  m.apply.mockReset();
  props.onOpen.mockReset();
});

describe("neighborStatus", () => {
  it("walks the flow and stops at the ends", () => {
    expect(neighborStatus("nuevo", 1)).toBe("en_revision");
    expect(neighborStatus("nuevo", -1)).toBeNull();
    expect(neighborStatus("resuelto", 1)).toBeNull();
    expect(neighborStatus("descartado", 1)).toBeNull();
  });
});

describe("MejorasVisual", () => {
  it("shows a column per status with its cards", () => {
    render(<MejorasVisual {...props} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
    expect(screen.getByText("Falla al guardar")).toBeTruthy();
    expect(screen.getByText("GitHub #12")).toBeTruthy();
  });

  it("moves a card with Alt + arrow and opens it on click", () => {
    render(<MejorasVisual {...props} />);
    const title = screen.getByRole("button", { name: "Falla al guardar" });
    fireEvent.keyDown(title, { key: "ArrowRight", altKey: true });
    expect(m.apply).toHaveBeenCalledWith([{ id: "t1", patch: { status: "en_revision" } }]);
    fireEvent.click(title);
    expect(props.onOpen).toHaveBeenCalledWith("SOL-0001");
  });
});

describe("MejorasEsencial", () => {
  it("groups by status with one Revisar action per row", () => {
    render(<MejorasEsencial {...props} />);
    expect(screen.getAllByRole("button", { name: /^Revisar/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Revisar SOL-0002/ }));
    expect(props.onOpen).toHaveBeenCalledWith("SOL-0002");
  });
});
