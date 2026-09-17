import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

const isGithubConfiguredMock = vi.fn();
const createGithubIssueMock = vi.fn();
vi.mock("@/lib/github/client", () => ({
  isGithubConfigured: () => isGithubConfiguredMock(),
  createGithubIssue: (...args: unknown[]) => createGithubIssueMock(...args),
}));

const fetchContactsActionMock = vi.fn();
const mergeContactsActionMock = vi.fn();
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactsAction: (...args: unknown[]) => fetchContactsActionMock(...args),
  createContactAction: vi.fn(),
  mergeContactsAction: (...args: unknown[]) => mergeContactsActionMock(...args),
}));

const fetchTasksActionMock = vi.fn();
const mergeTasksActionMock = vi.fn();
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTasksAction: (...args: unknown[]) => fetchTasksActionMock(...args),
  createUserTaskAction: vi.fn(),
  assignTaskAction: vi.fn(),
  mergeTasksAction: (...args: unknown[]) => mergeTasksActionMock(...args),
}));

const fetchProjectsActionMock = vi.fn();
vi.mock("@/lib/actions/projects-actions", () => ({
  fetchProjectsAction: (...args: unknown[]) => fetchProjectsActionMock(...args),
  createProjectAction: vi.fn(),
  applyWorkflowAction: vi.fn(),
  deleteProjectAction: vi.fn(),
}));

const fetchWorkflowsActionMock = vi.fn();
vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchWorkflowsAction: (...args: unknown[]) => fetchWorkflowsActionMock(...args),
}));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import {
  list_projects,
  list_activities_due,
  team_workload_summary,
  render_chart,
  render_card,
  render_stat_grid,
  render_list,
  create_client,
  onboard_client,
  create_rfc,
  merge_duplicate_clients,
  merge_duplicate_activities,
  ASSISTANT_TOOLS,
  buildAssistantTools,
} from "./tools";

function parse<T>(schema: unknown, data: unknown) {
  return (schema as z.ZodType<T>).safeParse(data);
}

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

const READ_TOOLS = [
  "list_activities_due",
  "list_projects",
  "render_card",
  "render_chart",
  "render_list",
  "render_stat_grid",
  "team_workload_summary",
];

describe("ASSISTANT_TOOLS", () => {
  it("exposes exactly the seven read/render tools", () => {
    expect(Object.keys(ASSISTANT_TOOLS).sort()).toEqual(READ_TOOLS);
  });
});

describe("buildAssistantTools", () => {
  it("gives Administrador every read and write tool", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Administrador"))).sort();
    expect(keys).toEqual(
      [
        ...READ_TOOLS,
        "assign_task",
        "create_task",
        "create_rfc",
        "create_client",
        "onboard_client",
        "find_duplicates",
        "merge_duplicate_clients",
        "merge_duplicate_activities",
        "discard_project",
      ].sort()
    );
  });

  it("gives Colaborador create_task + create_rfc + find_duplicates but no merge/client tools", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Colaborador"))).sort();
    expect(keys).toEqual([...READ_TOOLS, "create_task", "create_rfc", "find_duplicates"].sort());
  });

  it("gives Arquitecto Junior create_task + create_rfc + find_duplicates but not the rest", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Arquitecto Junior")));
    expect(keys).toEqual(expect.arrayContaining(["create_task", "create_rfc", "find_duplicates"]));
    expect(keys).not.toContain("assign_task");
    expect(keys).not.toContain("create_client");
    expect(keys).not.toContain("merge_duplicate_clients");
  });

  it("gives Arquitecto Senior the client tools but not the destructive merges", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Arquitecto Senior")));
    expect(keys).toEqual(
      expect.arrayContaining(["assign_task", "create_client", "onboard_client", "find_duplicates"])
    );
    expect(keys).not.toContain("merge_duplicate_clients");
    expect(keys).not.toContain("merge_duplicate_activities");
    expect(keys).not.toContain("discard_project");
  });

  it("gives Dirección the destructive merge tools", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Dirección")));
    expect(keys).toEqual(
      expect.arrayContaining(["merge_duplicate_clients", "merge_duplicate_activities", "discard_project"])
    );
  });

  it("falls back to the default role for a null user", () => {
    const keys = Object.keys(buildAssistantTools(null));
    expect(keys).toEqual(expect.arrayContaining(READ_TOOLS));
  });
});

describe("list_projects schema", () => {
  it("defaults activeOnly to true", () => {
    const r = parse<{ activeOnly: boolean }>(list_projects.inputSchema, {});
    expect(r.success && r.data.activeOnly).toBe(true);
  });

  it("accepts optional stage / status strings", () => {
    expect(
      parse(list_projects.inputSchema, { stage: "Diseño", status: "Activo" }).success
    ).toBe(true);
  });

  it("rejects a non-boolean activeOnly", () => {
    expect(parse(list_projects.inputSchema, { activeOnly: "yes" }).success).toBe(false);
  });
});

