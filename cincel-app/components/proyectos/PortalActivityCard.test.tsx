// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { PortalActivityRow } from "@/lib/types/portal";

const actions = vi.hoisted(() => ({ listProjectPortalActivityAction: vi.fn() }));
vi.mock("@/lib/actions/portal-actions", () => actions);

import { PortalActivityCard } from "./PortalActivityCard";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

const rows: PortalActivityRow[] = [
  { id: "e1", clientName: "Ana Cliente", fileName: "Planos.pdf", action: "download", at: "2026-11-02T18:00:00.000Z" },
  { id: "e2", clientName: "Luis Socio", fileName: "Foto obra.jpg", action: "upload", at: "2026-11-01T10:00:00.000Z" },
  { id: "e3", clientName: "Ana Cliente", fileName: "Render.png", action: "preview", at: "2026-10-30T09:00:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("PortalActivityCard", () => {
  it("lists the real portal file events of the project", async () => {
    actions.listProjectPortalActivityAction.mockResolvedValue(rows);
    render(<PortalActivityCard projectId={PROJECT_ID} />);

    expect(await screen.findByText("Planos.pdf")).toBeTruthy();
    expect(screen.getByText("Foto obra.jpg")).toBeTruthy();
    expect(screen.getByText("Render.png")).toBeTruthy();
    expect(screen.getAllByText("Ana Cliente")).toHaveLength(2);
    expect(screen.getByText("Descarga")).toBeTruthy();
    expect(screen.getByText("Subida")).toBeTruthy();
    expect(screen.getByText("Vista previa")).toBeTruthy();
    expect(actions.listProjectPortalActivityAction).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("keeps the order the server returns (newest first)", async () => {
    actions.listProjectPortalActivityAction.mockResolvedValue(rows);
    render(<PortalActivityCard projectId={PROJECT_ID} />);

    await screen.findByText("Planos.pdf");
    const times = screen.getAllByRole("row").slice(1).map((row) => row.querySelector("time")?.getAttribute("dateTime"));
    expect(times).toEqual(rows.map((row) => row.at));
  });

  it("shows an empty state without events", async () => {
    actions.listProjectPortalActivityAction.mockResolvedValue([]);
    render(<PortalActivityCard projectId={PROJECT_ID} />);

    expect(await screen.findByText("Todavía no hay actividad de clientes en este proyecto.")).toBeTruthy();
  });

  it("shows an error when the activity can't load", async () => {
    actions.listProjectPortalActivityAction.mockRejectedValue(new Error("boom"));
    render(<PortalActivityCard projectId={PROJECT_ID} />);

    expect(await screen.findByText("No se pudo cargar la actividad.")).toBeTruthy();
  });
});
