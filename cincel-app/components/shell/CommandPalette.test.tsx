// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { SearchResult, TodayStatus } from "@/lib/types/redesign";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const search = vi.hoisted(() => ({ searchWorkspaceAction: vi.fn() }));
const time = vi.hoisted(() => ({ fetchMyTodayAction: vi.fn(), clockInAction: vi.fn() }));
const timeFlags = vi.hoisted(() => ({ IMPLEMENTED: { clockInAction: false, fetchMyTodayAction: false } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/actions/search-actions", () => search);
vi.mock("@/lib/actions/time-tracking-actions", () => time);
vi.mock("@/lib/actions/time-tracking-actions.flags", () => timeFlags);

import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import { openCommandPalette, registerShellOpener } from "@/lib/ui/shell-openers";

import {
  CommandPalette,
  groupSearchResults,
  SEARCH_ENTRY_AVAILABLE,
  visibleActionIds,
} from "./CommandPalette";

const DISABLED_TODAY: TodayStatus = {
  state: "off",
  startedAt: null,
  workedSeconds: 0,
  required: false,
  promptAtLogin: false,
  enabled: false,
  requiredFrom: null,
  hoursPerDay: 8,
};

const RESULTS: SearchResult[] = [
  { type: "nota", id: "n1", title: "Medidas cocina", subtitle: "Nota", url: "/mi-espacio/notas/n1" },
  { type: "tarea", id: "t1", title: "Medir muro del fondo de cocina", subtitle: "Ensenada", url: "/tareas/t1" },
  {
    type: "archivo",
    id: "f1",
    title: "Ensenada · planta baja corregida.pdf",
    subtitle: "Drive",
    url: "https://drive.google.com/file/d/f1/view",
  },
  { type: "proyecto", id: "p1", title: "Ensenada", subtitle: "Construcción", url: "/proyectos/p1" },
  { type: "persona", id: "s1", title: "Juanma", subtitle: "Líder de proyecto", url: "/personas/equipo/s1" },
];

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

function input() {
  return screen.getByPlaceholderText("Buscar tareas, proyectos, personas, archivos…");
}

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

function groupHeadings(): string[] {
  return Array.from(document.querySelectorAll("[cmdk-group-heading]")).map((el) => el.textContent ?? "");
}

function actionsGroup(): HTMLElement {
  const heading = Array.from(document.querySelectorAll("[cmdk-group-heading]")).find((el) => el.textContent === "Acciones");
  if (!heading) throw new Error("no Acciones group");
  return heading.closest("[cmdk-group]") as HTMLElement;
}

const sleep = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  search.searchWorkspaceAction.mockResolvedValue([]);
  time.fetchMyTodayAction.mockResolvedValue({ ...DISABLED_TODAY });
  timeFlags.IMPLEMENTED.clockInAction = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommandPalette shortcut and opening", () => {
  it("opens with ⌘K and Ctrl+K and closes with esc", async () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("dialog");
    expect(screen.getByTestId("state").textContent).toBe("open");

    fireEvent.keyDown(input(), { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("closed"));

    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("open"));
  });

  it("opens from other entry points through openCommandPalette()", async () => {
    render(<Harness />);
    act(() => {
      expect(openCommandPalette()).toBe(true);
    });
    await screen.findByRole("dialog");
  });

  it("shows the placeholder and the footer hints", async () => {
    render(<Harness initialOpen />);
    expect(input()).toBeTruthy();
    const footer = screen.getByTestId("command-palette-footer");
    expect(footer.textContent).toContain("↑↓navegar");
    expect(footer.textContent).toContain("↵abrir");
    expect(footer.textContent).toContain("esccerrar");
  });
});

describe("CommandPalette search", () => {
  it("makes no call under 2 characters and shows the hint plus the actions group", async () => {
    render(<Harness initialOpen />);
    expect(screen.getByText("Escribe al menos 2 letras.")).toBeTruthy();
    expect(groupHeadings()).toEqual(["Acciones"]);

    type("e");
    await sleep(350);
    expect(search.searchWorkspaceAction).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe al menos 2 letras.")).toBeTruthy();

    type("  e  ");
    await sleep(350);
    expect(search.searchWorkspaceAction).not.toHaveBeenCalled();
  });

  it("debounces 200 ms and only searches the last query", async () => {
    render(<Harness initialOpen />);
    type("en");
    type("ens");
    type("ense");
    await sleep(100);
    expect(search.searchWorkspaceAction).not.toHaveBeenCalled();

    await waitFor(() => expect(search.searchWorkspaceAction).toHaveBeenCalledTimes(1));
    expect(search.searchWorkspaceAction).toHaveBeenCalledWith({ query: "ense" });
    expect(screen.queryByText("Escribe al menos 2 letras.")).toBeNull();
  });

  it("groups results by type in a fixed order", async () => {
    search.searchWorkspaceAction.mockResolvedValue(RESULTS);
    render(<Harness initialOpen />);
    type("ensenada");

    await screen.findByText("Juanma");
    expect(groupHeadings()).toEqual(["Proyectos", "Tareas", "Personas", "Archivos", "Notas"]);
    expect(screen.getByTestId("command-palette-footer").textContent).toContain("5 resultados");
  });

  it("opens internal results with the router and Drive files in a new tab", async () => {
    search.searchWorkspaceAction.mockResolvedValue(RESULTS);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<Harness initialOpen />);
    type("ensenada");

    fireEvent.click(await screen.findByText("Medir muro del fondo de cocina"));
    expect(router.push).toHaveBeenCalledWith("/tareas/t1");
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("closed"));

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("dialog");
    type("planta");
    fireEvent.click(await screen.findByText("Ensenada · planta baja corregida.pdf"));
    expect(openSpy).toHaveBeenCalledWith("https://drive.google.com/file/d/f1/view", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("shows the empty line when nothing matches", async () => {
    render(<Harness initialOpen />);
    type("zzzz");
    await screen.findByText("Sin resultados para “zzzz”.");
  });

  it("shows the rate-limit copy and the generic copy", async () => {
    search.searchWorkspaceAction.mockRejectedValueOnce(new Error("RATE_LIMITED"));
    render(<Harness initialOpen />);
    type("ensenada");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.",
    );

    search.searchWorkspaceAction.mockRejectedValueOnce(new Error("boom"));
    type("ensenadas");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No se pudo completar la acción. Intenta de nuevo."),
    );
  });
});

