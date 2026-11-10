import { ListIcon } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolStep, ToolStepGroup } from "@/lib/assistant/tool-steps";
import type { AssistantUIMessage } from "@/lib/types/asistente";

const toToolStepsMock = vi.fn<(message: AssistantUIMessage) => ToolStepGroup[]>();
vi.mock("@/lib/assistant/tool-steps", () => ({
  toToolSteps: (message: AssistantUIMessage) => toToolStepsMock(message),
}));

import {
  activitiesDueTable,
  approvalMeta,
  approvalTable,
  FLAT_GROUP_ID,
  recordStepTable,
  stepKpis,
  stepsCsv,
  stepsCsvFileName,
  stepTableRows,
  threadStepsLine,
  threadStepStats,
  workloadTable,
} from "./step-tables";

function step(overrides: Partial<ToolStep> = {}): ToolStep {
  return {
    toolCallId: "c1",
    toolName: "list_activities_due",
    state: "done",
    label: "Buscó tareas vencidas",
    short: "Tareas vencidas del proyecto",
    icon: ListIcon,
    tone: 1,
    params: [],
    rows: null,
    durationMs: null,
    ...overrides,
  };
}

function message(id: string, role: "user" | "assistant" = "assistant"): AssistantUIMessage {
  return { id, role, parts: [{ type: "text", text: "x" }] } as AssistantUIMessage;
}

const TODAY = "2026-11-09";

beforeEach(() => {
  toToolStepsMock.mockReset();
  toToolStepsMock.mockReturnValue([]);
});