describe("list_activities_due schema", () => {
  it("defaults withinDays to 7 and onlyBlocked to false", () => {
    const r = parse<{ withinDays: number; onlyBlocked: boolean }>(
      list_activities_due.inputSchema,
      {}
    );
    expect(r.success && r.data.withinDays).toBe(7);
    expect(r.success && r.data.onlyBlocked).toBe(false);
  });

  it("accepts an optional projectName", () => {
    const r = parse<{ projectName?: string }>(list_activities_due.inputSchema, {
      projectName: "Casa Roma",
    });
    expect(r.success && r.data.projectName).toBe("Casa Roma");
  });

  it("rejects withinDays outside 1..60", () => {
    expect(parse(list_activities_due.inputSchema, { withinDays: 0 }).success).toBe(false);
    expect(parse(list_activities_due.inputSchema, { withinDays: 61 }).success).toBe(false);
    expect(parse(list_activities_due.inputSchema, { withinDays: 3.5 }).success).toBe(false);
  });
});

describe("create_client / onboard_client schema", () => {
  it("create_client defaults kind to Particular and requires a name", () => {
    const r = parse<{ kind: string }>(create_client.inputSchema, { name: "Acme" });
    expect(r.success && r.data.kind).toBe("Particular");
    expect(parse(create_client.inputSchema, {}).success).toBe(false);
  });

  it("onboard_client defaults workflow to Presale and requires client + project", () => {
    const r = parse<{ workflow: string }>(onboard_client.inputSchema, {
      name: "Acme",
      projectName: "Casa Roma",
    });
    expect(r.success && r.data.workflow).toBe("presale");
    expect(parse(onboard_client.inputSchema, { name: "Acme" }).success).toBe(false);
  });

  it("onboard_client caps extraTasks at 20", () => {
    const extraTasks = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(
      parse(onboard_client.inputSchema, {
        name: "Acme",
        projectName: "Casa Roma",
        extraTasks,
      }).success
    ).toBe(false);
  });
});

describe("create_rfc", () => {
  const validInput = {
    title: "Mover el ELB",
    problem: "El balanceador actual no soporta el nuevo tráfico regional.",
    proposal: "Migrar a un ALB multi-región con failover automático.",
  };

  it("requires title/problem/proposal with minimum lengths", () => {
    expect(parse(create_rfc.inputSchema, validInput).success).toBe(true);
    expect(parse(create_rfc.inputSchema, { ...validInput, title: "ab" }).success).toBe(false);
    expect(parse(create_rfc.inputSchema, { ...validInput, problem: "short" }).success).toBe(false);
    expect(parse(create_rfc.inputSchema, { ...validInput, proposal: "short" }).success).toBe(false);
  });

  it("caps extra labels at 5", () => {
    const labels = Array.from({ length: 6 }, (_, i) => `l${i}`);
    expect(parse(create_rfc.inputSchema, { ...validInput, labels }).success).toBe(false);
  });

  it("returns ok:false without calling GitHub when unconfigured", async () => {
    isGithubConfiguredMock.mockReturnValue(false);
    const out = await create_rfc.execute!(validInput, { toolCallId: "t", messages: [] } as never);
    expect(out).toEqual({ ok: false, error: expect.stringContaining("GitHub no está configurado") });
    expect(createGithubIssueMock).not.toHaveBeenCalled();
  });

  it("creates a labeled issue and returns its number/url when configured", async () => {
    isGithubConfiguredMock.mockReturnValue(true);
    createGithubIssueMock.mockResolvedValue({ number: 42, url: "https://github.com/o/r/issues/42" });

    const out = await create_rfc.execute!(validInput, { toolCallId: "t", messages: [] } as never);

    expect(createGithubIssueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: `[RFC] ${validInput.title}`,
        labels: ["rfc"],
      })
    );
    expect(out).toEqual({ ok: true, number: 42, url: "https://github.com/o/r/issues/42" });
  });
});

describe("team_workload_summary schema", () => {
  it("takes no input", () => {
    expect(parse(team_workload_summary.inputSchema, {}).success).toBe(true);
  });
});

