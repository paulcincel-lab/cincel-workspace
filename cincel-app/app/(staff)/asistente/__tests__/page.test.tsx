// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";

import type { AsistentePageData, AsistentePageThread } from "@/lib/types/asistente";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  flags: {
    fetchAssistantThreadsAction: true,
    fetchAssistantThreadAction: true,
    deleteAssistantThreadAction: true,
    pinAssistantThreadAction: true,
    markAssistantThreadReadAction: true,
    importLegacyAssistantThreadAction: true,
    fetchAssistantActionsAction: true,
  } as Record<string, boolean>,
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  getSession: vi.fn(),
  requireCapabilityUser: vi.fn(),
  loadPageData: vi.fn(),
  fetchThreads: vi.fn(),
  fetchThread: vi.fn(),
  deleteThread: vi.fn(),
  pinThread: vi.fn(),
  markRead: vi.fn(),
  importLegacy: vi.fn(),
  sendMessage: vi.fn(),
  onFinish: null as null | ((event: { message: UIMessage; messages: UIMessage[] }) => void),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: mocks.redirect,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession, requireCapabilityUser: mocks.requireCapabilityUser }));
vi.mock("@/lib/actions/assistant-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/lib/loaders/asistente", () => ({ loadAsistentePageData: mocks.loadPageData }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: mocks.fetchThreads,
  deleteAssistantThreadAction: mocks.deleteThread,
  pinAssistantThreadAction: mocks.pinThread,
  markAssistantThreadReadAction: mocks.markRead,
  importLegacyAssistantThreadAction: mocks.importLegacy,
  fetchAssistantActionsAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/page-data/asistente-actions", () => ({
  fetchAssistantThreadAction: mocks.fetchThread,
  lookupAssistantContextAction: vi.fn(async () => null),
  getAsistentePageData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
  fetchCatalogContacts: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => []),
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
// useChat is replaced by a local state holder so the tests never hit the network.
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { messages?: UIMessage[]; onFinish?: typeof mocks.onFinish }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [messages, setMessages] = useState<UIMessage[]>(opts.messages ?? []);
    mocks.onFinish = opts.onFinish ?? null;
    return { messages, setMessages, sendMessage: mocks.sendMessage, status: "ready", addToolApprovalResponse: vi.fn() };
  },
}));

import AsistentePage from "../page";
import { AsistentePageClient } from "@/components/asistente/AsistentePageClient";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { asistenteNavItem } from "@/lib/shell/nav-items/asistente";
import { resetAssistantUi, useAssistantUi } from "@/lib/stores/assistant-ui-store";

// Thursday 5 Nov 2026, noon local time.
const NOW = new Date(2026, 10, 5, 12, 0, 0);

function at(year: number, month: number, day: number, hour = 10, minute = 0): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

const T_HOY = "aaaaaaaa-0000-4000-8000-000000000001";
const T_SEMANA = "aaaaaaaa-0000-4000-8000-000000000002";
const T_LUNES = "aaaaaaaa-0000-4000-8000-000000000003";
const T_ANTES = "aaaaaaaa-0000-4000-8000-000000000004";
const T_BORRADO = "aaaaaaaa-0000-4000-8000-0000000000ff";

const STATUS = { pinnedAt: null, pendingApprovals: 0, unread: false };
const THREADS: AssistantThreadSummary[] = [
  { ...STATUS, id: T_HOY, title: "Avance de Local Espinopapa", updatedAt: at(2026, 10, 5, 10, 42), pendingApprovals: 1 },
  { ...STATUS, id: T_SEMANA, title: "Minuta junta Platzi → tareas", updatedAt: at(2026, 10, 3, 9, 15), unread: true },
  { ...STATUS, id: T_LUNES, title: "Comparar cotizaciones de cancelería", updatedAt: at(2026, 10, 2, 9) },
  {
    ...STATUS,
    id: T_ANTES,
    title: "Cronograma remodelación Ensenada",
    updatedAt: at(2026, 9, 20),
    pinnedAt: at(2026, 10, 1),
  },
];

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] } as UIMessage;
}