describe("step tables", () => {
  const due = [
    { id: "t1", projectId: "p1", description: "Planos", workflow: "Diseño", workflowKey: "diseno", workflowSortOrder: 2, blocked: false, commitmentDate: "2026-10-30", manager: "Ana Ruiz" },
    { id: "t2", projectId: "p1", description: "Render", workflow: "Diseño", workflowKey: "diseno", workflowSortOrder: 2, blocked: false, commitmentDate: "2026-11-03", manager: "Ana Ruiz" },
    { id: "t3", projectId: "p1", description: "Cimbra", workflow: "Construcción", workflowKey: "construccion", workflowSortOrder: 3, blocked: true, commitmentDate: "2026-11-08", manager: "Jorge Mena" },
    { id: "t4", projectId: "p1", description: "Levantamiento", workflow: "Presale", workflowKey: "presale", workflowSortOrder: 1, blocked: false, commitmentDate: "2026-11-20", manager: null },
  ];

  it("list_activities_due groups by tramo with day totals", () => {
    const table = activitiesDueTable(due, TODAY)!;
    expect(table.title).toBe("tareas vencidas");
    expect(table.groups.map((g) => g.label)).toEqual(["Presale", "Diseño", "Construcción"]);
    const diseno = table.groups[1]!;
    expect(diseno.rows!.map((r) => r.dias)).toEqual([10, 6]);
    expect(diseno.metrics[0]!.value).toBe("2 · 16 d");
    expect(diseno.color).toBe("var(--chart-2)");
    // A future date is not late.
    expect(table.groups[0]!.rows![0]).toMatchObject({ dias: 0, vencida: false });
    expect(diseno.rows![0]).toMatchObject({ vencida: true, taskId: "t1" });
    expect(table.totals).toEqual({ dias: 17 });
    expect(table.columns.find((c) => c.key === "dias")).toMatchObject({ align: "right", mono: true });
  });

  it("marks a blocked group", () => {
    const table = activitiesDueTable(due, TODAY)!;
    const construccion = table.groups.find((g) => g.label === "Construcción")!;
    expect(construccion.metrics.map((m) => m.value)).toEqual(["1 · 1 d", "bloqueada"]);
    expect(construccion.metrics[1]!.tone).toBe("destructive");
    expect(table.groups.find((g) => g.label === "Diseño")!.metrics).toHaveLength(1);
  });

  it("workload heat thresholds", () => {
    const table = workloadTable([
      { name: "Ana Ruiz", occupancyPct: 120, activeTasks: 6, mainWorkflow: "Diseño" },
      { name: "Jorge Mena", occupancyPct: 80, activeTasks: 4, mainWorkflow: null },
    ])!;
    expect(table.groups[0]!.id).toBe(FLAT_GROUP_ID);
    expect(table.groups[0]!.rows).toEqual([
      { id: "Ana Ruiz-0", persona: "Ana Ruiz", tramo: "Diseño", abiertas: 6, carga: 120 },
      { id: "Jorge Mena-1", persona: "Jorge Mena", tramo: null, abiertas: 4, carga: 80 },
    ]);
    // Strict thresholds: > 100 critical, 80–100 warning.
    const rule = table.heat!.find((h) => h.key === "carga")!;
    const level = (n: number) => (n > rule.critAt ? "crit" : n > rule.warnAt ? "warn" : null);
    expect([level(101), level(100), level(80), level(79)]).toEqual(["crit", "warn", "warn", null]);
    const dias = activitiesDueTable([], TODAY)!.heat!.find((h) => h.key === "dias")!;
    const day = (n: number) => (n > dias.critAt ? "crit" : n > dias.warnAt ? "warn" : null);
    expect([day(10), day(9), day(5), day(4)]).toEqual(["crit", "warn", "warn", null]);
  });

  it("approval preview rows", () => {
    const group: Extract<ToolStepGroup, { kind: "approval" }> = {
      kind: "approval",
      toolName: "create_task",
      steps: [
        step({ toolCallId: "a1", toolName: "create_task", state: "needs-confirmation", approvalId: "p1" }),
        step({ toolCallId: "a2", toolName: "create_task", state: "needs-confirmation", approvalId: "p2" }),
      ],
      preview: [
        { op: "+", title: "Revisión de planos", person: "Ana Ruiz", date: "2026-11-13" },
        { op: "+", title: "Revisión de render", date: "2026-11-13" },
      ],
    };
    const table = approvalTable(group);
    expect(table.title).toBe("filas a crear");
    expect(table.columns.map((c) => c.label)).toEqual(["Tarea nueva", "Responsable", "Vence"]);
    expect(table.groups[0]!.rows!.map((r) => [r.tarea, r.responsable, r.vence])).toEqual([
      ["Revisión de planos", "Ana Ruiz", "2026-11-13"],
      ["Revisión de render", null, "2026-11-13"],
    ]);
    expect(approvalMeta(group)).toBe("+2 · sin confirmar");
    expect(approvalMeta({ ...group, steps: group.steps.map((s) => ({ ...s, state: "done" as const })) })).toBe("+2 · creadas");
    expect(approvalMeta({ ...group, steps: group.steps.map((s) => ({ ...s, state: "denied" as const })) })).toBe("cancelado");
    // One row in the steps table for the whole group.
    const rows = stepTableRows([group]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ index: 1, tool: "create_task × 2", state: "needs-confirmation", rows: 2 });
  });

  it("unknown array output becomes a record table", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ name: `Proyecto ${i}`, progress: i, stages: ["A", "B"] }));
    const data = recordStepTable(rows)!;
    expect(data.columns.map((c) => c.key)).toEqual(["name", "progress", "stages"]);
    expect(data.columns[1]!.format).toBe("count");
    expect(data.rows).toHaveLength(50);
    expect(data.rows[0]).toEqual({ name: "Proyecto 0", progress: 0, stages: "A, B" });
    expect(recordStepTable({ total: 3, ok: true })!.rows).toEqual([
      { campo: "total", valor: 3 },
      { campo: "ok", valor: "sí" },
    ]);
    expect(recordStepTable({ ok: false, error: "x", message: "No" })).toBeNull();
    expect(recordStepTable({ untrusted: true, content: [{ asunto: "Hola" }] })!.rows).toEqual([{ asunto: "Hola" }]);
  });

  it("kpis sum rows and toolMs", () => {
    const steps = [
      step({ toolCallId: "r1", rows: 12, durationMs: 400 }),
      step({ toolCallId: "r2", rows: 3, durationMs: 300 }),
      step({ toolCallId: "w1", toolName: "create_task", state: "needs-confirmation", approvalId: "p1", rows: 1 }),
      step({ toolCallId: "w2", toolName: "create_task", state: "needs-confirmation", approvalId: "p2", rows: 1 }),
    ];
    expect(stepKpis(steps).map((k) => [k.label, k.value])).toEqual([
      ["Herramientas", "4"],
      ["Escrituras pendientes", "2"],
      ["Filas leídas", "15"],
      ["Tiempo", "0.7 s"],
    ]);
    // Without step durations the message metadata gives the time.
    const noMs = steps.map((s) => ({ ...s, durationMs: null }));
    expect(stepKpis(noMs, { toolMs: { r1: 1200, r2: 300 } } as never).at(-1)!.value).toBe("1.5 s");
    expect(stepKpis(noMs).at(-1)!.value).toBe("—");
  });

  it("csv escapes separators and has a BOM", () => {
    toToolStepsMock.mockImplementation((m) =>
      m.id === "a1"
        ? [
            {
              kind: "steps",
              totalMs: 400,
              steps: [
                step({
                  toolCallId: "s1",
                  toolName: "buscar",
                  short: "Busca; filtra",
                  params: [{ key: "q", value: 'casa "roma"' }],
                  rows: 3,
                  durationMs: 400,
                }),
              ],
            },
          ]
        : [{ kind: "steps", totalMs: null, steps: [step({ toolCallId: "s2", toolName: "=cmd", state: "error" })] }],
    );
    const csv = stepsCsv([message("u1", "user"), message("a1"), message("u2", "user"), message("a2")]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("#;mensaje;herramienta;que_hizo;parametros;estado;duracion_s;filas");
    expect(lines[1]).toBe('1;1;buscar;"Busca; filtra";"q=casa ""roma""";Listo;0.4;3');
    // Formula-like cells are neutralized; unknown duration and rows are empty.
    expect(lines[2]).toBe("1;2;'=cmd;Tareas vencidas del proyecto;;Error;;");
    expect(lines[3]).toBe("");
    expect(stepsCsvFileName("Retrasos en Oficina Polanco — ¿qué vence?")).toBe("pasos-retrasos-en-oficina-polanco-que-vence.csv");
  });

  it("thread totals for the conversation header", () => {
    toToolStepsMock.mockReturnValue([
      {
        kind: "steps",
        totalMs: 700,
        steps: [step({ toolCallId: "x", durationMs: 700 }), step({ toolCallId: "y", state: "needs-confirmation" })],
      },
    ]);
    const stats = threadStepStats([message("u", "user"), message("a")]);
    expect(stats).toEqual({ steps: 2, totalMs: 700, pending: 1 });
    expect(threadStepsLine(stats)).toBe("2 pasos · 0.7 s · 1 requiere confirmación");
    expect(threadStepsLine({ steps: 1, totalMs: null, pending: 0 })).toBe("1 paso");
    expect(threadStepsLine({ steps: 5, totalMs: 50, pending: 3 })).toBe("5 pasos · <0.1 s · 3 requieren confirmación");
  });
});