describe("render_chart", () => {
  it("rejects more than 30 data points", () => {
    const data = Array.from({ length: 31 }, (_, i) => ({ label: `L${i}`, value: i }));
    expect(
      parse(render_chart.inputSchema, { chartType: "bar", title: "x", data }).success
    ).toBe(false);
  });

  it("rejects an unknown chartType", () => {
    expect(
      parse(render_chart.inputSchema, { chartType: "pie", title: "x", data: [] }).success
    ).toBe(false);
  });

  it("execute is a no-op that returns { ok: true }", async () => {
    const out = await render_chart.execute!(
      { chartType: "bar", title: "x", data: [] },
      { toolCallId: "t", messages: [] } as never
    );
    expect(out).toEqual({ ok: true });
  });
});

describe("render_card", () => {
  it("accepts a title-only card with no fields or badge", () => {
    expect(parse(render_card.inputSchema, { title: "Ensenada", fields: [] }).success).toBe(
      true
    );
  });

  it("accepts a badge with a valid tone", () => {
    expect(
      parse(render_card.inputSchema, {
        title: "Ensenada",
        fields: [{ label: "Avance", value: "62%" }],
        badge: { label: "Riesgo alto", tone: "critical" },
      }).success
    ).toBe(true);
  });

  it("rejects an unknown badge tone", () => {
    expect(
      parse(render_card.inputSchema, {
        title: "Ensenada",
        fields: [],
        badge: { label: "x", tone: "danger" },
      }).success
    ).toBe(false);
  });

  it("rejects more than 10 fields", () => {
    const fields = Array.from({ length: 11 }, (_, i) => ({ label: `L${i}`, value: "x" }));
    expect(parse(render_card.inputSchema, { title: "x", fields }).success).toBe(false);
  });

  it("execute is a no-op that returns { ok: true }", async () => {
    const out = await render_card.execute!(
      { title: "x", fields: [] },
      { toolCallId: "t", messages: [] } as never
    );
    expect(out).toEqual({ ok: true });
  });
});

describe("render_stat_grid", () => {
  it("accepts an optional title and up to 6 stats", () => {
    const stats = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: "1" }));
    expect(parse(render_stat_grid.inputSchema, { stats }).success).toBe(true);
  });

  it("rejects more than 6 stats", () => {
    const stats = Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: "1" }));
    expect(parse(render_stat_grid.inputSchema, { stats }).success).toBe(false);
  });

  it("execute is a no-op that returns { ok: true }", async () => {
    const out = await render_stat_grid.execute!(
      { stats: [] },
      { toolCallId: "t", messages: [] } as never
    );
    expect(out).toEqual({ ok: true });
  });
});

describe("render_list", () => {
  it("requires at least one item", () => {
    expect(parse(render_list.inputSchema, { title: "x", items: [] }).success).toBe(false);
  });

  it("rejects more than 20 items", () => {
    const items = Array.from({ length: 21 }, (_, i) => `item ${i}`);
    expect(parse(render_list.inputSchema, { title: "x", items }).success).toBe(false);
  });

  it("execute is a no-op that returns { ok: true }", async () => {
    const out = await render_list.execute!(
      { title: "x", items: ["a"] },
      { toolCallId: "t", messages: [] } as never
    );
    expect(out).toEqual({ ok: true });
  });
});

