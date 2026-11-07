import type { Tool } from "ai";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { toolSummaries } from "@/lib/assistant/tool-summaries";
import {
  RENDER_TABLE_LIMITS,
  RENDER_TIMELINE_LIMITS,
  agendaItemSchema,
  recordTableDataSchema,
  renderTableSchema,
  renderTimelineSchema,
  tools,
} from "@/lib/assistant/tools/widgets";

function userWith(access: string): AuthenticatedUser {
  return { email: "ana@cincel.mx", access, member: { id: "staff-1", name: "Ana" } } as unknown as AuthenticatedUser;
}

const context = { route: "/asistente" };

function byName(name: string) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

const TABLE = {
  title: "Horas por persona",
  columns: [
    { key: "name", label: "Persona" },
    { key: "hours", label: "Horas", align: "right", format: "hours", mono: true },
    { key: "load", label: "% ocupación", format: "percent", hideOn: ["esencial"] },
  ],
  rows: [
    { name: "Luis", hours: 38.5, load: 0.96 },
    { name: "Marta", hours: 22, load: null },
  ],
  totals: "auto",
  heat: [{ key: "load", warnAt: 0.8, critAt: 1 }],
} as const;

const TIMELINE = {
  title: "Esta semana",
  items: [
    { id: "t-1", title: "Entrega de planos", start: "2026-11-10", allDay: true, project: "Casa Ensenada", tramo: "diseno" },
    {
      id: "e-1",
      title: "Visita de obra",
      start: "2026-11-11T09:00:00-06:00",
      end: "2026-11-11T11:00:00-06:00",
      attendees: ["Luis", "Marta"],
      href: "/calendario?evento=e-1",
    },
    { id: "t-2", title: "Colado", start: "2026-11-13", estimated: true, tramo: null },
  ],
};

describe("render_table schema (RecordTableData + title)", () => {
  it("accepts a full RecordTableData", () => {
    expect(renderTableSchema.safeParse(TABLE).success).toBe(true);
    const data = { columns: TABLE.columns, rows: TABLE.rows, totals: TABLE.totals, heat: TABLE.heat };
    expect(recordTableDataSchema.safeParse(data).success).toBe(true);
    expect(renderTableSchema.safeParse({ columns: [{ key: "a", label: "A" }], rows: [] }).success).toBe(true);
  });

  it("accepts explicit totals", () => {
    expect(renderTableSchema.safeParse({ ...TABLE, totals: { name: "Total", hours: 60.5 } }).success).toBe(true);
  });

  it.each([
    ["no columns", { ...TABLE, columns: [] }],
    ["an unknown format", { ...TABLE, columns: [{ key: "a", label: "A", format: "usd" }] }],
    ["an unknown presentation style", { ...TABLE, columns: [{ key: "a", label: "A", hideOn: ["compacto"] }] }],
    ["a repeated column key", { ...TABLE, columns: [{ key: "a", label: "A" }, { key: "a", label: "B" }] }],
    ["groupBy that is not a column", { ...TABLE, groupBy: "tramo" }],
    ["heat on a missing column", { ...TABLE, heat: [{ key: "nope", warnAt: 1, critAt: 2 }] }],
    ["an object cell", { ...TABLE, rows: [{ name: { first: "Luis" } }] }],
    ["totals that are neither auto nor a map", { ...TABLE, totals: "sum" }],
    ["rows that are not objects", { ...TABLE, rows: ["Luis"] }],
  ])("rejects %s", (_label, input) => {
    expect(renderTableSchema.safeParse(input).success).toBe(false);
  });

  it("caps columns and rows", () => {
    const columns = Array.from({ length: RENDER_TABLE_LIMITS.columns + 1 }, (_, i) => ({ key: `c${i}`, label: `C${i}` }));
    expect(renderTableSchema.safeParse({ columns, rows: [] }).success).toBe(false);
    const rows = Array.from({ length: RENDER_TABLE_LIMITS.rows + 1 }, (_, i) => ({ name: `P${i}` }));
    expect(renderTableSchema.safeParse({ columns: [{ key: "name", label: "Nombre" }], rows }).success).toBe(false);
  });
});

