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
  it("gives Administrador the read tools plus create_task and assign_task", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Administrador"))).sort();
    expect(keys).toEqual([...READ_TOOLS, "assign_task", "create_task"].sort());
  });

  it("gives Colaborador create_task but not assign_task", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Colaborador"))).sort();
    expect(keys).toEqual([...READ_TOOLS, "create_task"].sort());
  });

  it("gives Arquitecto Junior create_task but not assign_task", () => {
    const keys = Object.keys(buildAssistantTools(userWithAccess("Arquitecto Junior")));
    expect(keys).toContain("create_task");
    expect(keys).not.toContain("assign_task");
  });

  it("gives Arquitecto Senior assign_task", () => {
    expect(
      Object.keys(buildAssistantTools(userWithAccess("Arquitecto Senior")))
    ).toContain("assign_task");
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

  it("rejects withinDays outside 1..60", () => {
    expect(parse(list_activities_due.inputSchema, { withinDays: 0 }).success).toBe(false);
    expect(parse(list_activities_due.inputSchema, { withinDays: 61 }).success).toBe(false);
    expect(parse(list_activities_due.inputSchema, { withinDays: 3.5 }).success).toBe(false);
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
