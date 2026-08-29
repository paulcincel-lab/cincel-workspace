import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import {
  list_projects,
  list_activities_due,
  team_workload_summary,
  render_chart,
  create_client,
  onboard_client,
  ASSISTANT_TOOLS,
  buildAssistantTools,
} from "./tools";

function parse<T>(schema: unknown, data: unknown) {
  return (schema as z.ZodType<T>).safeParse(data);
}

function userWithAccess(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: 1,
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
  "render_chart",
  "team_workload_summary",
];

describe("ASSISTANT_TOOLS", () => {
  it("exposes exactly the four read/render tools", () => {
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
        "create_client",
        "onboard_client",
        "find_duplicates",
        "merge_duplicate_clients",
        "merge_duplicate_activities",
      ].sort()
    );
  });

  it("gives Colaborador create_task + find_duplicates but no merge/client tools", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Colaborador"))).sort();
    expect(keys).toEqual([...READ_TOOLS, "create_task", "find_duplicates"].sort());
  });

  it("gives Arquitecto Junior create_task + find_duplicates but not the rest", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Arquitecto Junior")));
    expect(keys).toEqual(expect.arrayContaining(["create_task", "find_duplicates"]));
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
  });

  it("gives Dirección the destructive merge tools", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Dirección")));
    expect(keys).toEqual(
      expect.arrayContaining(["merge_duplicate_clients", "merge_duplicate_activities"])
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
    expect(r.success && r.data.workflow).toBe("Presale");
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