const STORED: Record<string, AsistentePageThread> = {
  [T_HOY]: {
    id: T_HOY,
    title: "Avance de Local Espinopapa",
    messages: [
      textMessage("m1", "user", "¿Cómo va Local Espinopapa?"),
      textMessage("m2", "assistant", "Va en 82% y en fase de Construcción."),
    ],
  },
  [T_SEMANA]: {
    id: T_SEMANA,
    title: "Minuta junta Platzi → tareas",
    messages: [textMessage("m3", "assistant", "Creé cinco tareas desde la minuta.")],
  },
};

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await AsistentePage({ searchParams: Promise.resolve(searchParams) });
  return renderWithQueryClient(element);
}

const replaceState = vi.spyOn(window.history, "replaceState");

beforeEach(() => {
  vi.clearAllMocks();
  resetAssistantUi();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
  for (const key of Object.keys(mocks.flags)) mocks.flags[key] = true;
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.requireCapabilityUser.mockResolvedValue({ member: { id: "s1" }, access: "Colaborador" });
  mocks.loadPageData.mockImplementation(async (_user: unknown, input: { threadId: string | null }) => {
    const initialThread = input.threadId ? (STORED[input.threadId] ?? null) : null;
    return {
      threads: THREADS,
      initialThread,
      missingThread: input.threadId !== null && initialThread === null,
    } satisfies AsistentePageData;
  });
  mocks.fetchThreads.mockResolvedValue(THREADS);
  mocks.fetchThread.mockImplementation(async (id: string) => STORED[id] ?? null);
  mocks.deleteThread.mockResolvedValue({ ok: true, data: undefined });
  mocks.pinThread.mockImplementation(async ({ id, pinned }: { id: string; pinned: boolean }) => ({
    ...THREADS.find((t) => t.id === id)!,
    pinnedAt: pinned ? NOW.toISOString() : null,
  }));
  mocks.markRead.mockResolvedValue(undefined);
  mocks.importLegacy.mockResolvedValue({ id: "t-legacy" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("/asistente page data", () => {
  it("reads through one page-data load and makes no client fetch on first render", async () => {
    await renderPage({ thread: T_HOY });
    expect(mocks.loadPageData).toHaveBeenCalledTimes(1);
    expect(mocks.loadPageData).toHaveBeenCalledWith(expect.anything(), { threadId: T_HOY });
    await act(async () => {});
    expect(mocks.fetchThreads).not.toHaveBeenCalled();
    expect(mocks.fetchThread).not.toHaveBeenCalled();
  });

  it("a ?thread= that isn't a uuid is missing without a read", async () => {
    await renderPage({ thread: "no-es-uuid" });
    expect(mocks.loadPageData).toHaveBeenCalledWith(expect.anything(), { threadId: null });
    expect(screen.getByText("Ya no existe. Recarga la página.")).toBeTruthy();
  });
});

const EMPTY_TEXT = "Pregunta por tus proyectos y tareas; confirma antes de que cambie algo.";

function rail() {
  return screen.getByRole("complementary", { name: "Conversaciones" });
}

function log() {
  return screen.getByRole("log", { name: "Mensajes" });
}

async function deleteOpenThread() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar conversación" }));
  });
  expect(await screen.findByText("¿Eliminar esta conversación?")).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  });
}

