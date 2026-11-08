// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";

import type { AssistantThreadSummary } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  flags: {
    fetchAssistantThreadsAction: true,
    fetchAssistantThreadAction: true,
    deleteAssistantThreadAction: true,
    importLegacyAssistantThreadAction: true,
    fetchAssistantActionsAction: true,
  } as Record<string, boolean>,
  replace: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  getSession: vi.fn(),
  fetchThreads: vi.fn(),
  fetchThread: vi.fn(),
  deleteThread: vi.fn(),
  importLegacy: vi.fn(),
  sendMessage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: mocks.redirect,
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/actions/assistant-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: mocks.fetchThreads,
  fetchAssistantThreadAction: mocks.fetchThread,
  deleteAssistantThreadAction: mocks.deleteThread,
  importLegacyAssistantThreadAction: mocks.importLegacy,
  fetchAssistantActionsAction: vi.fn(async () => []),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
// useChat is replaced by a local state holder so the tests never hit the network.
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { messages?: UIMessage[] }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [messages, setMessages] = useState<UIMessage[]>(opts.messages ?? []);
    return { messages, setMessages, sendMessage: mocks.sendMessage, status: "ready", addToolApprovalResponse: vi.fn() };
  },
}));

import AsistentePage from "../page";
import { AsistentePageClient } from "@/components/asistente/AsistentePageClient";
import { asistenteNavItem } from "@/lib/shell/nav-items/asistente";

// Thursday 5 Nov 2026, noon local time.
const NOW = new Date(2026, 10, 5, 12, 0, 0);

function at(year: number, month: number, day: number, hour = 10, minute = 0): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

const THREADS: AssistantThreadSummary[] = [
  { id: "t-hoy", title: "Avance de Local Espinopapa", updatedAt: at(2026, 10, 5, 10, 42) },
  { id: "t-semana", title: "Minuta junta Platzi → tareas", updatedAt: at(2026, 10, 3) },
  { id: "t-lunes", title: "Comparar cotizaciones de cancelería", updatedAt: at(2026, 10, 2, 9) },
  { id: "t-antes", title: "Cronograma remodelación Ensenada", updatedAt: at(2026, 9, 20) },
];

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] } as UIMessage;
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await AsistentePage({ searchParams: Promise.resolve(searchParams) });
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
  for (const key of Object.keys(mocks.flags)) mocks.flags[key] = true;
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.fetchThreads.mockResolvedValue(THREADS);
  mocks.fetchThread.mockImplementation(async (id: string) => {
    if (id === "t-hoy") {
      return {
        thread: { id, title: "Avance de Local Espinopapa", context: { route: "/asistente" }, updatedAt: THREADS[0].updatedAt },
        messages: [
          textMessage("m1", "user", "¿Cómo va Local Espinopapa?"),
          textMessage("m2", "assistant", "Va en 82% y en fase de Construcción."),
        ],
      };
    }
    if (id === "t-semana") {
      return {
        thread: { id, title: "Minuta junta Platzi → tareas", context: { route: "/asistente" }, updatedAt: THREADS[1].updatedAt },
        messages: [textMessage("m3", "assistant", "Creé cinco tareas desde la minuta.")],
      };
    }
    throw new Error("NOT_FOUND");
  });
  mocks.deleteThread.mockResolvedValue(undefined);
  mocks.importLegacy.mockResolvedValue({ id: "t-legacy" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("/asistente history", () => {
  it("groups threads into Hoy, Esta semana and Anteriores", async () => {
    await renderPage();

    const history = screen.getByRole("complementary", { name: "Conversaciones" });
    const headings = within(history).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Hoy", "Esta semana", "Anteriores"]);

    const hoy = within(history).getByRole("region", { name: "Hoy" });
    expect(within(hoy).getByText("Avance de Local Espinopapa")).toBeTruthy();
    expect(within(hoy).getByText("10:42")).toBeTruthy();

    const semana = within(history).getByRole("region", { name: "Esta semana" });
    expect(within(semana).getByText("Minuta junta Platzi → tareas")).toBeTruthy();
    expect(within(semana).getByText("Comparar cotizaciones de cancelería")).toBeTruthy();

    const anteriores = within(history).getByRole("region", { name: "Anteriores" });
    expect(within(anteriores).getByText("Cronograma remodelación Ensenada")).toBeTruthy();
  });

  it("delete removes the thread from the list", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar conversación Minuta junta Platzi → tareas" }));
    });

    expect(mocks.deleteThread).toHaveBeenCalledWith("t-semana");
    expect(screen.queryByText("Minuta junta Platzi → tareas")).toBeNull();
    expect(screen.getByText("Comparar cotizaciones de cancelería")).toBeTruthy();
  });

  it("a failed delete puts the thread back and shows the error copy", async () => {
    mocks.deleteThread.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Eliminar conversación Minuta junta Platzi → tareas" }));
    });

    expect(screen.getByText("Minuta junta Platzi → tareas")).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
  });

  it("?thread=<id> loads that thread and shows its messages", async () => {
    await renderPage({ thread: "t-hoy" });

    expect(mocks.fetchThread).toHaveBeenCalledWith("t-hoy");
    expect(screen.getByText("¿Cómo va Local Espinopapa?")).toBeTruthy();
    expect(screen.getByText("Va en 82% y en fase de Construcción.")).toBeTruthy();
  });

  it("?thread=<id> of a missing thread shows the NOT_FOUND copy and a new conversation", async () => {
    await renderPage({ thread: "t-borrado" });

    expect(screen.getByText("Ya no existe. Recarga la página.")).toBeTruthy();
    expect(screen.getByText("Prueba con una de estas preguntas:")).toBeTruthy();
  });

  it("selecting a thread shows its messages and puts its id in the URL", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Minuta junta Platzi → tareas/ }));
    });

    await waitFor(() => expect(screen.getByText("Creé cinco tareas desde la minuta.")).toBeTruthy());
    expect(mocks.fetchThread).toHaveBeenCalledWith("t-semana");
    expect(mocks.replace).toHaveBeenCalledWith("/asistente?thread=t-semana", { scroll: false });
  });
});

