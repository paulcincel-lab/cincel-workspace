// @vitest-environment node
import { describe, expect, it } from "vitest";

import { dayLead, greeting, weekLead } from "@/lib/calendario/copy";
import {
  blockingItems,
  buildDaySummary,
  buildWeekSummary,
  riskItems,
  type RiskInput,
  type SummaryInput,
  type SummaryTask,
} from "@/lib/calendario/risk";
import type { CalEventItem } from "@/lib/types/calendario";

const ANA = { id: "ana", name: "Ana López" };
const LUIS = { id: "luis", name: "Luis Martínez" };
const OBRA = { id: "p-obra", name: "Casa Roble" };

function task(over: Partial<SummaryTask> & Pick<SummaryTask, "taskId" | "title" | "date">): SummaryTask {
  return { project: OBRA, manager: ANA, status: "pendiente", blockedSince: null, dependents: [], ...over };
}

function meeting(over: Partial<CalEventItem> = {}): CalEventItem {
  return {
    kind: "event",
    id: "e:m1",
    eventId: "m1",
    source: "cincel",
    title: "Revisión de obra",
    date: "2026-11-11",
    start: "2026-11-11T10:00:00-06:00",
    end: "2026-11-11T11:00:00-06:00",
    allDay: false,
    project: OBRA,
    etapa: null,
    location: null,
    meetUrl: null,
    attendees: [],
    attendeeCount: 0,
    organizer: null,
    googleHtmlLink: null,
    syncedAt: null,
    syncError: null,
    minutes: "ninguna",
    canEdit: true,
    ...over,
  };
}

const cimbra = task({
  taskId: "cimbra",
  title: "Cimbra",
  date: "2026-11-05",
  manager: LUIS,
  status: "bloqueado",
  blockedSince: "2026-11-04",
  dependents: [{ taskId: "obra", title: "Obra negra", date: "2026-11-12", managerId: "x", managerName: "Jorge Torres", via: "dependency" }],
});
const ingenierias = task({ taskId: "ing", title: "Ingenierías", date: "2026-11-09", manager: null });
const planos = task({
  taskId: "planos",
  title: "Planos de cocina",
  date: "2026-11-11",
  dependents: [{ taskId: "det", title: "Detalles de cocina", date: "2026-11-20", managerId: "luis", managerName: LUIS.name, via: "dependency" }],
});

const base: RiskInput = {
  viewerId: "ana",
  today: "2026-11-11",
  from: "2026-11-11",
  to: "2026-11-11",
  tasks: [cimbra, ingenierias, planos],
  meetings: [meeting()],
};

describe("riskItems", () => {
  it("lists a blocked task that stops an open one, then the overdue task the meeting depends on", () => {
    const items = riskItems(base);
    expect(items.map((i) => i.title)).toEqual(["Cimbra", "Ingenierías"]);
    expect(items[0]!.line).toBe('Bloqueada hace 7 días · frena "Obra negra" (12 nov)');
    expect(items[1]!.line).toBe("Vencida 2 días · la reunión de hoy depende de ella");
  });

  it("names a tool the registry has for each action", () => {
    const [blocked, overdue] = riskItems(base);
    expect(blocked!.action).toMatchObject({ kind: "notify", staffId: "luis", label: "Avisa a Luis", tool: "notify_people" });
    expect(overdue!.action).toMatchObject({ kind: "assign", tool: "assign_task" });
  });

  it("ignores a blocked task without open successors and an overdue task without a nearby meeting", () => {
    const items = riskItems({
      ...base,
      tasks: [{ ...cimbra, dependents: [] }, ingenierias],
      meetings: [meeting({ project: { id: "otro", name: "Otro" } })],
    });
    expect(items).toEqual([]);
  });

  it("counts a task once when both rules match", () => {
    const both = { ...cimbra, project: OBRA };
    expect(riskItems({ ...base, tasks: [both] })).toHaveLength(1);
  });

  it("proposes a date when the task is the viewer's own", () => {
    const own = task({ taskId: "mia", title: "Mía", date: "2026-11-08" });
    expect(riskItems({ ...base, tasks: [own] })[0]!.action).toMatchObject({ kind: "propose_date", tool: "move_tasks" });
  });
});

describe("blockingItems", () => {
  it("lists the viewer's task another person waits for", () => {
    const [item] = blockingItems(base);
    expect(item).toMatchObject({ title: "Planos de cocina", line: 'Luis Martínez la necesita para "Detalles de cocina" (20 nov)' });
    expect(item!.action).toMatchObject({ kind: "notify", staffId: "luis", label: "Avisa a Luis" });
  });

  it("ignores dependents of the viewer and tasks of other people", () => {
    const mine = { ...planos, dependents: [{ ...planos.dependents[0]!, managerId: "ana" }] };
    expect(blockingItems({ ...base, tasks: [mine, cimbra] })).toEqual([]);
  });

  it("counts a waiting subtask of someone else", () => {
    const parent = { ...planos, dependents: [{ taskId: "s", title: "Subtarea", date: "2026-11-15", managerId: "luis", managerName: LUIS.name, via: "subtask" as const }] };
    expect(blockingItems({ ...base, tasks: [parent] })).toHaveLength(1);
    expect(riskItems({ ...base, tasks: [{ ...parent, status: "bloqueado" }] })).toEqual([]);
  });
});

