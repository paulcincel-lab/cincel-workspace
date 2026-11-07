/**
 * Widget builders (redesign BE §8.0.2). Runs in the default DOM environment
 * on purpose: the builders are isomorphic (review: "Builders and
 * server-only").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import { tasksByBaseStatus } from "@/lib/dashboard/donut-groups";
import {
  ATTENTION_REASON,
  initialsOf,
  toAgendaItems,
  toAttentionItems,
  toDistribution,
  toEntityCards,
  toPersonDatum,
  toProgressItems,
  toRecordTable,
} from "@/lib/metrics/widgets";
import type { CalendarEvent } from "@/lib/types/calendar";
import type { ProjectListItem, Staff, TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { PeopleOverviewRow, PortfolioRow, Reminder, TeamAbsence } from "@/lib/types/redesign";
import type {
  AgendaItem,
  AttentionItem,
  DistributionSegment,
  EntityCard,
  PersonDatum,
  ProgressItem,
  RecordTableData,
} from "@/lib/types/widgets";

const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: DISENO.id,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "s1",
    managerId: "s2",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-11-01T15:30:00.000Z",
    updatedAt: "2026-11-01T15:30:00.000Z",
    customStatus: null,
    project: { id: "p1", name: "Casa Roble", clientName: null },
    workflow: DISENO,
    phase: null,
    space: null,
    manager: { id: "s2", name: "Ana María López" },
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

function makeProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: "p1",
    code: null,
    name: "Casa Roble",
    clientId: null,
    origin: null,
    originStaffId: null,
    status: "activo",
    currentWorkflowId: DISENO.id,
    projectType: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    managerId: null,
    coordinatorId: null,
    progress: 40,
    startDate: null,
    endDate: null,
    contractAmountMxn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    client: null,
    currentWorkflow: DISENO,
    tramos: [],
    activePhase: null,
    needsTramo: false,
    stages: [],
    manager: null,
    coordinator: null,
    taskCounts: { total: 0, open: 0, blocked: 0 },
    ...overrides,
  };
}

function makeStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: "s2",
    kind: "empleado",
    name: "Ana",
    lastName: "López",
    phone: null,
    email: null,
    role: "Administrador",
    capacity: 10,
    availability: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    googleManaged: false,
    lastLoginAt: null,
    accessRevokedAt: null,
    accessRevokedReason: null,
    positions: [],
    candidatePhases: [],
    ...overrides,
  };
}

describe("isomorphic", () => {
  it("never imports server-only code", () => {
    for (const file of ["lib/metrics/widgets.ts", "lib/metrics/series.ts"]) {
      const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
      expect(source).not.toMatch(/["']server-only["']/);
      expect(source).not.toMatch(/@\/lib\/(db|repositories|actions)\//);
    }
  });

  it("loads in a DOM environment", () => {
    expect(typeof window).toBe("object");
    expect(typeof toDistribution).toBe("function");
  });
});

describe("toDistribution", () => {
  it("generalizes tasksByBaseStatus", () => {
    const tasks = [
      { status: "pendiente" as const },
      { status: "pendiente" as const },
      { status: "bloqueado" as const },
    ];
    const slices = tasksByBaseStatus(tasks).filter((s) => s.count > 0);
    const segments = toDistribution(tasks, {
      keyOf: (t) => t.status,
      labelOf: (t) => slices.find((s) => s.key === t.status)!.label,
      colorVarOf: (t) => slices.find((s) => s.key === t.status)!.color,
    });
    expectTypeOf(segments).toEqualTypeOf<DistributionSegment[]>();
    expect(segments).toEqual(slices.map((s) => ({ key: s.key, label: s.label, value: s.count, colorVar: s.color })));
  });

  it("sums secondary and numeric extras, keeps the first text extra", () => {
    const rows = [
      { tramo: "diseno", overdue: 1, days: 3, owner: "Ana" },
      { tramo: "diseno", overdue: 0, days: 5, owner: "Beto" },
      { tramo: "obra", overdue: 2, days: 1, owner: "Ciro" },
    ];
    const segments = toDistribution(rows, {
      keyOf: (r) => r.tramo,
      labelOf: (r) => r.tramo,
      colorVarOf: () => "var(--chart-1)",
      secondaryOf: (r) => r.overdue,
      extraOf: (r) => ({ days: r.days, owner: r.owner }),
    });
    expect(segments).toEqual([
      { key: "diseno", label: "diseno", value: 2, colorVar: "var(--chart-1)", secondary: 1, extra: { days: 8, owner: "Ana" } },
      { key: "obra", label: "obra", value: 1, colorVar: "var(--chart-1)", secondary: 2, extra: { days: 1, owner: "Ciro" } },
    ]);
  });

  it("returns [] for no items", () => {
    expect(toDistribution([], { keyOf: String, labelOf: String, colorVarOf: String })).toEqual([]);
  });
});

describe("toProgressItems", () => {
  it("uses the portfolio row when present", () => {
    const row: PortfolioRow = {
      projectId: "p1",
      real: 62,
      plan: 70,
      deviation: -8,
      budgetSpentPct: 55,
      open: 4,
      overdue: 1,
      daysToDelivery: 30,
      nextDelivery: { title: "Planos", date: "2026-11-20" },
      series7: [4, 4, 4, 4, 4, 4, 4],
    };
    const items = toProgressItems([makeProject()], [row]);
    expectTypeOf(items).toEqualTypeOf<ProgressItem[]>();
    expect(items).toEqual([
      {
        id: "p1",
        label: "Casa Roble",
        sublabel: "Diseño",
        real: 62,
        plan: 70,
        budgetPct: 55,
        colorVar: "var(--chart-2)",
        href: "/proyectos/p1",
        next: { title: "Planos", date: "2026-11-20" },
      },
    ]);
  });

  it("falls back to projects.progress and nulls", () => {
    const [item] = toProgressItems([makeProject({ currentWorkflow: null, progress: 140 })]);
    expect(item).toMatchObject({
      sublabel: "Sin tramo",
      real: 100,
      plan: null,
      budgetPct: null,
      colorVar: "var(--muted-foreground)",
      next: null,
    });
  });

  it("returns [] for no projects", () => {
    expect(toProgressItems([], [])).toEqual([]);
  });
});

describe("toAttentionItems", () => {
  // 2026-11-07 03:00 UTC is 2026-11-06 in Mexico City.
  const now = new Date("2026-11-07T03:00:00Z");

  it("applies reason and tone rules in order", () => {
    const items = toAttentionItems(
      [
        makeTask({ id: "late", title: "Late", commitmentDate: "2026-11-01", status: "bloqueado" }),
        makeTask({ id: "blocked", title: "Blocked", status: "bloqueado", commitmentDate: "2026-12-01" }),
        makeTask({ id: "orphan", title: "Orphan", managerId: null, manager: null }),
        makeTask({ id: "soon", title: "Soon", commitmentDate: "2026-11-08" }),
        makeTask({ id: "today", title: "Today", commitmentDate: "2026-11-06" }),
        makeTask({ id: "later", title: "Later", commitmentDate: "2026-11-09" }),
        makeTask({ id: "nodate", title: "No date" }),
        makeTask({ id: "done", title: "Done", status: "completado", commitmentDate: "2026-10-01" }),
        makeTask({
          id: "custom-closed",
          title: "Closed",
          commitmentDate: "2026-10-01",
          customStatus: { id: "c", name: "Entregado", closes: true, countsAsCompleted: true },
        }),
        makeTask({ id: "archived", title: "Archived", archived: true, commitmentDate: "2026-10-01" }),
      ],
      now,
    );
    expectTypeOf(items).toEqualTypeOf<AttentionItem[]>();
    expect(items.map((i) => [i.id, i.reason, i.tone])).toEqual([
      ["late", ATTENTION_REASON.vencida, "critical"],
      ["blocked", ATTENTION_REASON.bloqueada, "warn"],
      ["orphan", ATTENTION_REASON.sinResponsable, "warn"],
      ["today", ATTENTION_REASON.porVencer, "default"],
      ["soon", ATTENTION_REASON.porVencer, "default"],
    ]);
  });

  it("fills the row fields", () => {
    const [late] = toAttentionItems([makeTask({ id: "x", title: "Planos", commitmentDate: "2026-11-01" })], now);
    expect(late).toEqual({
      id: "x",
      title: "Planos",
      href: "/tareas?tarea=x",
      project: "Casa Roble",
      tramo: "diseno",
      reason: "Vencida",
      tone: "critical",
      assignee: { id: "s2", name: "Ana María López", initials: "AL" },
      due: "2026-11-01",
      daysLate: 5,
    });
  });

  it("puts the most days late first and uses null tramo for admin tasks", () => {
    const items = toAttentionItems(
      [
        makeTask({ id: "a", commitmentDate: "2026-11-04" }),
        makeTask({ id: "b", commitmentDate: "2026-10-20", kind: "admin", workflow: null, workflowId: null }),
      ],
      now,
    );
    expect(items.map((i) => [i.id, i.daysLate, i.tramo])).toEqual([
      ["b", 17, null],
      ["a", 2, "diseno"],
    ]);
  });

  it("returns [] for no tasks", () => {
    expect(toAttentionItems([], now)).toEqual([]);
  });
});

describe("toAgendaItems", () => {
  it("maps tasks through buildCalendarEvents", () => {
    const items = toAgendaItems({
      kind: "tasks",
      items: [makeTask({ id: "t9", title: "Revisión", commitmentDate: "2026-11-10", deliveryDate: "2026-11-12" })],
    });
    expectTypeOf(items).toEqualTypeOf<AgendaItem[]>();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Revisión",
      estimated: true,
      project: "Casa Roble",
      tramo: "diseno",
      attendees: ["Ana María López"],
      href: "/tareas?tarea=t9",
    });
    expect(items[0].start.startsWith("2026-11-10T")).toBe(true);
    expect(items[1].start.startsWith("2026-11-12T")).toBe(true);
    expect(items.every((i) => i.meetingUrl === undefined)).toBe(true);
  });

  it("maps calendar events and drops non-tramo keys", () => {
    const event: CalendarEvent = {
      id: "c-admin-t1-2026-11-10",
      taskId: "t1",
      date: "2026-11-10",
      time: "09:15",
      title: "Pago",
      project: "Casa Roble",
      responsible: "Sin responsable",
      tramo: "admin",
      tramoLabel: "Administración",
      phaseId: null,
      phaseLabel: "",
      type: "Compromiso",
      href: "/actividades",
    };
    expect(toAgendaItems({ kind: "events", items: [event] })).toEqual([
      {
        id: "c-admin-t1-2026-11-10",
        title: "Pago",
        start: "2026-11-10T09:15",
        estimated: true,
        project: "Casa Roble",
        tramo: null,
        href: "/tareas?tarea=t1",
      },
    ]);
  });

  it("maps reminders, skips cancelled ones and sorts by start", () => {
    const base: Reminder = {
      id: "r1",
      text: "Llamar a proveedor",
      dueAt: "2026-11-10T16:00:00.000Z",
      repeat: "none",
      channels: ["app"],
      taskId: null,
      projectId: null,
      firedAt: null,
      cancelledAt: null,
    };
    const items = toAgendaItems({
      kind: "reminders",
      items: [
        base,
        { ...base, id: "r2", text: "Revisar tarea", dueAt: "2026-11-09T10:00:00.000Z", taskId: "t1" },
        { ...base, id: "r3", text: "Proyecto", dueAt: "2026-11-11T10:00:00.000Z", projectId: "p1" },
        { ...base, id: "r4", cancelledAt: "2026-11-01T00:00:00.000Z" },
      ],
    });
    expect(items).toEqual([
      { id: "r2", title: "Revisar tarea", start: "2026-11-09T10:00:00.000Z", href: "/tareas?tarea=t1" },
      { id: "r1", title: "Llamar a proveedor", start: "2026-11-10T16:00:00.000Z", href: "/mi-espacio" },
      { id: "r3", title: "Proyecto", start: "2026-11-11T10:00:00.000Z", href: "/proyectos/p1" },
    ]);
  });

  it("maps absences to all-day items", () => {
    const absence: TeamAbsence = { staffId: "s2", name: "Ana López", from: "2026-11-16", to: "2026-11-20", kind: "vacaciones" };
    expect(toAgendaItems({ kind: "absences", items: [absence] })).toEqual([
      {
        id: "ausencia-s2-2026-11-16",
        title: "Ana López · Vacaciones",
        start: "2026-11-16",
        end: "2026-11-20",
        allDay: true,
        attendees: ["Ana López"],
        href: "/personas/equipo/s2",
      },
    ]);
  });

  it("returns [] for empty sources", () => {
    expect(toAgendaItems({ kind: "events", items: [] })).toEqual([]);
    expect(toAgendaItems({ kind: "reminders", items: [] })).toEqual([]);
    expect(toAgendaItems({ kind: "tasks", items: [] })).toEqual([]);
    expect(toAgendaItems({ kind: "absences", items: [] })).toEqual([]);
  });
});

describe("toPersonDatum", () => {
  it("combines staff and the overview row", () => {
    const row: PeopleOverviewRow = {
      staffId: "s2",
      open: 6,
      overdue: 2,
      activeProjects: 3,
      occupancyPct: 60,
      weekHours: 32.5,
      availability: ["libre", "ocupado", "ocupado", "saturado", "vacaciones"],
    };
    const person = toPersonDatum(makeStaff({ positions: [{ id: "pos1", name: "Arquitecta" }] }), row);
    expectTypeOf(person).toEqualTypeOf<PersonDatum>();
    expect(person).toEqual({
      id: "s2",
      name: "Ana López",
      initials: "AL",
      puesto: "Arquitecta",
      tramo: null,
      open: 6,
      overdue: 2,
      activeProjects: 3,
      occupancyPct: 60,
      weekHours: 32.5,
      availability: ["libre", "ocupado", "ocupado", "saturado", "vacaciones"],
      href: "/personas/equipo/s2",
    });
  });

  it("never uses the access role as puesto and zeroes counts without a row", () => {
    expect(toPersonDatum(makeStaff({ lastName: null }), null)).toMatchObject({
      name: "Ana",
      initials: "AN",
      puesto: null,
      open: 0,
      overdue: 0,
      activeProjects: 0,
      occupancyPct: 0,
      weekHours: null,
      availability: [],
    });
  });
});

describe("initialsOf", () => {
  it("takes first and last initials", () => {
    expect(initialsOf("Ana María López")).toBe("AL");
    expect(initialsOf("beto")).toBe("BE");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("toEntityCards", () => {
  it("maps each item", () => {
    const cards = toEntityCards([makeProject()], (p) => ({ id: p.id, title: p.name, tramo: p.currentWorkflow?.key ?? null }));
    expectTypeOf(cards).toEqualTypeOf<EntityCard[]>();
    expect(cards).toEqual([{ id: "p1", title: "Casa Roble", tramo: "diseno" }]);
    expect(toEntityCards([], (x: string) => ({ id: x, title: x }))).toEqual([]);
  });
});

describe("toRecordTable", () => {
  const columns = [
    { key: "name", label: "Tramo" },
    { key: "open", label: "Abiertas", format: "count" as const, align: "right" as const },
    { key: "overdue", label: "Vencidas", format: "count" as const, align: "right" as const },
    { key: "note", label: "Nota" },
  ];

  it("sums the numeric columns for auto totals", () => {
    const table = toRecordTable(
      columns,
      [
        { name: "Diseño", open: 4, overdue: 1, note: "a" },
        { name: "Obra", open: 2, overdue: null, note: "b" },
      ],
      "auto",
    );
    expectTypeOf(table).toEqualTypeOf<RecordTableData>();
    expect(table.totals).toEqual({ name: "Total", open: 6, overdue: 1 });
  });

  it("passes explicit totals through and omits totals when none are asked", () => {
    expect(toRecordTable(columns, [], { name: "Total", open: 0 }).totals).toEqual({ name: "Total", open: 0 });
    expect(toRecordTable(columns, [{ name: "x", open: 1 }])).toEqual({ columns, rows: [{ name: "x", open: 1 }] });
  });

  it("returns no totals row for empty rows", () => {
    expect(toRecordTable(columns, [], "auto")).toEqual({ columns, rows: [] });
  });
});
