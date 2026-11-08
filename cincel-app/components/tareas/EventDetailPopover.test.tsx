// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { CalendarItem } from "@/lib/types/redesign";

/** The popover never touches the router: a call to it fails the test. */
const router = vi.hoisted(() => ({
  refresh: vi.fn(() => {
    throw new Error("router.refresh called");
  }),
}));
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

function renderPopover(event: CalendarItem, onClose = vi.fn(), client: QueryClient = createTestQueryClient()) {
  const anchor = document.createElement("button");
  anchor.textContent = event.title;
  document.body.appendChild(anchor);
  anchor.focus();
  const utils = renderWithQueryClient(<EventDetailPopover event={event} anchor={anchor} onClose={onClose} />, { client });
  return { ...utils, anchor, onClose };
}

beforeEach(() => {
  actions.deleteTaskAction.mockReset();
  router.refresh.mockClear();
  sonner.toast.success.mockReset();
  sonner.toast.error.mockReset();
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

  it("'Eliminar' asks to confirm, then deletes the task as a mutation, without the router", async () => {
    actions.deleteTaskAction.mockResolvedValue({ ok: true, data: undefined });
    const client = createTestQueryClient();
    const filters = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };
    client.setQueryData(qk.tasks.detail("t1"), { id: "t1" });
    client.setQueryData(qk.tasks.subtasks("t1"), []);
    client.setQueryData(qk.tasks.detail("t2"), { id: "t2" });
    client.setQueryData(qk.tareas.calendar(filters, "2026-10-26", "2026-12-06"), []);
    client.setQueryData(qk.tareas.list(filters), []);
    client.setQueryData(qk.tareas.board(filters), {});
    client.setQueryData(qk.tareas.facets(filters), {});
    client.setQueryData(qk.proyectos.tab("p1", "tareas"), []);
    client.setQueryData(qk.proyectos.tab("p2", "tareas"), []);
    client.setQueryData(qk.inicio(), {});
    client.setQueryData(qk.shell.badges(), {});
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { onClose } = renderPopover(makeEvent({ projectId: "p1" }), vi.fn(), client);

    fireEvent.click(await screen.findByRole("button", { name: /Eliminar/ }));
    expect(screen.getByText("¿Eliminar esta tarea?")).toBeTruthy();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    });
    await waitFor(() => expect(actions.deleteTaskAction).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(router.refresh).not.toHaveBeenCalled();
    expect(sonner.toast.success).toHaveBeenCalledWith("Tarea eliminada");

    // The task's detail keys leave the cache; another task's stay.
    expect(client.getQueryData(qk.tasks.detail("t1"))).toBeUndefined();
    expect(client.getQueryData(qk.tasks.subtasks("t1"))).toBeUndefined();
    expect(client.getQueryData(qk.tasks.detail("t2"))).toEqual({ id: "t2" });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const invalid = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(invalid(qk.tareas.calendar(filters, "2026-10-26", "2026-12-06"))).toBe(true);
    expect(invalid(qk.tareas.list(filters))).toBe(true);
    expect(invalid(qk.tareas.board(filters))).toBe(true);
    expect(invalid(qk.tareas.facets(filters))).toBe(true);
    expect(invalid(qk.proyectos.tab("p1", "tareas"))).toBe(true);
    expect(invalid(qk.proyectos.tab("p2", "tareas"))).toBe(false);
    expect(invalid(qk.inicio())).toBe(true);
    expect(invalid(qk.shell.badges())).toBe(true);
  });

  it("returns a failed result as the inline error and stays open", async () => {
    actions.deleteTaskAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: task delete" });
    const { onClose } = renderPopover(makeEvent());

    fireEvent.click(await screen.findByRole("button", { name: /Eliminar/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    });
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(sonner.toast.error).not.toHaveBeenCalled();
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