describe("CommandPalette actions group", () => {
  it("filters the actions by the query, accents ignored", async () => {
    render(<Harness initialOpen />);
    const labels = () => within(actionsGroup()).getAllByRole("option").map((o) => o.textContent);
    expect(labels()).toEqual(["Crear tarea", "Nuevo proyecto", "Nueva nota"]);

    type("nota");
    await waitFor(() => expect(labels()).toEqual(["Nueva nota"]));

    type("PROYECTÓ");
    await waitFor(() => expect(labels()).toEqual(["Nuevo proyecto"]));
  });

  it("navigates to the action urls", async () => {
    render(<Harness initialOpen />);
    fireEvent.click(screen.getByText("Crear tarea"));
    expect(router.push).toHaveBeenCalledWith("/tareas?nueva=1");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(await screen.findByText("Nuevo proyecto"));
    expect(router.push).toHaveBeenCalledWith("/proyectos?nuevo=1");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(await screen.findByText("Nueva nota"));
    expect(router.push).toHaveBeenCalledWith("/mi-espacio?nota=nueva");
  });

  it("hides Registrar entrada while fetchMyTodayAction().enabled is false", async () => {
    timeFlags.IMPLEMENTED.clockInAction = true;
    render(<Harness initialOpen />);
    await waitFor(() => expect(time.fetchMyTodayAction).toHaveBeenCalled());
    await sleep(10);
    expect(screen.queryByText("Registrar entrada")).toBeNull();
  });

  it("shows Registrar entrada when enabled and clocks in", async () => {
    timeFlags.IMPLEMENTED.clockInAction = true;
    time.fetchMyTodayAction.mockResolvedValue({ ...DISABLED_TODAY, enabled: true });
    time.clockInAction.mockResolvedValue({
      ...DISABLED_TODAY,
      enabled: true,
      state: "on",
      startedAt: new Date(2026, 10, 6, 9, 2).toISOString(),
    });
    render(<Harness initialOpen />);

    fireEvent.click(await screen.findByText("Registrar entrada"));
    await waitFor(() => expect(time.clockInAction).toHaveBeenCalledWith({ source: "sidebar" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Entrada registrada 9:02"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows clock-in errors as a toast", async () => {
    timeFlags.IMPLEMENTED.clockInAction = true;
    time.fetchMyTodayAction.mockResolvedValue({ ...DISABLED_TODAY, enabled: true });
    time.clockInAction.mockRejectedValue(new Error("boom"));
    render(<Harness initialOpen />);

    fireEvent.click(await screen.findByText("Registrar entrada"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo completar la acción. Intenta de nuevo."));
  });

  it("offers Preguntar al asistente only when the assistant sheet is mounted", async () => {
    const openSheet = vi.fn();
    const unregister = registerShellOpener("assistant", openSheet);
    render(<Harness initialOpen />);
    fireEvent.click(screen.getByText("Preguntar al asistente"));
    expect(openSheet).toHaveBeenCalledTimes(1);
    unregister();

    cleanup();
    render(<Harness initialOpen />);
    expect(screen.queryByText("Preguntar al asistente")).toBeNull();
  });
});

describe("CommandPalette keyboard", () => {
  it("moves with ↑↓ and opens with ↵", async () => {
    render(<Harness initialOpen />);
    const options = () => within(actionsGroup()).getAllByRole("option");
    await waitFor(() => expect(options()[0].getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await waitFor(() => expect(options()[1].getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    await waitFor(() => expect(options()[1].getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/proyectos?nuevo=1");
  });
});

describe("CommandPalette helpers", () => {
  it("groupSearchResults drops empty groups and keeps the server order inside a group", () => {
    const groups = groupSearchResults([
      { type: "tarea", id: "b", title: "B", subtitle: "", url: "/tareas/b" },
      { type: "tarea", id: "a", title: "A", subtitle: "", url: "/tareas/a" },
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["Tareas"]);
    expect(groups[0].items.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("visibleActionIds respects the assistant and clock-in conditions", () => {
    expect(visibleActionIds("", { canAskAssistant: false, canClockIn: false })).toEqual([
      "crear-tarea",
      "nuevo-proyecto",
      "nueva-nota",
    ]);
    expect(visibleActionIds("entrada", { canAskAssistant: true, canClockIn: true })).toEqual(["registrar-entrada"]);
    expect(visibleActionIds("entrada", { canAskAssistant: true, canClockIn: false })).toEqual([]);
  });

  it("gates the Sidebar search entry on the search flag", () => {
    expect(SEARCH_ENTRY_AVAILABLE).toBe(SEARCH_IMPLEMENTED.searchWorkspaceAction);
  });
});
