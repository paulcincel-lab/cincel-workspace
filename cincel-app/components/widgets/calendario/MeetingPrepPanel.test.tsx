import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeetingPrep } from "@/lib/types/calendario";

import { MeetingPrepPanel, agendaToText } from "./MeetingPrepPanel";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const prep: MeetingPrep = {
  eventId: "e1",
  kpis: { progressVsPlan: -8, tramo: { name: "Diseño", phase: "Proyecto ejecutivo" }, overdue: 2, open: 15, lastMeeting: { date: "2026-10-28", decisions: 3, open: 1 } },
  overdue: [{ taskId: "t1", title: "Ingenierías", managerName: "Luis Martínez", date: "2026-11-09", daysLate: 2 }],
  agenda: ["Avance", "Pendientes"],
  summary: "Hay 2 tareas vencidas.",
};

describe.each(["visual", "esencial", "analitico"] as const)("MeetingPrepPanel %s", (variant) => {
  beforeEach(() => {
    toast.success.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });

  it("shows the KPIs, the overdue list and the agenda", () => {
    render(<MeetingPrepPanel prep={prep} eventId="e1" variant={variant} />);
    expect(screen.getByText("Avance", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("Ingenierías")).toBeTruthy();
    expect(screen.getByLabelText("Punto 1 del orden del día")).toBeTruthy();
  });

  it("sends the agenda as edited, after confirming the recipients", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MeetingPrepPanel prep={prep} eventId="e1" variant={variant} recipients={[{ name: "Luis Martínez" }]} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Punto 1 del orden del día"), { target: { value: "Avance de obra" } });
    fireEvent.click(screen.getByLabelText("Bajar punto 1"));
    fireEvent.click(screen.getByRole("button", { name: /Enviar orden del día/ }));
    expect(screen.getByText("Luis Martínez", { selector: "li" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(["Pendientes", "Avance de obra"]));
  });

  it("copies plain text with a toast", async () => {
    render(<MeetingPrepPanel prep={prep} eventId="e1" variant={variant} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Orden del día copiado."));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("1. Avance\n2. Pendientes");
  });
});

describe("agendaToText", () => {
  it("numbers the items", () => {
    expect(agendaToText(["a", "b"])).toBe("1. a\n2. b");
  });
});
