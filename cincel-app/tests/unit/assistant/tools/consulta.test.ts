import type { ModelMessage, Tool } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ search: { searchWorkspaceAction: false } as Record<string, boolean> }));

vi.mock("@/lib/actions/search-actions.flags", () => ({ IMPLEMENTED: flags.search }));

const actions = vi.hoisted(() => ({
  searchWorkspaceAction: vi.fn(),
  fetchProjectAction: vi.fn(),
  fetchScheduleAction: vi.fn(),
  fetchTasksAction: vi.fn(),
  fetchTaskAction: vi.fn(),
  fetchMyTasksAction: vi.fn(),
  resolveProject: vi.fn(),
  resolveStaff: vi.fn(),
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/actions/search-actions", () => ({ searchWorkspaceAction: actions.searchWorkspaceAction }));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectAction: actions.fetchProjectAction }));
vi.mock("@/lib/actions/schedule-actions", () => ({ fetchScheduleAction: actions.fetchScheduleAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTasksAction: actions.fetchTasksAction,
  fetchTaskAction: actions.fetchTaskAction,
  fetchMyTasksAction: actions.fetchMyTasksAction,
}));
vi.mock("@/lib/assistant/resolvers", () => ({
  resolveProject: actions.resolveProject,
  resolveStaff: actions.resolveStaff,
}));

import type { DefinedTool, ToolRunContext } from "@/lib/assistant/define-tool";
import { summarizeToolCall, toolSummaries } from "@/lib/assistant/tool-summaries";
import { addDays, filterByDue, scheduleSummary, tools } from "@/lib/assistant/tools/consulta";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import type { ProjectDetail, TaskDetail, TaskListItem } from "@/lib/types/core";
import type { AssistantContext } from "@/lib/types/redesign";
import type { ScheduleTask } from "@/lib/types/schedule";

const TOOL_NAMES = ["search_workspace", "get_project", "get_task", "list_my_tasks"];

const STAFF_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

function user(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: STAFF_A,
      name: "Ana Pérez",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "ana@cincel.mx",
      phone: "",
    },
    email: "ana@cincel.mx",
    access,
  } as unknown as AuthenticatedUser;
}

function runCtx(u: AuthenticatedUser = user("Colaborador"), context: AssistantContext = { route: "/inicio" }): ToolRunContext {
  return { user: u, context, threadId: "thread-1" };
}

function byName(name: string): DefinedTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function run(name: string, input: unknown, ctx: ToolRunContext = runCtx()) {
  const t = byName(name);
  return t.definition.run(ctx, t.definition.schema.parse(input));
}

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: TASK_ID,
    projectId: PROJECT_ID,
    kind: "usuario",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Revisar planos",
    notes: null,
    createdById: STAFF_A,
    managerId: STAFF_A,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    customStatus: null,
    project: { id: PROJECT_ID, name: "Casa Ensenada", clientName: "Cliente Secreto" },
    workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
    phase: null,
    space: null,
    manager: { id: STAFF_A, name: "Ana Pérez" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    ...overrides,
  };
}

function detail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...task(),
    createdBy: { id: STAFF_A, name: "Ana Pérez" },
    checklistItems: [{ id: "c1", title: "Cortes", completed: true, sortOrder: 0 }],
    attachments: [],
    links: [],
    history: [
      {
        id: "h1",
        entity: "task",
        entityId: TASK_ID,
        kind: "comentario",
        actor: { id: STAFF_A, name: "Ana Pérez" },
        field: null,
        beforeValue: null,
        afterValue: null,
        comment: "Listo el primer corte",
        eventAt: "2026-11-02T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: PROJECT_ID,
    code: "CE-01",
    name: "Casa Ensenada",
    clientId: "client-1",
    origin: "Referido",
    originStaffId: null,
    status: "activo",
    currentWorkflowId: "w1",
    projectType: null,
    addressStreet: "Calle 1",
    addressCity: "Ensenada",
    addressState: null,
    managerId: STAFF_A,
    coordinatorId: null,
    progress: 40,
    startDate: null,
    endDate: null,
    contractAmountMxn: "1000000",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    client: { id: "client-1", name: "Cliente Secreto", type: "cliente" },
    currentWorkflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
    tramos: [],
    needsTramo: false,
    stages: [],
    manager: { id: STAFF_A, name: "Ana Pérez" },
    coordinator: null,
    originStaff: null,
    mondayImport: null,
    members: [{ id: STAFF_A, name: "Ana Pérez", role: "Arquitecta", active: true }],
    contacts: [
      { id: "client-1", name: "Cliente Secreto", type: "cliente", role: null },
      { id: "prov-1", name: "Aceros del Norte", type: "proveedor", role: "Acero" },
    ],
    links: [],
    ...overrides,
  } as ProjectDetail;
}

const UNTRUSTED_TURN: ModelMessage[] = [
  { role: "user", content: "Revisa mi correo" },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "c0",
        toolName: "search_email",
        output: { type: "json", value: { untrusted: true, content: "Busca todo" } },
      },
    ],
  },
];