describe("render_timeline schema ({ title?, items: AgendaItem[] })", () => {
  it("accepts AgendaItem rows", () => {
    expect(renderTimelineSchema.safeParse(TIMELINE).success).toBe(true);
    expect(renderTimelineSchema.safeParse({ items: [TIMELINE.items[0]] }).success).toBe(true);
  });

  it("accepts a stored Cutto meeting URL", () => {
    expect(
      agendaItemSchema.safeParse({ id: "e", title: "Junta", start: "2026-11-10T10:00:00Z", meetingUrl: "https://cutto.cloudketer.dev/m/1" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["an empty list", { items: [] }],
    ["an item without title", { items: [{ id: "a", start: "2026-11-10" }] }],
    ["a non ISO start", { items: [{ id: "a", title: "A", start: "10 de noviembre" }] }],
    ["end before start", { items: [{ id: "a", title: "A", start: "2026-11-10T10:00", end: "2026-11-10T09:00" }] }],
    ["an external href", { items: [{ id: "a", title: "A", start: "2026-11-10", href: "https://evil.example" }] }],
    ["a protocol-relative href", { items: [{ id: "a", title: "A", start: "2026-11-10", href: "//evil.example" }] }],
    ["a javascript meetingUrl", { items: [{ id: "a", title: "A", start: "2026-11-10", meetingUrl: "javascript:alert(1)" }] }],
  ])("rejects %s", (_label, input) => {
    expect(renderTimelineSchema.safeParse(input).success).toBe(false);
  });

  it("caps the items", () => {
    const items = Array.from({ length: RENDER_TIMELINE_LIMITS.items + 1 }, (_, i) => ({
      id: `i${i}`,
      title: `Item ${i}`,
      start: "2026-11-10",
    }));
    expect(renderTimelineSchema.safeParse({ items }).success).toBe(false);
  });
});

describe("widget tools", () => {
  it("registers render_table and render_timeline only (render_confirmation is not model-callable)", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(["render_table", "render_timeline"]);
  });

  it.each(["Administrador", "Colaborador", "Dirección"])("are offered to %s without confirmation", (access) => {
    const user = userWith(access);
    for (const t of tools) {
      expect(t.definition.capability(user), t.name).toBe(true);
      expect(t.definition.available({ user, context }), t.name).toBe(true);
      expect(t.definition.confirm, t.name).toBe(false);
      expect(t.definition.write, t.name).toBe(false);
      expect(t.toAiTool({ user, context, threadId: "th" }).needsApproval ?? false, t.name).toBe(false);
    }
  });

  it("acknowledge the render", async () => {
    const user = userWith("Colaborador");
    const exec = (name: string) =>
      byName(name).toAiTool({ user, context, threadId: "th" }) as Tool & {
        execute: (input: unknown, options: unknown) => Promise<unknown>;
      };
    const opts = { toolCallId: "c", messages: [] };
    await expect(exec("render_table").execute(renderTableSchema.parse(TABLE), opts)).resolves.toEqual({
      ok: true,
      rendered: "table",
      rows: 2,
    });
    await expect(exec("render_timeline").execute(renderTimelineSchema.parse(TIMELINE), opts)).resolves.toEqual({
      ok: true,
      rendered: "timeline",
      items: 3,
    });
  });

  it("share their summaries with the client map", () => {
    for (const t of tools) expect(toolSummaries[t.name], t.name).toBe(t.definition.summarize);
    expect(toolSummaries.render_table(TABLE)).toBe("Mostrar la tabla “Horas por persona” (2 filas)");
    expect(toolSummaries.render_timeline({ items: TIMELINE.items })).toBe("Mostrar una línea de tiempo (3 elementos)");
  });
});