describe("merge_duplicate_clients", () => {
  const ctx = { toolCallId: "t", messages: [] } as never;

  it("returns ok:false when fewer than 2 contacts share the name", async () => {
    fetchContactsActionMock.mockResolvedValue([
      { id: "c1", name: "Casa Roma", type: "cliente", createdAt: "2024-01-01T00:00:00Z" },
    ]);

    const out = await merge_duplicate_clients.execute!({ name: "Casa Roma" }, ctx);

    expect((out as { ok: boolean }).ok).toBe(false);
    expect(mergeContactsActionMock).not.toHaveBeenCalled();
  });

  it("errors when the name matches duplicates across more than one type", async () => {
    fetchContactsActionMock.mockResolvedValue([
      { id: "c1", name: "Ana López", type: "cliente", createdAt: "2024-01-01T00:00:00Z" },
      { id: "c2", name: "Ana López", type: "cliente", createdAt: "2024-01-02T00:00:00Z" },
      { id: "c3", name: "Ana López", type: "proveedor", createdAt: "2024-01-01T00:00:00Z" },
      { id: "c4", name: "Ana López", type: "proveedor", createdAt: "2024-01-02T00:00:00Z" },
    ]);

    const out = await merge_duplicate_clients.execute!({ name: "Ana López" }, ctx);

    expect((out as { ok: boolean }).ok).toBe(false);
    expect(mergeContactsActionMock).not.toHaveBeenCalled();
  });

  it("keeps the oldest contact and merges the rest by exact name + type", async () => {
    fetchContactsActionMock.mockResolvedValue([
      { id: "c-new", name: "Casa Roma", type: "cliente", createdAt: "2024-03-01T00:00:00Z" },
      { id: "c-old", name: "Casa Roma", type: "cliente", createdAt: "2024-01-01T00:00:00Z" },
      { id: "c-mid", name: "Casa Roma", type: "cliente", createdAt: "2024-02-01T00:00:00Z" },
      { id: "c-other", name: "Otro", type: "cliente", createdAt: "2024-01-01T00:00:00Z" },
    ]);
    mergeContactsActionMock.mockResolvedValue({ id: "c-old", name: "Casa Roma", type: "cliente" });

    const out = await merge_duplicate_clients.execute!({ name: "Casa Roma" }, ctx);

    expect(mergeContactsActionMock).toHaveBeenCalledWith("c-old", ["c-mid", "c-new"]);
    expect(out).toEqual({ ok: true, keptId: "c-old", name: "Casa Roma", type: "cliente", mergedCount: 2 });
  });

  it("respects an explicit type filter", async () => {
    fetchContactsActionMock.mockResolvedValue([
      { id: "p1", name: "Ana López", type: "proveedor", createdAt: "2024-01-01T00:00:00Z" },
      { id: "p2", name: "Ana López", type: "proveedor", createdAt: "2024-01-02T00:00:00Z" },
    ]);
    mergeContactsActionMock.mockResolvedValue({ id: "p1", name: "Ana López", type: "proveedor" });

    const out = await merge_duplicate_clients.execute!({ name: "Ana López", type: "proveedor" }, ctx);

    expect(fetchContactsActionMock).toHaveBeenCalledWith({ type: "proveedor" });
    expect(mergeContactsActionMock).toHaveBeenCalledWith("p1", ["p2"]);
    expect((out as { ok: boolean }).ok).toBe(true);
  });
});

describe("merge_duplicate_activities", () => {
  const ctx = { toolCallId: "t", messages: [] } as never;

  beforeEach(() => {
    fetchProjectsActionMock.mockResolvedValue([{ id: "proj-1", name: "Casa Roma" }]);
  });

  it("returns ok:false when the project can't be resolved", async () => {
    fetchProjectsActionMock.mockResolvedValue([]);

    const out = await merge_duplicate_activities.execute!(
      { projectName: "No existe", descriptionContains: "Renders" },
      ctx
    );

    expect((out as { ok: boolean }).ok).toBe(false);
    expect(mergeTasksActionMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when fewer than 2 tasks match", async () => {
    fetchTasksActionMock.mockResolvedValue([
      { id: "t1", title: "Enviar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-01T00:00:00Z" },
    ]);

    const out = await merge_duplicate_activities.execute!(
      { projectName: "Casa Roma", descriptionContains: "renders" },
      ctx
    );

    expect((out as { ok: boolean }).ok).toBe(false);
    expect(mergeTasksActionMock).not.toHaveBeenCalled();
  });

  it("errors when matches span more than one distinct title", async () => {
    fetchTasksActionMock.mockResolvedValue([
      { id: "t1", title: "Enviar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-01T00:00:00Z" },
      { id: "t2", title: "Enviar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-02T00:00:00Z" },
      { id: "t3", title: "Revisar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-01T00:00:00Z" },
      { id: "t4", title: "Revisar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-02T00:00:00Z" },
    ]);

    const out = await merge_duplicate_activities.execute!(
      { projectName: "Casa Roma", descriptionContains: "renders" },
      ctx
    );

    expect((out as { ok: boolean }).ok).toBe(false);
    expect(mergeTasksActionMock).not.toHaveBeenCalled();
  });

  it("keeps the oldest task and merges the rest with the exact same title", async () => {
    fetchTasksActionMock.mockResolvedValue([
      { id: "t-new", title: "Enviar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-03-01T00:00:00Z" },
      { id: "t-old", title: "Enviar renders", project: { id: "proj-1", name: "Casa Roma" }, createdAt: "2024-01-01T00:00:00Z" },
    ]);
    mergeTasksActionMock.mockResolvedValue({ id: "t-old", title: "Enviar renders" });

    const out = await merge_duplicate_activities.execute!(
      { projectName: "Casa Roma", descriptionContains: "Enviar renders" },
      ctx
    );

    expect(fetchTasksActionMock).toHaveBeenCalledWith({
      search: "Enviar renders",
      projectId: "proj-1",
      workflowId: undefined,
    });
    expect(mergeTasksActionMock).toHaveBeenCalledWith("t-old", ["t-new"]);
    expect(out).toEqual({
      ok: true,
      keptId: "t-old",
      title: "Enviar renders",
      project: "Casa Roma",
      mergedCount: 1,
    });
  });
});
