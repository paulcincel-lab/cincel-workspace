import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isProposalStale, originalItemIds, overlayEntries, proposalRows } from "@/lib/calendario/proposal-view";
import type { Proposal } from "@/lib/types/calendario";

import { ProposalCard } from "./ProposalCard";
import { ProposalOverlay } from "./ProposalOverlay";
import { ProposalTable } from "./ProposalTable";

const moved: Proposal = {
  id: "p1",
  kind: "mover_tareas",
  status: "propuesta",
  title: "Mover 2 tareas al jueves 12 nov",
  line: "Ingenierías y Levantamiento",
  rangeFrom: null,
  rangeTo: null,
  changes: [
    { changeId: "c1", type: "task_date", taskId: "1", title: "Ingenierías", projectName: "Casa Madrid", before: { date: "2026-11-09", field: "commitmentDate" }, after: { date: "2026-11-12" }, staffId: null },
    { changeId: "c2", type: "task_date", taskId: "2", title: "Levantamiento", projectName: null, before: { date: "2026-11-10", field: "commitmentDate" }, after: { date: "2026-11-12" }, staffId: null },
  ],
  deferred: [],
  createdAt: "2026-11-11T10:00:00Z",
  expiresAt: "2999-01-01T00:00:00Z",
};
const meeting: Proposal = {
  ...moved,
  id: "p2",
  kind: "crear_reunion",
  title: "Crear reunión",
  changes: [
    { changeId: "m1", type: "event_create", draft: { title: "Junta con cliente", start: "2026-11-12T10:00:00", end: "2026-11-12T11:00:00", projectId: null, location: null, meet: true, attendees: [] } },
  ],
};

describe("proposal view helpers", () => {
  it("tags moved and new items with text and strikes the originals", () => {
    expect(overlayEntries(moved, ["c1", "c2"]).map((e) => e.tag)).toEqual(["propuesta: desde 9 nov", "propuesta: desde 10 nov"]);
    expect(overlayEntries(meeting, ["m1"])[0]?.tag).toBe("propuesta: nueva reunión");
    expect([...originalItemIds(moved, ["c1"])]).toEqual(["t:1"]);
    expect(overlayEntries(moved, ["c2"])).toHaveLength(1);
  });
  it("builds before and after rows", () => {
    expect(proposalRows(moved)[0]).toMatchObject({ before: "9 nov", after: "12 nov", project: "Casa Madrid" });
    expect(proposalRows(meeting)[0]).toMatchObject({ before: null, after: "12 nov, 10:00" });
  });
  it("marks applied and expired proposals stale", () => {
    expect(isProposalStale(moved)).toBe(false);
    expect(isProposalStale({ ...moved, status: "aplicada" })).toBe(true);
    expect(isProposalStale(null)).toBe(true);
  });
});

describe("proposal widgets", () => {
  it.each([
    ["mover_tareas", moved, ["c1", "c2"], "propuesta: desde 9 nov"],
    ["crear_reunion", meeting, ["m1"], "propuesta: nueva reunión"],
  ])("overlay draws %s with a text tag and the legend", (_n, proposal, checked, tag) => {
    render(<ProposalOverlay proposal={proposal} checked={checked} />);
    expect(screen.getByText(tag)).toBeTruthy();
    expect(screen.getByText("Cambio propuesto por el asistente (sin aplicar)")).toBeTruthy();
  });

  it("table: unchecking excludes a row from the checked list, Aplicar and Cancelar call back", () => {
    const onToggle = vi.fn();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(<ProposalTable proposal={moved} checked={["c1"]} variant="analitico" onToggle={onToggle} onApply={onApply} onCancel={onCancel} />);
    expect(screen.getByText("Cambiar 2 fechas compromiso")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Incluir Levantamiento"));
    expect(onToggle).toHaveBeenCalledWith("c2");
    fireEvent.click(screen.getByText("Aplicar cambios"));
    expect(onApply).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("table disables Aplicar when nothing is checked", () => {
    render(<ProposalTable proposal={moved} checked={[]} />);
    expect((screen.getByText("Aplicar cambios") as HTMLButtonElement).disabled).toBe(true);
  });

  it("card shows title, line and the three actions", () => {
    const onApply = vi.fn();
    render(<ProposalCard proposal={meeting} checked={["m1"]} variant="esencial" onApply={onApply} onCancel={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByText("Aplicar"));
    expect(onApply).toHaveBeenCalled();
    expect(screen.getByText("Editar")).toBeTruthy();
    expect(screen.getByText("Cancelar")).toBeTruthy();
  });

  it("stale card says so and offers Pedir de nuevo", () => {
    const onRetry = vi.fn();
    render(<ProposalCard proposal={moved} checked={[]} stale onRetry={onRetry} />);
    expect(screen.getByText("Esta propuesta ya no está vigente.")).toBeTruthy();
    fireEvent.click(screen.getByText("Pedir de nuevo"));
    expect(onRetry).toHaveBeenCalled();
  });
});