describe("/asistente Herramientas panel", () => {
  it("a tool button puts its starter prompt in the composer without sending", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Cuantificación/ }));
    });

    const composer = screen.getByLabelText("Mensaje al asistente") as HTMLTextAreaElement;
    expect(composer.value).toBe("Cuantifica el material para ");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("draws the Cutto group with its buttons disabled", async () => {
    await renderPage();

    const cutto = screen.getByRole("region", { name: "Cutto" });
    const buttons = within(cutto).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled || button.getAttribute("aria-disabled") === "true").toBe(true);
    }
    const link = within(cutto).getByRole("link", { name: "Abrir en Cutto" });
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("does not render the floating assistant button", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /Pregúntale a Cincel/ })).toBeNull();
  });
});

describe("/asistente session and stubs", () => {
  it("redirects to /login without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(AsistentePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("is a 404 while any assistant-actions flag is false", async () => {
    mocks.flags.fetchAssistantThreadsAction = false;

    await expect(AsistentePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.fetchThreads).not.toHaveBeenCalled();
  });

  it("nav item is present only when every assistant-actions flag is true", async () => {
    const session = { staffId: "s1", name: "Ana", role: "Diseño", isAdmin: false, photoUrl: null };
    const item = await asistenteNavItem.resolve(session);
    expect(item).toMatchObject({ key: "asistente", label: "Asistente", href: "/asistente" });

    mocks.flags.deleteAssistantThreadAction = false;
    expect(await asistenteNavItem.resolve(session)).toBeNull();
  });
});

describe("/asistente and the retired browser thread", () => {
  it("never reads cincel.asistente.thread.v1 nor imports it", async () => {
    window.localStorage.setItem("cincel.asistente.thread.v1", JSON.stringify([textMessage("m1", "user", "Hola de antes")]));
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    render(
      <StrictMode>
        <AsistentePageClient threads={THREADS} initialThread={null} />
      </StrictMode>,
    );
    await act(async () => {});

    expect(getItem.mock.calls.map(([key]) => key)).not.toContain("cincel.asistente.thread.v1");
    expect(mocks.importLegacy).not.toHaveBeenCalled();
    expect(screen.queryByText("Hola de antes")).toBeNull();
    getItem.mockRestore();
  });
});