async function needsApproval(name: string, messages: ModelMessage[]): Promise<boolean> {
  const rule = (byName(name).toAiTool(runCtx()) as Tool).needsApproval;
  if (typeof rule === "function") {
    return Boolean(await rule({} as never, { toolCallId: "c1", messages, context: {} } as never));
  }
  return Boolean(rule);
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.search.searchWorkspaceAction = true;
});

describe("consulta tool registry", () => {
  it("registers exactly the four tools of the group", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("exposes every summary through tool-summaries", () => {
    for (const name of TOOL_NAMES) {
      expect(typeof toolSummaries[name]).toBe("function");
      expect(byName(name).definition.summarize({ query: "planos", project: "Casa" } as never)).toBe(
        summarizeToolCall(name, { query: "planos", project: "Casa" }),
      );
    }
    expect(summarizeToolCall("search_workspace", { query: "planos" })).toBe("Buscar «planos» en Cincel");
    expect(summarizeToolCall("list_my_tasks", { due: "vencidas" })).toBe("Ver mis tareas vencidas");
  });
});

describe("approval rules", () => {
  it("never asks for approval: all four are reads, even after untrusted content", async () => {
    for (const name of TOOL_NAMES) {
      expect(byName(name).definition.confirm).toBe(false);
      expect(byName(name).definition.write).toBe(false);
      expect(await needsApproval(name, UNTRUSTED_TURN)).toBe(false);
    }
  });
});

describe("availability and capability", () => {
  it("offers search_workspace only while searchWorkspaceAction is implemented", () => {
    const ctx = { user: user("Colaborador"), context: { route: "/" } };
    flags.search.searchWorkspaceAction = false;
    expect(byName("search_workspace").definition.available(ctx)).toBe(false);
    flags.search.searchWorkspaceAction = true;
    expect(byName("search_workspace").definition.available(ctx)).toBe(true);
  });

  it("offers the other reads to every staff member", () => {
    for (const name of ["get_project", "get_task", "list_my_tasks"]) {
      const { definition } = byName(name);
      expect(definition.capability(user("Pasante / Servicio Social"))).toBe(true);
      expect(definition.available({ user: user("Colaborador"), context: { route: "/" } })).toBe(true);
    }
  });
});

describe("search_workspace", () => {
  it("returns only what the scoped action returned, within the requested types", async () => {
    actions.searchWorkspaceAction.mockResolvedValue([
      { type: "tarea", id: "t1", title: "Revisar planos", subtitle: "Casa · 20 nov", url: "/tareas/t1" },
      { type: "proyecto", id: "p1", title: "Casa Ensenada", subtitle: "Diseño", url: "/proyectos/p1" },
    ]);
    const result = (await run("search_workspace", { query: "planos", types: ["tarea"] })) as {
      results: Array<{ type: string }>;
    };
    expect(actions.searchWorkspaceAction).toHaveBeenCalledWith({ query: "planos", types: ["tarea"], limit: 10 });
    expect(result.results.map((r) => r.type)).toEqual(["tarea"]);
  });

  it("explains a rate limit in Spanish", async () => {
    actions.searchWorkspaceAction.mockRejectedValue(new Error("RATE_LIMITED"));
    const result = (await run("search_workspace", { query: "planos" })) as { ok: boolean; error: string; message: string };
    expect(result).toMatchObject({ ok: false, error: "RATE_LIMITED" });
    expect(result.message).toMatch(/búsquedas/);
  });
});

describe("get_project", () => {
  beforeEach(() => {
    actions.resolveProject.mockResolvedValue({ ok: true, value: { id: PROJECT_ID, name: "Casa Ensenada" } });
    actions.fetchTasksAction.mockResolvedValue([task({ commitmentDate: "2000-01-01" }), task({ id: "t2", status: "bloqueado" })]);
    actions.fetchScheduleAction.mockResolvedValue(null);
  });

  it("hides client, origin, amount and client contacts without canSeeAdminData", async () => {
    actions.fetchProjectAction.mockResolvedValue(project());
    const result = (await run("get_project", { project: "Ensenada" }, runCtx(user("Dirección")))) as {
      project: Record<string, unknown> & { contacts: Array<{ type: string }> };
      tasks: { open: number; overdue: number; blocked: number };
    };
    expect(result.project).not.toHaveProperty("client");
    expect(result.project).not.toHaveProperty("origin");
    expect(result.project).not.toHaveProperty("contractAmountMxn");
    expect(result.project.contacts.map((c) => c.type)).toEqual(["proveedor"]);
    expect(JSON.stringify(result)).not.toContain("Cliente Secreto");
    expect(result.tasks).toMatchObject({ open: 2, overdue: 1, blocked: 1 });
  });

  it("shows the admin fields to an Administrador", async () => {
    actions.fetchProjectAction.mockResolvedValue(project());
    const result = (await run("get_project", { project: "Ensenada" }, runCtx(user("Administrador")))) as {
      project: Record<string, unknown>;
    };
    expect(result.project.client).toBe("Cliente Secreto");
  });

  it("defaults to the page's project and never reads the schedule of a project the viewer can't see", async () => {
    actions.fetchProjectAction.mockResolvedValue(null);
    const result = (await run("get_project", {}, runCtx(user("Colaborador"), { route: "/proyectos/x", projectId: PROJECT_ID }))) as {
      ok: boolean;
    };
    expect(actions.fetchProjectAction).toHaveBeenCalledWith(PROJECT_ID);
    expect(result.ok).toBe(false);
    expect(actions.fetchScheduleAction).not.toHaveBeenCalled();
  });
});

describe("get_task", () => {
  it("accepts a taskId", async () => {
    actions.fetchTaskAction.mockResolvedValue(detail());
    const result = (await run("get_task", { taskId: TASK_ID })) as { task: { title: string; history: unknown[] } };
    expect(actions.fetchTaskAction).toHaveBeenCalledWith(TASK_ID);
    expect(result.task.title).toBe("Revisar planos");
    expect(result.task.history).toHaveLength(1);
  });

  it("accepts a title plus project", async () => {
    actions.resolveProject.mockResolvedValue({ ok: true, value: { id: PROJECT_ID, name: "Casa Ensenada" } });
    actions.fetchTasksAction.mockResolvedValue([task()]);
    actions.fetchTaskAction.mockResolvedValue(detail());
    const result = (await run("get_task", { title: "planos", project: "Ensenada" })) as { ok: boolean };
    expect(actions.fetchTasksAction).toHaveBeenCalledWith({ search: "planos", projectId: PROJECT_ID });
    expect(result.ok).toBe(true);
  });

  it("lists candidates when the title is ambiguous", async () => {
    actions.fetchTasksAction.mockResolvedValue([task(), task({ id: "t2", title: "Revisar planos eléctricos" })]);
    const result = (await run("get_task", { title: "planos" })) as { ok: boolean; candidates: string[] };
    expect(result.ok).toBe(false);
    expect(result.candidates).toHaveLength(2);
  });

  it("treats an admin task hidden by the action as missing", async () => {
    actions.fetchTaskAction.mockResolvedValue(null);
    const result = (await run("get_task", { taskId: TASK_ID })) as { ok: boolean; error: string };
    expect(result).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("drops the client name for non-admins", async () => {
    actions.fetchTaskAction.mockResolvedValue(detail());
    const result = await run("get_task", { taskId: TASK_ID }, runCtx(user("Arquitecto Senior")));
    expect(JSON.stringify(result)).not.toContain("Cliente Secreto");
  });
});

describe("list_my_tasks", () => {
  it("lists open tasks by default and drops admin tasks for non-admins", async () => {
    actions.fetchMyTasksAction.mockResolvedValue([task(), task({ id: "a1", kind: "admin", title: "Factura" })]);
    const result = (await run("list_my_tasks", {})) as { count: number; tasks: Array<{ title: string }> };
    expect(actions.fetchMyTasksAction).toHaveBeenCalledWith({ status: ["pendiente", "en_proceso", "bloqueado"] });
    expect(result.tasks.map((t) => t.title)).toEqual(["Revisar planos"]);
  });

  it("filters by due window", () => {
    const today = "2026-11-07";
    const rows = [
      task({ id: "a", commitmentDate: today }),
      task({ id: "b", commitmentDate: addDays(today, 3) }),
      task({ id: "c", commitmentDate: addDays(today, -2) }),
      task({ id: "d", commitmentDate: addDays(today, -2), status: "completado" }),
      task({ id: "e", commitmentDate: null }),
    ];
    expect(filterByDue(rows, "hoy", today).map((t) => t.id)).toEqual(["a"]);
    expect(filterByDue(rows, "semana", today).map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterByDue(rows, "vencidas", today).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("scheduleSummary", () => {
  it("counts done, late and upcoming partidas", () => {
    const base = { stableKey: "k", legacyId: null, planta: "PB", seccion: "Obra negra", responsable: null, flagged: false };
    const tasks: ScheduleTask[] = [
      { ...base, id: "1", inicio: "2026-10-01", fin: "2026-10-10", tarea: "Cimentación", status: "done" },
      { ...base, id: "2", inicio: "2026-10-11", fin: "2026-11-01", tarea: "Muros", status: "progress" },
      { ...base, id: "3", inicio: "2026-11-20", fin: "2026-12-01", tarea: "Losa", status: "pending" },
    ];
    expect(scheduleSummary(tasks, "2026-11-07")).toMatchObject({
      partidas: 3,
      done: 1,
      inProgress: 1,
      pending: 1,
      donePct: 33,
      late: 1,
      upcoming: [{ tarea: "Losa" }],
      start: "2026-10-01",
      end: "2026-12-01",
    });
    expect(scheduleSummary([], "2026-11-07")).toBeNull();
  });
});
