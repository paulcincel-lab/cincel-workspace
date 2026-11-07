// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CalendarItem } from "@/lib/types/redesign";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
const actions = vi.hoisted(() => ({ deleteTaskAction: vi.fn() }));
const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=calendario&cal=semana"),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("sonner", () => sonner);

import {
  EventDetailPopover,
  eventAttendees,
  eventDateLabel,
  eventTramoRef,
  safeMeetingUrl,
  taskSheetHref,
} from "./EventDetailPopover";

function makeEvent(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "e1",
    taskId: "t1",
    date: "2026-11-06",
    time: "11:00",
    title: "Revisión de cotas",
    project: "Ensenada",
    responsible: "Paul Langarica",
    tramo: "construccion",
    tramoLabel: "Construcción",
    phaseId: "f1",
    phaseLabel: "Obra negra",
    type: "Reunion",
    href: "/actividades/construccion",
    ...overrides,
  };
}

function renderPopover(event: CalendarItem, onClose = vi.fn()) {
  const anchor = document.createElement("button");
  anchor.textContent = event.title;
  document.body.appendChild(anchor);
  anchor.focus();
  const utils = render(<EventDetailPopover event={event} anchor={anchor} onClose={onClose} />);
  return { ...utils, anchor, onClose };
}

beforeEach(() => {
  actions.deleteTaskAction.mockReset();
  router.refresh.mockReset();
  sonner.toast.success.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("EventDetailPopover helpers", () => {
  it("formats the date in lowercase es-MX", () => {
    expect(eventDateLabel("2026-11-06")).toBe("viernes, 6 de noviembre");
  });

  it("maps sin-tramo to no tramo and keeps real tramos", () => {
    expect(eventTramoRef({ tramo: "sin-tramo", tramoLabel: "Sin tramo" })).toBeNull();
    expect(eventTramoRef({ tramo: "diseno", tramoLabel: "Diseño" })).toMatchObject({ key: "diseno", name: "Diseño" });
  });

  it("uses stored attendees, else the responsable", () => {
    expect(eventAttendees({ responsible: "Ana", attendees: ["Juanma", " Juanma ", "Paul"] })).toEqual(["Juanma", "Paul"]);
    expect(eventAttendees({ responsible: "Ana" })).toEqual(["Ana"]);
    expect(eventAttendees({ responsible: "" })).toEqual([]);
  });

  it("only accepts http(s) meeting links", () => {
    expect(safeMeetingUrl("https://cutto.cloudketer.dev/m/abc")).toBe("https://cutto.cloudketer.dev/m/abc");
    expect(safeMeetingUrl("javascript:alert(1)")).toBeNull();
    expect(safeMeetingUrl("no es url")).toBeNull();
    expect(safeMeetingUrl(null)).toBeNull();
  });

  it("opens the task sheet keeping the /tareas query", () => {
    expect(taskSheetHref("t1", "/tareas", "vista=calendario&cal=mes")).toBe("/tareas?vista=calendario&cal=mes&tarea=t1");
    expect(taskSheetHref("t1", "/inicio", "x=1")).toBe("/tareas?tarea=t1");
  });
});

describe("EventDetailPopover", () => {
  it("shows title, time, project, attendees, location and linked task", async () => {
    renderPopover(makeEvent({ attendees: ["Juanma", "Alejandro Riofrio"], location: "Obra Ensenada" }));

    const dialog = await screen.findByRole("dialog", { name: "Revisión de cotas" });
    expect(dialog.textContent).toContain("viernes, 6 de noviembre");
    expect(dialog.textContent).toContain("≈11:00");
    expect(dialog.textContent).toContain("Ensenada");
    expect(dialog.textContent).toContain("Obra Ensenada");
    expect(dialog.textContent).toContain("Construcción");
    expect(dialog.textContent).toContain("Obra negra");
    expect(dialog.textContent).toContain("Asistentes · 2");
    expect(dialog.textContent).toContain("Juanma");
    expect(dialog.textContent).toContain("Alejandro Riofrio");
    expect(dialog.textContent).toContain("Tareas vinculadas");

    const linked = screen.getAllByRole("link", { name: "Revisión de cotas" })[0];
    expect(linked.getAttribute("href")).toBe("/tareas?vista=calendario&cal=semana&tarea=t1");
    expect(screen.getByRole("link", { name: /Editar/ }).getAttribute("href")).toBe(
      "/tareas?vista=calendario&cal=semana&tarea=t1",
    );
  });

  it("has no 'Abrir en Cutto' without a stored meetingUrl", async () => {
    renderPopover(makeEvent());
    await screen.findByRole("dialog");
    expect(screen.queryByRole("link", { name: /Abrir en Cutto/ })).toBeNull();
  });

  it("opens the stored meetingUrl in a new tab with rel=noopener", async () => {
    renderPopover(makeEvent({ meetingUrl: "https://cutto.cloudketer.dev/meet/42" }));
    const link = await screen.findByRole("link", { name: /Abrir en Cutto/ });
    expect(link.getAttribute("href")).toBe("https://cutto.cloudketer.dev/meet/42");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("moves focus inside on open, and Escape closes and returns focus to the anchor", async () => {
    const { anchor, onClose } = renderPopover(makeEvent());
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(document.activeElement).toBe(anchor);
  });

  it("'Cerrar' closes and returns focus to the anchor", async () => {
    const { anchor, onClose } = renderPopover(makeEvent());
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor);
  });

  it("'Eliminar' asks to confirm, then deletes the task with the existing action", async () => {
    actions.deleteTaskAction.mockResolvedValue(undefined);
    const { onClose } = renderPopover(makeEvent());

    fireEvent.click(await screen.findByRole("button", { name: /Eliminar/ }));
    expect(screen.getByText("¿Eliminar esta tarea?")).toBeTruthy();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    });
    await waitFor(() => expect(actions.deleteTaskAction).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(router.refresh).toHaveBeenCalled();
    expect(sonner.toast.success).toHaveBeenCalledWith("Tarea eliminada");
  });

  it("'Cancelar' backs out of the delete confirmation", async () => {
    renderPopover(makeEvent());
    fireEvent.click(await screen.findByRole("button", { name: /Eliminar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("¿Eliminar esta tarea?")).toBeNull();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();
  });

  it("maps delete errors through actionErrorText and stays open", async () => {
    actions.deleteTaskAction.mockRejectedValue(new Error("FORBIDDEN: task delete"));
    const { onClose } = renderPopover(makeEvent());

    fireEvent.click(await screen.findByRole("button", { name: /Eliminar/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    });
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