describe("/asistente history", () => {
  it("groups threads into Fijadas and Recientes with their status lines", async () => {
    await renderPage();

    const headings = within(rail()).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Fijadas", "Recientes"]);

    const fijadas = within(rail()).getByRole("region", { name: "Fijadas" });
    expect(within(fijadas).getByText("Cronograma remodelación Ensenada")).toBeTruthy();
    expect(within(fijadas).getByText("20 oct")).toBeTruthy();

    const recientes = within(rail()).getByRole("region", { name: "Recientes" });
    const titles = within(recientes).getAllByRole("link").map((a) => a.textContent);
    expect(titles[0]).toContain("Avance de Local Espinopapa");
    expect(within(recientes).getByText("Confirmación pendiente · 10:42")).toBeTruthy();
    expect(within(recientes).getByText("Nueva respuesta · 09:15")).toBeTruthy();
    expect(within(recientes).getByText("lun 2 nov")).toBeTruthy();
  });

  it("search filters the titles ignoring case and accents", async () => {
    await renderPage();

    fireEvent.change(within(rail()).getByLabelText("Buscar conversaciones"), { target: { value: "REMODELACION" } });
    expect(within(rail()).getAllByRole("link").map((a) => a.textContent)).toEqual([
      expect.stringContaining("Cronograma remodelación Ensenada"),
    ]);

    fireEvent.change(within(rail()).getByLabelText("Buscar conversaciones"), { target: { value: "zzz" } });
    expect(within(rail()).getByText("Sin conversaciones con ese texto.")).toBeTruthy();
  });

  it("pin moves the open thread to Fijadas and saves it", async () => {
    await renderPage({ thread: T_HOY });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fijar conversación" }));
    });

    expect(mocks.pinThread).toHaveBeenCalledWith({ id: T_HOY, pinned: true });
    const fijadas = within(rail()).getByRole("region", { name: "Fijadas" });
    await waitFor(() => expect(within(fijadas).getByText("Avance de Local Espinopapa")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Quitar de fijadas" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opening a thread marks it read", async () => {
    await renderPage({ thread: T_SEMANA });
    await act(async () => {});
    expect(mocks.markRead).toHaveBeenCalledWith({ id: T_SEMANA });
  });

  it("delete from the menu removes the thread optimistically and drops its cache entry", async () => {
    const { client } = await renderPage({ thread: T_SEMANA });

    await deleteOpenThread();

    expect(mocks.deleteThread).toHaveBeenCalledWith(T_SEMANA);
    expect(within(rail()).queryByText("Minuta junta Platzi → tareas")).toBeNull();
    expect(within(rail()).getByText("Comparar cotizaciones de cancelería")).toBeTruthy();
    await waitFor(() => expect(client.getQueryData(qk.asistente.thread(T_SEMANA))).toBeUndefined());
    expect(mocks.fetchThreads).not.toHaveBeenCalled();
  });

  it("a failed delete puts the thread back and shows the error copy", async () => {
    mocks.deleteThread.mockResolvedValueOnce({ ok: false, error: "FORBIDDEN" });
    const { client } = await renderPage({ thread: T_SEMANA });

    await deleteOpenThread();

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(within(rail()).getByText("Minuta junta Platzi → tareas")).toBeTruthy();
    expect(client.getQueryData<AssistantThreadSummary[]>(qk.asistente.threads())?.map((t) => t.id)).toEqual(
      THREADS.map((t) => t.id),
    );
  });

  it("?thread=<id> shows that thread's messages", async () => {
    await renderPage({ thread: T_HOY });

    expect(screen.getByText("¿Cómo va Local Espinopapa?")).toBeTruthy();
    expect(screen.getByText("Va en 82% y en fase de Construcción.")).toBeTruthy();
    expect(useAssistantUi.getState().threadId).toBe(T_HOY);
  });

  it("?thread=<id> of a missing thread shows the NOT_FOUND copy and a new conversation", async () => {
    await renderPage({ thread: T_BORRADO });

    expect(screen.getByText("Ya no existe. Recarga la página.")).toBeTruthy();
    expect(within(log()).getByText(EMPTY_TEXT)).toBeTruthy();
  });

  it("switching threads uses replaceState and the query: one call per uncached thread, none when cached", async () => {
    await renderPage({ thread: T_HOY });
    replaceState.mockClear();

    await act(async () => {
      fireEvent.click(within(rail()).getByRole("link", { name: /^Minuta junta Platzi → tareas/ }));
    });
    await waitFor(() => expect(screen.getByText("Creé cinco tareas desde la minuta.")).toBeTruthy());
    expect(mocks.fetchThread).toHaveBeenCalledTimes(1);
    expect(mocks.fetchThread).toHaveBeenCalledWith(T_SEMANA);
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, "", `/asistente?thread=${T_SEMANA}`);
    expect(useAssistantUi.getState().threadId).toBe(T_SEMANA);

    // Back to the seeded thread: cached, no request.
    await act(async () => {
      fireEvent.click(within(rail()).getByRole("link", { name: /^Avance de Local Espinopapa/ }));
    });
    await waitFor(() => expect(screen.getByText("¿Cómo va Local Espinopapa?")).toBeTruthy());
    expect(mocks.fetchThread).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, "", `/asistente?thread=${T_HOY}`);
    expect(mocks.loadPageData).toHaveBeenCalledTimes(1);
  });

  it("selecting a thread that is gone drops it from the list and shows NOT_FOUND", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(within(rail()).getByRole("link", { name: /^Comparar cotizaciones de cancelería/ }));
    });

    await waitFor(() => expect(screen.getByText("Ya no existe. Recarga la página.")).toBeTruthy());
    expect(within(rail()).queryByText("Comparar cotizaciones de cancelería")).toBeNull();
  });

  it("Nueva conversación clears ?thread= and the store thread", async () => {
    await renderPage({ thread: T_HOY });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    });

    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, "", "/asistente");
    expect(useAssistantUi.getState().threadId).toBeNull();
    expect(within(log()).getByText(EMPTY_TEXT)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Mensaje al asistente"));
  });
});

