// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo, useState } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { UIMessage } from "ai";

import type { AssistantContextStore } from "@/components/asistente/assistant-transport";
import type { ContextChip } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  store: null as AssistantContextStore | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/asistente",
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
// The transport is replaced so the test can read the context the next request would carry.
vi.mock("@/components/asistente/assistant-transport", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/asistente/assistant-transport")>();
  return {
    ...real,
    createAssistantChatTransport: (_api: string, store: AssistantContextStore) => {
      mocks.store = store;
      return {};
    },
  };
});
// useChat is a local state holder: no network.
vi.mock("@ai-sdk/react", async () => {
  const { useState: useLocalState } = await import("react");
  return {
    useChat: (opts: { messages?: UIMessage[] }) => {
      const [messages, setMessages] = useLocalState<UIMessage[]>(opts.messages ?? []);
      return { messages, setMessages, sendMessage: mocks.sendMessage, status: "ready", addToolApprovalResponse: vi.fn() };
    },
  };
});

import { AsistenteVisualLayout } from "@/components/widgets/asistente/AsistenteVisualLayout";
import { renderWithQueryClient } from "@/lib/query/test-utils";

const PROJECT_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const THREADS: AssistantThreadSummary[] = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    title: "Revisión de Oficina Polanco",
    updatedAt: new Date().toISOString(),
    pinnedAt: null,
    pendingApprovals: 0,
    unread: false,
    toolCalls: 0,
  },
];

function Harness({ onNewConversation = vi.fn() }: { onNewConversation?: () => void }) {
  const [chips, setChips] = useState<ContextChip[]>([{ kind: "project", id: PROJECT_ID, label: "Oficina Polanco" }]);
  const context = useMemo<AssistantContext>(
    () => (chips.some((c) => c.kind === "project") ? { route: "/asistente", projectId: PROJECT_ID } : { route: "/asistente" }),
    [chips],
  );
  return (
    <AsistenteVisualLayout
      threads={THREADS}
      activeId={null}
      onSelectThread={vi.fn()}
      onNewConversation={onNewConversation}
      thread={{ id: "cccccccc-0000-4000-8000-000000000001", title: "Nueva conversación", messages: [] }}
      context={context}
      chips={chips}
      onAddChip={(chip) => setChips((prev) => [...prev, chip])}
      onRemoveChip={(chip) => setChips((prev) => prev.filter((c) => c.id !== chip.id))}
      onPinThread={vi.fn()}
      onDeleteThread={vi.fn()}
    />
  );
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText("Mensaje al asistente") as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = null;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("AsistenteVisualLayout", () => {
  it("suggestion send icon sends without touching the draft", async () => {
    renderWithQueryClient(<Harness />);
    fireEvent.change(composer(), { target: { value: "Mi borrador" } });

    const [first] = screen.getAllByRole("button", { name: /^Enviar sugerencia: / });
    const text = first!.getAttribute("aria-label")!.replace("Enviar sugerencia: ", "");
    await act(async () => {
      fireEvent.click(first!);
    });

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text }));
    expect(composer().value).toBe("Mi borrador");
  });

  it("Más ideas fills the composer", async () => {
    renderWithQueryClient(<Harness />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Más ideas/ }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /^Cuantificación/ }));
    });

    expect(composer().value).toBe("Cuantifica el material para ");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("slash at start opens commands", async () => {
    renderWithQueryClient(<Harness />);
    expect(screen.queryByRole("button", { name: /^Mis tareas/ })).toBeNull();

    await act(async () => {
      fireEvent.change(composer(), { target: { value: "/" } });
    });

    expect(await screen.findByRole("button", { name: /^Mis tareas/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cutto" })).toBeTruthy();
  });

  it("chip removal updates the transport context", async () => {
    renderWithQueryClient(<Harness />);
    await act(async () => {});
    expect(mocks.store?.get()).toEqual({ route: "/asistente", projectId: PROJECT_ID });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quitar contexto Oficina Polanco" }));
    });

    expect(screen.queryByRole("button", { name: "Quitar contexto Oficina Polanco" })).toBeNull();
    expect(mocks.store?.get()).toEqual({ route: "/asistente" });
  });

  it("focus stays in the textarea after send", async () => {
    renderWithQueryClient(<Harness />);
    const textarea = composer();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "¿Qué vence hoy?" } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "¿Qué vence hoy?" }));
    expect(composer().value).toBe("");
    expect(document.activeElement).toBe(composer());
  });

  it("Shift+Enter keeps the draft without sending", async () => {
    renderWithQueryClient(<Harness />);
    fireEvent.change(composer(), { target: { value: "Primera línea" } });
    await act(async () => {
      fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("new conversation focuses the textarea", async () => {
    const onNewConversation = vi.fn();
    renderWithQueryClient(<Harness onNewConversation={onNewConversation} />);
    (screen.getByRole("button", { name: /Más ideas/ }) as HTMLElement).focus();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    });

    expect(onNewConversation).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(composer());
  });
});
