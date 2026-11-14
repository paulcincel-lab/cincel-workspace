import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/soporte/flags", () => ({
  SOPORTE_ENABLED: true,
  MEJORAS_ENABLED: true,
  SOPORTE_GITHUB_ENABLED: true,
}));

const createTicketActionMock = vi.fn();
vi.mock("@/lib/actions/soporte-actions", () => ({
  createTicketAction: (...args: unknown[]) => createTicketActionMock(...args),
}));

const createGithubIssueMock = vi.fn();
vi.mock("@/lib/github/client", () => ({
  isGithubConfigured: () => true,
  createGithubIssue: (...args: unknown[]) => createGithubIssueMock(...args),
}));

const requireCapabilityUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: () => requireCapabilityUserMock(),
}));

vi.mock("@/lib/actions/contacts-actions", () => ({ fetchContactsAction: vi.fn(), createContactAction: vi.fn(), mergeContactsAction: vi.fn() }));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn(), assignTaskAction: vi.fn(), mergeTasksAction: vi.fn() }));
vi.mock("@/lib/actions/projects-actions", () => ({ createProjectAction: vi.fn(), deleteProjectAction: vi.fn() }));
vi.mock("@/lib/assistant/reads", () => ({ listViewerProjects: vi.fn(), listViewerTasks: vi.fn() }));
vi.mock("@/lib/actions/etapa-start-actions", () => ({ startEtapaAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn() }));

import { LEGACY_CONFIRM_TOOLS } from "@/lib/assistant/approvals";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { buildAssistantTools, create_rfc, makeCreateTicket } from "@/lib/assistant/tools";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

function userWithAccess(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: "1",
      name: "Test",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "test@cincel.mx",
      phone: "",
    },
    email: "test@cincel.mx",
    access,
  };
}

const callOpts = { toolCallId: "t", messages: [] } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tool guard", () => {
  it("offers create_ticket to every staff member but create_rfc only to canManageSupport", () => {
    for (const role of ["Colaborador", "Arquitecto Junior"] as const) {
      const keys = Object.keys(buildAssistantTools(userWithAccess(role)));
      expect(keys).toContain("create_ticket");
      expect(keys).not.toContain("create_rfc");
    }
    const admin = Object.keys(buildAssistantTools(userWithAccess("Administrador")));
    expect(admin).toContain("create_ticket");
    expect(admin).toContain("create_rfc");
  });

  it("asks for confirmation before filing", () => {
    expect(LEGACY_CONFIRM_TOOLS.has("create_ticket")).toBe(true);
    expect(LEGACY_CONFIRM_TOOLS.has("create_rfc")).toBe(true);
  });
});

describe("create_ticket", () => {
  const input = {
    kind: "error" as const,
    title: "Guardar no responde",
    description: "El botón de guardar no hace nada en Tareas.",
    steps: "Abrir una tarea y pulsar Guardar.",
    area: "tareas" as const,
  };

  it("files the solicitud with the area as path and answers with the code and the link", async () => {
    createTicketActionMock.mockResolvedValue({ ok: true, data: { id: "t1", code: "SOP-12" } });
    const out = await makeCreateTicket("/asistente").execute!(input, callOpts);
    expect(createTicketActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "error",
        title: input.title,
        steps: input.steps,
        context: expect.objectContaining({ path: "/tareas" }),
      }),
    );
    expect(out).toEqual({ ok: true, id: "t1", code: "SOP-12", url: "/ajustes/solicitudes" });
  });

  it("falls back to the page the asistente is on and drops steps for non-errors", async () => {
    createTicketActionMock.mockResolvedValue({ ok: true, data: { id: "t2", code: "SOP-13" } });
    await makeCreateTicket("/calendario").execute!({ ...input, kind: "mejora", area: undefined }, callOpts);
    expect(createTicketActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ steps: null, context: expect.objectContaining({ path: "/calendario" }) }),
    );
  });

  it("reports a failed action without throwing", async () => {
    createTicketActionMock.mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    const out = await makeCreateTicket("/asistente").execute!(input, callOpts);
    expect(out).toMatchObject({ ok: false, error: "RATE_LIMITED" });
  });

  it("validates its input", () => {
    const schema = makeCreateTicket("/asistente").inputSchema as unknown as {
      safeParse(v: unknown): { success: boolean };
    };
    expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ ...input, kind: "otro" }).success).toBe(false);
    expect(schema.safeParse({ ...input, title: "ab" }).success).toBe(false);
    expect(schema.safeParse({ ...input, area: "nada" }).success).toBe(false);
  });
});

describe("create_rfc", () => {
  const input = {
    title: "Mover el ELB",
    problem: "El balanceador actual no soporta el nuevo tráfico regional.",
    proposal: "Migrar a un ALB multi-región con failover automático.",
  };

  it("refuses a non-admin and never reaches GitHub or the ticket action", async () => {
    requireCapabilityUserMock.mockResolvedValue(userWithAccess("Colaborador"));
    const out = await create_rfc.execute!(input, callOpts);
    expect(out).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(createTicketActionMock).not.toHaveBeenCalled();
    expect(createGithubIssueMock).not.toHaveBeenCalled();
  });

  it("creates a solicitud for an admin and hands it to the publish dialog, never posting directly", async () => {
    requireCapabilityUserMock.mockResolvedValue(userWithAccess("Administrador"));
    createTicketActionMock.mockResolvedValue({ ok: true, data: { id: "t9", code: "SOP-9" } });
    const out = await create_rfc.execute!(input, callOpts);
    expect(createTicketActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mejora", title: input.title, description: expect.stringContaining(input.problem) }),
    );
    expect(createGithubIssueMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: true, id: "t9", code: "SOP-9", publishTicketId: "t9" });
  });
});

describe("prompt rules and eval", () => {
  it("tells the model to ask for what is missing and never invent the problem", () => {
    const prompt = buildSystemPrompt({
      tools: [{ name: "create_ticket", description: "Registra una solicitud.", write: true }],
    });
    expect(prompt).toContain("create_ticket:");
    expect(prompt).toContain("nunca inventes el problema");
  });

  it("maps 'el botón de guardar no hace nada en Tareas' to kind error and area tareas", async () => {
    const { generateText } = await import("ai");
    const { MockLanguageModelV4 } = await import("ai/test");
    createTicketActionMock.mockResolvedValue({ ok: true, data: { id: "t1", code: "SOP-1" } });
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "create_ticket",
            input: JSON.stringify({
              kind: "error",
              title: "Guardar no hace nada en Tareas",
              description: "El botón de guardar no hace nada en Tareas.",
              area: "tareas",
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool-calls" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      },
    });
    const ticket = makeCreateTicket("/asistente");
    const result = await generateText({
      model,
      tools: { create_ticket: { ...ticket, needsApproval: false } },
      messages: [{ role: "user", content: "el botón de guardar no hace nada en Tareas" }],
    });
    expect(result.toolCalls[0]).toMatchObject({ toolName: "create_ticket", input: { kind: "error", area: "tareas" } });
    expect(createTicketActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error", context: expect.objectContaining({ path: "/tareas" }) }),
    );
  });
});
