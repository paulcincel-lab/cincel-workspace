import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  list_projects,
  list_activities_due,
  team_workload_summary,
  render_chart,
  ASSISTANT_TOOLS,
} from "./tools";

function parse<T>(schema: unknown, data: unknown) {
  return (schema as z.ZodType<T>).safeParse(data);
}

describe("ASSISTANT_TOOLS", () => {
  it("exposes exactly the four expected tools", () => {
    expect(Object.keys(ASSISTANT_TOOLS).sort()).toEqual([
      "list_activities_due",
      "list_projects",
      "render_chart",
      "team_workload_summary",
    ]);
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
