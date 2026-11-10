// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { UIMessage } from "ai";

import type { AssistantConversation } from "@/components/asistente/use-assistant-conversation";
import { TOOL_STEP_DEFS } from "@/lib/assistant/tool-steps";
import type { AssistantUIMessage } from "@/lib/types/asistente";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

const chat = vi.hoisted(() => ({ current: null as unknown as AssistantConversation }));
vi.mock("@/components/asistente/use-assistant-conversation", () => ({
  useAssistantConversation: () => chat.current,
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));

import { AsistenteEsencialLayout, type AsistenteEsencialLayoutProps } from "@/components/widgets/asistente/AsistenteEsencialLayout";

function conversation(messages: AssistantUIMessage[], overrides: Partial<AssistantConversation> = {}): AssistantConversation {
  return {
    messages,
    status: "ready",
    busy: false,
    error: null,
    clearError: vi.fn(),
    send: vi.fn(() => true),
    approve: vi.fn(),
    pendingApprovalIds: [],
    ...overrides,
  };
}

const THREADS: AssistantThreadSummary[] = [
  { id: "t1", title: "Tareas vencidas de Oficina Polanco", updatedAt: "2026-11-09T16:38:00.000Z", pinnedAt: null, pendingApprovals: 0, unread: false, toolCalls: 0 },
  { id: "t2", title: "Carga del equipo", updatedAt: "2026-11-08T12:00:00.000Z", pinnedAt: null, pendingApprovals: 0, unread: false, toolCalls: 0 },
];

function renderLayout(messages: UIMessage[], props: Partial<AsistenteEsencialLayoutProps> = {}) {
  return render(
    <AsistenteEsencialLayout
      threads={THREADS}
      activeId="t1"
      onSelectThread={vi.fn()}
      onNewConversation={vi.fn()}
      thread={{ id: "t1", title: "Tareas vencidas de Oficina Polanco", messages }}
      context={{ route: "/asistente" }}
      {...props}
    />,
  );
}

const TASKS_OUTPUT = {
  ok: true,
  count: 2,
  tasks: [
    { id: "a1", title: "Plano de cortes", tramo: "Diseño", commitmentDate: "2026-10-20", url: "/tareas?tarea=a1" },
    { id: "a2", title: "Render del lobby", tramo: "Construcción", commitmentDate: "2026-11-06", url: "/tareas?tarea=a2" },
  ],
};

function toolDone(id: string, toolName = "list_my_tasks"): UIMessage["parts"][number] {
  return { type: `tool-${toolName}`, toolCallId: id, state: "output-available", input: { due: "vencidas" }, output: TASKS_OUTPUT } as never;
}

function assistant(id: string, parts: UIMessage["parts"]): AssistantUIMessage {
  return { id, role: "assistant", parts } as AssistantUIMessage;
}

function user(id: string, text: string): AssistantUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] } as AssistantUIMessage;
}

beforeEach(() => {
  chat.current = conversation([]);
});
afterEach(cleanup);

describe("AsistenteEsencialLayout", () => {
  it("compact steps line pluralizes and toggles", () => {
    chat.current = conversation([
      user("u1", "¿Qué tengo vencido?"),
      assistant("m1", [toolDone("c1"), toolDone("c2"), { type: "text", text: "Tienes 2 tareas vencidas." }]),
    ]);
    const { unmount } = renderLayout(chat.current.messages);
    const toggle = screen.getByRole("button", { name: /Usó 2 herramientas/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Ver");

    fireEvent.click(toggle);
    const open = screen.getByRole("button", { name: /Usó 2 herramientas/ });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(open.textContent).toContain("Ocultar");
    unmount();

    chat.current = conversation([assistant("m2", [toolDone("c3"), { type: "text", text: "Listo." }])]);
    renderLayout(chat.current.messages);
    expect(screen.getByRole("button", { name: /Usó 1 herramienta\b/ })).toBeTruthy();
  });

  it("running label replaces the line while a tool runs", () => {
    chat.current = conversation(
      [
        user("u1", "¿Qué tengo vencido?"),
        assistant("m1", [{ type: "tool-list_my_tasks", toolCallId: "c1", state: "input-available", input: { due: "vencidas" } } as never]),
      ],
      { status: "streaming", busy: true },
    );
    renderLayout(chat.current.messages);
    const log = screen.getByRole("log", { name: "Mensajes" });
    expect(within(log).getByText(TOOL_STEP_DEFS.list_my_tasks.running)).toBeTruthy();
    expect(within(log).queryByText(/Usó \d+ herramienta/)).toBeNull();
  });

  it("task lists show tramo dot, title link and colored lateness", () => {
    chat.current = conversation([assistant("m1", [toolDone("c1"), { type: "text", text: "Estas son." }])]);
    renderLayout(chat.current.messages);
    const list = screen.getByRole("list", { name: "Tareas" });
    const link = within(list).getByRole("link", { name: /Plano de cortes/ });
    expect(link.getAttribute("href")).toBe("/tareas?tarea=a1");
    expect(within(list).getAllByText(/\d+ d tarde/).length).toBeGreaterThan(0);
  });

  it("confirmation answers all ids", () => {
    const approval = (n: number) =>
      ({
        type: "tool-create_task",
        toolCallId: `c${n}`,
        state: "approval-requested",
        input: { description: `Revisión ${n}`, commitmentDate: "2026-11-13", projectName: "Oficina Polanco" },
        approval: { id: `ap-${n}` },
      }) as never;
    chat.current = conversation([assistant("m1", [approval(1), approval(2), approval(3)])]);
    renderLayout(chat.current.messages);

    const group = screen.getByRole("group", { name: /^¿Creo 3 tareas/ });
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar" }));
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar" }));
    expect(chat.current.approve).toHaveBeenCalledTimes(1);
    expect(chat.current.approve).toHaveBeenCalledWith(["ap-1", "ap-2", "ap-3"], true);
  });

  it("empty thread shows example questions that fill the composer", () => {
    renderLayout([]);
    const examples = screen.getByRole("list", { name: "Preguntas de ejemplo" });
    const buttons = within(examples).getAllByRole("button");
    expect(buttons.length).toBeLessThanOrEqual(4);
    const text = buttons[0].textContent ?? "";
    fireEvent.click(buttons[0]);
    expect((screen.getByLabelText("Mensaje al asistente") as HTMLTextAreaElement).value).toBe(text);
    expect(chat.current.send).not.toHaveBeenCalled();
  });

  it("focus stays in the textarea after send", async () => {
    renderLayout([]);
    const textarea = screen.getByLabelText("Mensaje al asistente") as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "¿Quién está saturado?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await vi.waitFor(() => expect(chat.current.send).toHaveBeenCalledWith({ text: "¿Quién está saturado?", files: undefined }));
    await vi.waitFor(() => expect(textarea.value).toBe(""));
    expect(document.activeElement).toBe(textarea);
  });

  it("thread list is links with the open one marked current", () => {
    renderLayout([]);
    const nav = screen.getAllByRole("complementary", { name: "Conversaciones" })[0];
    const current = within(nav).getByRole("link", { name: "Tareas vencidas de Oficina Polanco" });
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Carga del equipo" }).getAttribute("aria-current")).toBeNull();
  });
});