describe("summaries", () => {
  const input: SummaryInput = { ...base, hour: 9, viewerName: "Ana López", oldestOverdue: new Map([["p-obra", { title: "Cotización", date: "2026-11-06" }]]), overloaded: [] };

  it("builds the day tiles and a lead that names the most urgent risk", () => {
    const day = buildDaySummary(input);
    expect(day.greeting).toBe("Buenos días, Ana");
    expect(day.tiles.map((t) => [t.key, t.count])).toEqual([["reuniones", 1], ["vence", 1], ["riesgo", 2], ["bloqueas", 1]]);
    expect(day.lead).toBe('1 reunión y 1 entrega. Lo más urgente: "Cimbra" está bloqueada y frena "Obra negra".');
    expect(day.tiles[0]!.items[0]).toMatchObject({ line: "10:00–11:00 · Casa Roble · Cotización pendiente desde el 6 nov", action: { kind: "prepare", tool: "meeting_prep" } });
    expect(day.primary).toEqual({ kind: "redistribute", date: "2026-11-11", label: "Reparte esto", tool: "propose_redistribution" });
  });

  it("falls back to the first overdue task, then to what is due today", () => {
    const overdueOnly = buildDaySummary({ ...input, tasks: [task({ taskId: "v", title: "Vieja", date: "2026-11-08" })], meetings: [] });
    expect(overdueOnly.lead).toBe('No tienes reuniones ni entregas. Lo más urgente: "Vieja" venció hace 3 días.');
    const dueOnly = buildDaySummary({ ...input, tasks: [planos], meetings: [] });
    expect(dueOnly.lead).toBe('0 reuniones y 1 entrega. Lo más urgente: "Planos de cocina" vence hoy.');
  });

  it("marks the later of two overlapping meetings with Resolver", () => {
    const second = meeting({ id: "e:m2", eventId: "m2", title: "Otra", start: "2026-11-11T10:30:00-06:00", end: "2026-11-11T11:30:00-06:00" });
    const day = buildDaySummary({ ...input, meetings: [meeting(), second] });
    expect(day.tiles[0]!.items[1]!.action).toEqual({ kind: "resolve", eventIds: ["m1", "m2"], label: "Resolver", tool: "resolve_overlap" });
  });

  it("builds the week with its overloaded days and the planning action", () => {
    const week = buildWeekSummary({
      ...input,
      tasks: [...base.tasks, task({ taskId: "vieja", title: "Vieja", date: "2026-11-06" })],
      from: "2026-11-09",
      to: "2026-11-15",
      overloaded: [{ date: "2026-11-12", hours: 9.5, workday: 6 }],
    });
    expect(week.tiles[1]!.label).toBe("Vence esta semana");
    expect(week.lead).toBe("1 reunión y 1 entrega. El jueves está sobrecargado (9.5 h) y tienes 1 tarea vencida de la semana pasada.");
    expect(week.overloadedDays).toHaveLength(1);
    expect(week.primary).toEqual({ kind: "plan_week", label: "Planea mi semana", tool: "plan_week" });
  });
});

describe("lead templates", () => {
  it("greets by org hour", () => {
    expect(greeting(8, "Oscar")).toBe("Buenos días, Oscar");
    expect(greeting(12, "Oscar")).toBe("Buenas tardes, Oscar");
    expect(greeting(18, "Oscar")).toBe("Buenas tardes, Oscar");
    expect(greeting(19, "Oscar")).toBe("Buenas noches, Oscar");
    expect(greeting(8, "")).toBe("Buenos días");
  });

  it("pluralizes the counts", () => {
    expect(dayLead({ meetings: 4, due: 11, firstRisk: null })).toBe("4 reuniones y 11 entregas.");
    expect(dayLead({ meetings: 1, due: 1, firstRisk: "algo" })).toBe("1 reunión y 1 entrega. Lo más urgente: algo.");
  });

  it("builds the week lead from overload and late tasks", () => {
    expect(weekLead({ meetings: 4, due: 11, overloaded: [{ date: "2026-11-12", hours: 9.5 }], overdueLastWeek: 3 })).toBe(
      "4 reuniones y 11 entregas. El jueves está sobrecargado (9.5 h) y tienes 3 tareas vencidas de la semana pasada.",
    );
    expect(weekLead({ meetings: 0, due: 0, overloaded: [], overdueLastWeek: 2 })).toBe("No tienes reuniones ni entregas. Tienes 2 tareas vencidas de la semana pasada.");
    expect(weekLead({ meetings: 2, due: 3, overloaded: [], overdueLastWeek: 0 })).toBe("2 reuniones y 3 entregas.");
  });
});
