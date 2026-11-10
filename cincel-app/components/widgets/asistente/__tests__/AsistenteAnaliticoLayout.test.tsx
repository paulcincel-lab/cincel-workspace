// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ListIcon } from "lucide-react";

import type { ToolStep, ToolStepGroup } from "@/lib/assistant/tool-steps";
import type { AssistantUIMessage } from "@/lib/types/asistente";
import type { AssistantContext } from "@/lib/types/redesign";

const STEPS: Record<string, ToolStepGroup[]> = {};
vi.mock("@/lib/assistant/tool-steps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/tool-steps")>()),
  toToolSteps: (message: AssistantUIMessage) => STEPS[message.id] ?? [],
}));

const sendMessage = vi.fn();
const addToolApprovalResponse = vi.fn();
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { messages: unknown[] }) => ({
    messages: opts.messages,
    status: "ready",
    sendMessage,
    addToolApprovalResponse,
  }),
}));

const confirmedContext = vi.fn((context: AssistantContext) =>
  context.projectId ? { id: context.projectId, label: "Oficina Polanco" } : null,
);
vi.mock("@/components/asistente/use-confirmed-context", () => ({
  useConfirmedContext: (context: AssistantContext) => confirmedContext(context),
}));

vi.mock("@/components/widgets/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

import { AsistenteAnaliticoLayout, type AsistenteAnaliticoLayoutProps } from "@/components/widgets/asistente/AsistenteAnaliticoLayout";

function step(overrides: Partial<ToolStep>): ToolStep {
  return {
    toolCallId: "c",
    toolName: "list_activities_due",
    state: "done",
    label: "Buscó tareas",
    short: "Tareas vencidas del proyecto",
    running: "Buscando tareas por vencer…",
    icon: ListIcon,
    tone: 1,
    params: [],
    rows: null,
    durationMs: null,
    ...overrides,
  };
}

function text(id: string, role: "user" | "assistant", body: string, metadata?: unknown): AssistantUIMessage {
  return { id, role, parts: [{ type: "text", text: body }], ...(metadata ? { metadata } : {}) } as AssistantUIMessage;
}

const MESSAGES = [
  text("u1", "user", "¿Qué está vencido en Polanco?"),
  text("a1", "assistant", "Hay una tarea vencida."),
  text("u2", "user", "¿Y la carga del equipo?"),
  text("a2", "assistant", "Ana está al 120 %.", { responseMs: 2100, usage: { inputTokens: 3812, outputTokens: 412 } }),
];

const NARROW = "(max-width: 1023px)";
const originalMatchMedia = window.matchMedia;

function setNarrow(narrow: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: narrow && query === NARROW,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderLayout(props: Partial<AsistenteAnaliticoLayoutProps> = {}) {
  return render(
    <AsistenteAnaliticoLayout
      threads={[{ id: "t1", title: "Retrasos Polanco", updatedAt: new Date().toISOString(), pinnedAt: null, pendingApprovals: 0, unread: false, toolCalls: 3 }]}
      thread={{ id: "t1", isNew: false, title: "Retrasos Polanco", messages: MESSAGES }}
      context={{ route: "/asistente" }}
      onNewConversation={vi.fn()}
      onSelectThread={vi.fn()}
      onTurnFinished={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  setNarrow(false);
  STEPS.a1 = [
    {
      kind: "steps",
      totalMs: 400,
      steps: [
        step({
          toolCallId: "s1",
          rows: 1,
          durationMs: 400,
          output: [
            { id: "t1", description: "Planos", workflow: "Diseño", workflowKey: "diseno", workflowSortOrder: 2, commitmentDate: "2026-10-30", manager: "Ana Ruiz", blocked: false },
          ],
        }),
      ],
    },
  ];
  STEPS.a2 = [
    {
      kind: "steps",
      totalMs: 300,
      steps: [
        step({
          toolCallId: "s2",
          toolName: "team_workload_summary",
          short: "Carga del equipo",
          rows: 1,
          durationMs: 300,
          output: [{ name: "Ana Ruiz", activeTasks: 6, occupancyPct: 120, mainWorkflow: "Diseño" }],
        }),
        step({ toolCallId: "s3", toolName: "list_projects", short: "Proyectos", state: "running" }),
      ],
    },
  ];
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
});

function dataPanel(): HTMLElement {
  return screen.getByRole("complementary", { name: "Datos de la respuesta" });
}

describe("AsistenteAnaliticoLayout", () => {
  it("selecting a message updates the data panel", () => {
    renderLayout();
    // Default: the latest answer with steps.
    expect(within(dataPanel()).getAllByText(/carga por persona/).length).toBeGreaterThan(0);
    expect(within(dataPanel()).queryByText(/tareas vencidas/)).toBeNull();

    const box = screen.getByText("1 paso · list_activities_due · 0.4 s · 1 fila").parentElement!;
    fireEvent.click(box);
    expect(box.getAttribute("aria-current")).toBe("true");
    expect(within(dataPanel()).getAllByText(/tareas vencidas/).length).toBeGreaterThan(0);
    expect(within(dataPanel()).queryByText(/carga por persona/)).toBeNull();
    // Selecting moves no focus.
    expect(document.activeElement).not.toBe(box);
  });

  it("footer omits missing metadata", () => {
    renderLayout();
    expect(screen.getAllByText(/^Respuesta en/)).toHaveLength(1);
    expect(screen.getByText("Respuesta en 2.1 s")).toBeTruthy();
    expect(screen.getByText("Tokens 3,812 entrada · 412 salida")).toBeTruthy();
    expect(screen.queryByText(/^Contexto:/)).toBeNull();
    // Thread totals in the conversation header.
    expect(screen.getByText("3 pasos · 0.7 s")).toBeTruthy();
  });

  it("chip click removes the context", () => {
    renderLayout({ context: { route: "/asistente", projectId: "p1" } });
    const chip = screen.getByRole("button", { name: "Quitar contexto Oficina Polanco" });
    expect(chip.textContent).toContain("contexto=Oficina Polanco");
    expect(screen.getAllByText("Contexto: Oficina Polanco").length).toBeGreaterThan(0);

    fireEvent.click(chip);
    expect(screen.queryByRole("button", { name: "Quitar contexto Oficina Polanco" })).toBeNull();
    expect(screen.queryByText("Contexto: Oficina Polanco")).toBeNull();
    expect(confirmedContext).toHaveBeenLastCalledWith({ route: "/asistente" });
  });

  it("390 px tabs switch panels", () => {
    setNarrow(true);
    renderLayout();
    expect(screen.getByRole("tab", { name: "Conversación" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Conversación" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Datos de la respuesta" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));
    expect(dataPanel()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Conversación" })).toBeNull();
    // The rail moves into a sheet opened from the header.
    expect(screen.queryByRole("complementary", { name: "Conversaciones" })).toBeNull();
    expect(screen.getByRole("button", { name: "Conversaciones" })).toBeTruthy();
  });
});
