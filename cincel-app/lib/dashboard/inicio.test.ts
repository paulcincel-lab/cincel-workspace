import { describe, expect, it } from "vitest";

import { bucketTaskTrend } from "./task-trend";
import {
  agendaSortKey,
  averageAgeByKey,
  byTramoOrder,
  completedInWeek,
  inMemoryCounter,
  inicioPortfolioRows,
  INICIO_PACE_WEEKS,
  inicioWeekBuckets,
  inicioWorkloadRows,
  involves,
  myDayItems,
  projectActiveOn,
  statusResolver,
  taskDayState,
  taskTramoKey,
  taskTramoLabel,
  tramoSplit,
} from "./inicio";

const TZ = "America/Mexico_City";
// Saturday 7 Nov 2026, 12:00 in Mexico City (UTC−6).
const NOW = new Date("2026-11-07T18:00:00Z");
const TODAY = "2026-11-07";

type T = Parameters<typeof inicioPortfolioRows>[1][number] & {
  reviewDate: string | null;
  workflow: { id: string; key: string; name: string; sortOrder: number } | null;
};

function task(over: Partial<T> & { id: string }): T {
  return {
    kind: "usuario",
    title: over.id,
    projectId: "p1",
    managerId: "ana",
    status: "pendiente",
    customStatus: null,
    commitmentDate: null,
    reviewDate: null,
    createdAt: "2026-10-01T18:00:00Z",
    workflow: null,
    support: [],
    ...over,
  };
}

const presale = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };

describe("inicioWeekBuckets", () => {
  it("returns 12 Monday–Sunday weeks, oldest first, ending with the current week", () => {
    const buckets = inicioWeekBuckets(NOW, TZ);
    expect(INICIO_PACE_WEEKS).toBe(12);
    expect(buckets).toHaveLength(12);
    expect(buckets[11]).toEqual({ label: "S45", from: "2026-11-02", to: "2026-11-08" });
    expect(buckets[0].from).toBe("2026-08-17");
    for (let i = 1; i < buckets.length; i++) expect(buckets[i].from > buckets[i - 1].from).toBe(true);
  });

  it("feeds bucketTaskTrend", () => {
    const buckets = inicioWeekBuckets(NOW, TZ);
    const trend = bucketTaskTrend({
      buckets,
      timeZone: TZ,
      createdAt: [new Date("2026-11-03T18:00:00Z"), new Date("2026-09-14T18:00:00Z")],
      completions: [{ taskId: "a", at: new Date("2026-11-04T18:00:00Z") }],
    });
    expect(trend.created).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
    expect(trend.completed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

describe("statusResolver", () => {
  const events = [
    { entityId: "t1", at: new Date("2026-11-03T18:00:00Z"), before: "pendiente", after: "bloqueado" },
    { entityId: "t1", at: new Date("2026-11-05T18:00:00Z"), before: "bloqueado", after: "en_proceso" },
  ];
  const statusAt = statusResolver(events, TZ);

  it("reads the before of the first later change", () => {
    expect(statusAt("t1", "en_proceso", "2026-11-02")).toBe("pendiente");
    expect(statusAt("t1", "en_proceso", "2026-11-03")).toBe("bloqueado");
    expect(statusAt("t1", "en_proceso", "2026-11-04")).toBe("bloqueado");
  });

  it("reads the current status when nothing changed later", () => {
    expect(statusAt("t1", "en_proceso", "2026-11-05")).toBe("en_proceso");
    expect(statusAt("t1", "en_proceso", TODAY)).toBe("en_proceso");
    expect(statusAt("other", "pendiente", "2026-10-01")).toBe("pendiente");
  });
});

describe("taskDayState", () => {
  const state = taskDayState(
    statusResolver(
      [{ entityId: "done", at: new Date("2026-11-06T18:00:00Z"), before: "pendiente", after: "completado" }],
      TZ,
    ),
    TZ,
  );

  it("counts a task open until the day it closes, and not before it exists", () => {
    const done = task({ id: "done", status: "completado" });
    expect(state.open(done, "2026-11-05")).toBe(true);
    expect(state.open(done, "2026-11-06")).toBe(false);
    const fresh = task({ id: "fresh", createdAt: "2026-11-06T18:00:00Z" });
    expect(state.open(fresh, "2026-11-05")).toBe(false);
    expect(state.open(fresh, "2026-11-06")).toBe(true);
  });

  it("treats a closing custom status as closed", () => {
    const cancelled = task({ id: "c", customStatus: { id: "x", name: "Cancelado", closes: true, countsAsCompleted: false } });
    expect(state.open(cancelled, TODAY)).toBe(false);
  });

  it("overdue = open with a commitment before the day", () => {
    const late = task({ id: "late", commitmentDate: "2026-11-05" });
    expect(state.overdue(late, "2026-11-05")).toBe(false);
    expect(state.overdue(late, "2026-11-06")).toBe(true);
  });

  it("blocked by the status of that day", () => {
    expect(state.blocked(task({ id: "b", status: "bloqueado" }), TODAY)).toBe(true);
    expect(state.blocked(task({ id: "p" }), TODAY)).toBe(false);
  });

  it("review due within the day and the next 6", () => {
    expect(state.reviewDue(task({ id: "r", reviewDate: "2026-11-13" }), TODAY)).toBe(true);
    expect(state.reviewDue(task({ id: "r", reviewDate: "2026-11-14" }), TODAY)).toBe(false);
    expect(state.reviewDue(task({ id: "r", reviewDate: "2026-11-06" }), TODAY)).toBe(false);
  });
});

describe("projectActiveOn", () => {
  it("uses the project status history", () => {
    const statusAt = statusResolver(
      [{ entityId: "p", at: new Date("2026-11-04T18:00:00Z"), before: "pausado", after: "activo" }],
      TZ,
    );
    const project = { id: "p", status: "activo" as const, createdAt: "2026-10-01T18:00:00Z" };
    expect(projectActiveOn(statusAt, project, "2026-11-03", TZ)).toBe(false);
    expect(projectActiveOn(statusAt, project, "2026-11-04", TZ)).toBe(true);
    expect(projectActiveOn(statusAt, { ...project, createdAt: "2026-11-07T18:00:00Z" }, "2026-11-06", TZ)).toBe(false);
  });
});

describe("completedInWeek", () => {
  it("counts distinct tasks completed in the day and the 6 before", () => {
    const completions = [
      { taskId: "a", at: new Date("2026-11-01T18:00:00Z") },
      { taskId: "a", at: new Date("2026-11-02T18:00:00Z") },
      { taskId: "b", at: new Date("2026-10-31T18:00:00Z") },
      { taskId: "c", at: new Date("2026-11-07T18:00:00Z") },
    ];
    expect(completedInWeek(completions, TODAY, TZ)).toBe(2);
  });
});

describe("inMemoryCounter", () => {
  it("counts every date of the range", async () => {
    const counter = inMemoryCounter((day) => (day === "2026-11-02" ? 3 : 0));
    const out = await counter("2026-11-01", "2026-11-03");
    expect([...out]).toEqual([
      ["2026-11-01", 0],
      ["2026-11-02", 3],
      ["2026-11-03", 0],
    ]);
  });
});

describe("tramo grouping", () => {
  it("keys by workflow, then admin and sin tramo", () => {
    expect(taskTramoKey(task({ id: "a", workflow: presale }))).toBe("presale");
    expect(taskTramoKey(task({ id: "b", kind: "admin" }))).toBe("admin");
    expect(taskTramoKey(task({ id: "c" }))).toBe("sin-tramo");
    expect(taskTramoLabel(task({ id: "b", kind: "admin" }))).toBe("Administración");
    expect(taskTramoLabel(task({ id: "c" }))).toBe("Sin tramo");
  });

  it("orders by tramo sortOrder with no tramo and admin last", () => {
    const sorted = [
      task({ id: "admin", kind: "admin" }),
      task({ id: "none" }),
      task({ id: "d", workflow: diseno }),
      task({ id: "p", workflow: presale }),
    ].sort(byTramoOrder);
    expect(sorted.map((t) => t.id)).toEqual(["p", "d", "none", "admin"]);
  });

  it("splits shares by tramo over every item", () => {
    const items = [task({ id: "1", workflow: presale }), task({ id: "2", workflow: presale }), task({ id: "3", workflow: diseno }), task({ id: "4" })];
    expect(tramoSplit(items, (t) => t.workflow?.key ?? null)).toEqual([
      { tramo: "presale", share: 0.5 },
      { tramo: "diseno", share: 0.25 },
    ]);
    expect(tramoSplit([], () => "presale")).toEqual([]);
  });

  it("averages the age of each group in days", () => {
    const ages = averageAgeByKey(
      [
        task({ id: "1", workflow: presale, createdAt: "2026-11-01T18:00:00Z" }),
        task({ id: "2", workflow: presale, createdAt: "2026-11-04T18:00:00Z" }),
        task({ id: "3", createdAt: "2026-11-07T18:00:00Z" }),
      ],
      taskTramoKey,
      TODAY,
      TZ,
    );
    expect(ages.get("presale")).toBe(4.5);
    expect(ages.get("sin-tramo")).toBe(0);
  });
});

describe("inicioPortfolioRows", () => {
  it("counts open and overdue, and picks the next open non-admin commitment", () => {
    const tasks = [
      task({ id: "late", commitmentDate: "2026-11-01" }),
      task({ id: "next", title: "Planos", commitmentDate: "2026-11-09" }),
      task({ id: "later", commitmentDate: "2026-11-20" }),
      task({ id: "adm", kind: "admin", title: "Contrato", commitmentDate: "2026-11-08" }),
      task({ id: "done", status: "completado", commitmentDate: "2026-11-07" }),
      task({ id: "other", projectId: "p2", commitmentDate: "2026-11-07" }),
    ];
    const [row] = inicioPortfolioRows([{ id: "p1", progress: 40, endDate: "2026-11-17" }], tasks, TODAY, () => true);
    expect(row).toMatchObject({
      projectId: "p1",
      real: 40,
      plan: null,
      deviation: null,
      budgetSpentPct: null,
      open: 4,
      overdue: 1,
      daysToDelivery: 10,
      nextDelivery: { title: "Planos", date: "2026-11-09" },
    });
    expect(row.series7).toEqual([5, 5, 5, 5, 5, 5, 5]);
  });
});

describe("inicioWorkloadRows", () => {
  it("one row per responsable with open tasks, most open first", () => {
    const staff = [
      { id: "ana", name: "Ana", capacity: 4 },
      { id: "beto", name: "Beto", capacity: 0 },
      { id: "caro", name: "Caro", capacity: 5 },
    ];
    const rows = inicioWorkloadRows(
      staff,
      [
        task({ id: "1", managerId: "beto", commitmentDate: "2026-11-01" }),
        task({ id: "2", managerId: "beto", projectId: "p2" }),
        task({ id: "3", managerId: "ana" }),
        task({ id: "4", managerId: "ana", status: "completado" }),
        task({ id: "5", managerId: null }),
        task({ id: "6", managerId: "gone" }),
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { staffId: "beto", open: 2, overdue: 1, activeProjects: 2, occupancyPct: 0, weekHours: null, availability: [] },
      { staffId: "ana", open: 1, overdue: 0, activeProjects: 1, occupancyPct: 25, weekHours: null, availability: [] },
    ]);
  });
});

describe("involves", () => {
  it("is the responsable or support", () => {
    expect(involves({ managerId: "ana" }, "ana")).toBe(true);
    expect(involves({ managerId: "beto", support: [{ id: "ana" }] }, "ana")).toBe(true);
    expect(involves({ managerId: null, support: [] }, "ana")).toBe(false);
  });
});

describe("Mi día", () => {
  it("moves zoned instants to local time for sorting", () => {
    expect(agendaSortKey("2026-11-07T15:30:00.000Z", TZ)).toBe("2026-11-07T09:30");
    expect(agendaSortKey("2026-11-07T10:00", TZ)).toBe("2026-11-07T10:00");
  });

  it("keeps today's task items plus the reminders, deduped and by time", () => {
    const items = myDayItems(
      [
        { id: "c-x-1-2026-11-07", title: "Compromiso", start: "2026-11-07T10:00" },
        { id: "r-x-2-2026-11-08", title: "Mañana", start: "2026-11-08T11:00" },
        { id: "c-x-1-2026-11-07", title: "Compromiso", start: "2026-11-07T10:00" },
      ],
      [{ id: "rem", title: "Llamar", start: "2026-11-07T15:00:00.000Z" }],
      TODAY,
      TZ,
    );
    expect(items.map((i) => i.id)).toEqual(["rem", "c-x-1-2026-11-07"]);
  });
});