describe("/asistente finished turn", () => {
  it("prepends the new thread, refetches the list once and invalidates the tool keys", async () => {
    const { client } = await renderPage();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    // The list refetch stays in flight, so the prepended row is what the cache holds meanwhile.
    mocks.fetchThreads.mockReturnValueOnce(new Promise(() => {}));

    const user = textMessage("u1", "user", "Crea una nota de compras");
    const reply = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "tool-create_note", toolCallId: "c1", state: "output-available", input: {}, output: { ok: true } },
        { type: "text", text: "Listo." },
      ],
    } as UIMessage;

    await act(async () => {
      mocks.onFinish?.({ message: reply, messages: [user, reply] });
    });

    const threads = client.getQueryData<AssistantThreadSummary[]>(qk.asistente.threads())!;
    expect(threads[0].title).toBe("Crea una nota de compras");
    const newId = threads[0].id;
    expect(useAssistantUi.getState().threadId).toBe(newId);
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, "", `/asistente?thread=${newId}`);
    expect(client.getQueryData<AsistentePageThread>(qk.asistente.thread(newId))?.messages).toHaveLength(2);

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys.filter((k) => JSON.stringify(k) === JSON.stringify(qk.asistente.threads()))).toHaveLength(1);
    expect(keys).toContainEqual(qk.me.notes());
    await waitFor(() => expect(mocks.fetchThreads).toHaveBeenCalledTimes(1));
  });
});

describe("/asistente starters", () => {
  it("Más ideas puts a starter prompt in the composer without sending", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Más ideas/ }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /^Cuantificación/ }));
    });

    const composer = screen.getByLabelText("Mensaje al asistente") as HTMLTextAreaElement;
    expect(composer.value).toBe("Cuantifica el material para ");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("a suggestion card sends its text right away", async () => {
    await renderPage();

    const [first] = screen.getAllByRole("button", { name: /^Enviar sugerencia: / });
    await act(async () => {
      fireEvent.click(first!);
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "¿Qué entregas vencen esta semana?" }));
  });

  it("draws the Cutto group with its buttons disabled", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Más ideas/ }));
    });

    const cutto = await screen.findByRole("region", { name: "Cutto" });
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
    expect(mocks.loadPageData).not.toHaveBeenCalled();
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
    const client = createTestQueryClient();
    client.setQueryData(qk.asistente.threads(), THREADS);

    renderWithQueryClient(
      <StrictMode>
        <AsistentePageClient threadId={null} />
      </StrictMode>,
      { client },
    );
    await act(async () => {});

    expect(getItem.mock.calls.map(([key]) => key)).not.toContain("cincel.asistente.thread.v1");
    expect(mocks.importLegacy).not.toHaveBeenCalled();
    expect(screen.queryByText("Hola de antes")).toBeNull();
    getItem.mockRestore();
  });
});
