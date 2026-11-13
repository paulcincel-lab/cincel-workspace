import { describe, expect, it } from "vitest";

import type { TaskListItem } from "@/lib/types/core";

import { dueInfo, remainderText } from "./my-tasks";
import { bucketPresetDate, daySentence, greeting, nextReminderToday, timeAgo } from "./my-tasks";
import { checklistMetrics, miEspacioCsv, miEspacioCsvFileName, taskRow, type TaskRow } from "./my-tasks";

describe("Esencial: Mis tareas", () => {
  const TODAY = "2026-11-09";

  it("remainderText 1/2/3+ projects", () => {
    expect(remainderText({ count: 0, projectNames: [] })).toBe("");
    expect(remainderText({ count: 1, projectNames: ["Casa Lomas"] })).toBe("1 tarea más en Casa Lomas");
    expect(remainderText({ count: 5, projectNames: ["Casa Lomas", "Torre Sur"] })).toBe(
      "5 tareas más en Casa Lomas y Torre Sur",
    );
    expect(remainderText({ count: 7, projectNames: ["Casa Lomas", "Torre Sur", "Loft"] })).toBe(
      "7 tareas más en Casa Lomas, Torre Sur y 1 proyecto más",
    );
    expect(remainderText({ count: 9, projectNames: ["Casa Lomas", "Torre Sur", "Loft", "Bodega"] })).toBe(
      "9 tareas más en Casa Lomas, Torre Sur y 2 proyectos más",
    );
  });

  it("dueInfo Esencial labels incl. bloqueada and d tarde", () => {
    const at = (commitmentDate: string | null, status: TaskListItem["status"] = "pendiente") =>
      dueInfo({ commitmentDate, status }, TODAY, "esencial");
    expect(at("2026-11-07")).toEqual({ tone: "overdue", label: "7 nov · 2 d tarde", daysLate: 2 });
    expect(at("2026-11-09").label).toBe("hoy");
    expect(at("2026-11-10").label).toBe("mañana");
    expect(at("2026-11-13").label).toBe("vie 13 nov");
    expect(at("2026-11-18").label).toBe("18 nov");
    expect(at(null).label).toBe("Sin fecha");
    expect(at("2026-11-12", "bloqueado").label).toBe("jue 12 nov · bloqueada");
    expect(at("2026-11-07", "bloqueado").label).toBe("7 nov · 2 d tarde · bloqueada");
  });
});

describe("Analítico: Mis tareas tables", () => {
  const TODAY = "2026-11-09";
  const DISENO = { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 };
  const PRESALE = { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 };

  function task(id: string, projectId: string, commitmentDate: string | null, over: Partial<TaskListItem> = {}): TaskListItem {
    return {
      id,
      projectId,
      kind: "usuario",
      templateId: null,
      workflowId: DISENO.id,
      phaseId: null,
      spaceId: null,
      closedAt: null,
      title: id,
      notes: null,
      createdById: "me",
      managerId: "me",
      status: "pendiente",
      customStatusId: null,
      priority: "media",
      sortOrder: null,
      commitmentDate,
      reviewDate: null,
      deliveryDate: null,
      archived: false,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      customStatus: null,
      project: { id: projectId, name: projectId === "p1" ? "Casa Lomas" : "Torre Sur", clientName: null },
      workflow: DISENO,
      phase: null,
      space: null,
      manager: { id: "me", name: "Ana López" },
      support: [],
      checklist: { total: 0, completed: 0 },
      parentTaskId: null,
      parentTitle: null,
      subtaskCount: 0,
      subtaskDoneCount: 0,
      waitingOn: 0,
      ...over,
    } as TaskListItem;
  }

  const TASKS = [
    task("Planos", "p1", "2026-11-04", { status: "bloqueado", subtaskCount: 3, subtaskDoneCount: 1 }),
    task("Render", "p1", "2026-11-12"),
    task("Visita", "p1", null, { workflow: PRESALE, workflowId: PRESALE.id }),
    task("Cotizar", "p2", "2026-11-09", { priority: "alta" }),
    task("Permisos", "p2", "2026-11-07"),
  ];

  it("taskRow labels", () => {
    const planos = taskRow(TASKS[0]!, TODAY);
    expect(planos).toMatchObject({ estatus: "Bloqueado", vence: "4 nov", overdue: true, retraso: 5, subtareas: "1/3" });
    expect(taskRow(TASKS[3]!, TODAY)).toMatchObject({ vence: "hoy", overdue: false, prioridad: "Alta", subtareas: "—" });
    expect(taskRow(TASKS[2]!, TODAY)).toMatchObject({ vence: "—", tramoName: "Presale" });
  });

  it("checklistMetrics sums items and averages percents", () => {
    const item = (done: boolean) => ({ id: String(Math.random()), text: "x", done, sortOrder: 0 });
    expect(
      checklistMetrics([{ items: [item(true), item(false)] }, { items: [item(true), item(true), item(true), item(false)] }, { items: [] }]),
    ).toEqual({ active: 3, done: 4, total: 6, pct: 67, avgPct: 63 });
    expect(checklistMetrics([{ items: [] }])).toMatchObject({ pct: null, avgPct: null });
  });

  it("miEspacioCsv BOM and escaping", () => {
    const rows: TaskRow[] = [
      taskRow(task("Planos; fase 1", "p1", "2026-11-04", { subtaskCount: 2, subtaskDoneCount: 1 }), TODAY),
      taskRow(task('=SUMA "x"', "p2", null), TODAY),
    ];
    const csv = miEspacioCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Proyecto;Etapa;Tarea;Estatus;Vence;Prioridad;Subtareas;Días de retraso");
    expect(lines[1]).toBe('Casa Lomas;Diseño;"Planos; fase 1";Pendiente;2026-11-04;Media;1/2;5');
    expect(lines[2]).toBe(`Torre Sur;Diseño;"'=SUMA ""x""";Pendiente;;Media;;0`);
    expect(lines[3]).toBe("");
    expect(miEspacioCsvFileName(TODAY)).toBe("mi-espacio-tareas-2026-11-09.csv");
  });
});

describe("Visual: Mis tareas board and day hero", () => {
  /** Monday. */
  const MONDAY = "2026-11-09";

  function t(id: string, commitmentDate: string | null, patch: Partial<TaskListItem> = {}): TaskListItem {
    return { id, title: id, status: "pendiente", customStatus: null, commitmentDate, ...patch } as TaskListItem;
  }

  it("dueInfo labels", () => {
    expect(dueInfo(t("a", "2026-11-06"), MONDAY)).toEqual({ tone: "overdue", label: "Vencida · 6 nov", daysLate: 3 });
    expect(dueInfo(t("a", MONDAY), MONDAY)).toEqual({ tone: "today", label: "Hoy", daysLate: 0 });
    expect(dueInfo(t("a", "2026-11-10"), MONDAY)).toEqual({ tone: "soon", label: "mañana", daysLate: 0 });
    expect(dueInfo(t("a", "2026-11-12"), MONDAY)).toEqual({ tone: "soon", label: "jue 12 nov", daysLate: 0 });
    expect(dueInfo(t("a", "2026-11-18"), MONDAY)).toEqual({ tone: "later", label: "18 nov", daysLate: 0 });
    expect(dueInfo(t("a", null), MONDAY)).toEqual({ tone: "none", label: "Sin fecha", daysLate: 0 });
    expect(dueInfo(t("a", "2026-11-06", { status: "bloqueado" }), MONDAY).label).toBe("Vencida · 6 nov · bloqueada");
  });

  it("column presets: today, Friday of this week (today from Friday on), next Monday", () => {
    expect(bucketPresetDate("hoy", MONDAY)).toBe(MONDAY);
    expect(bucketPresetDate("semana", MONDAY)).toBe("2026-11-13");
    expect(bucketPresetDate("despues", MONDAY)).toBe("2026-11-16");
    expect(bucketPresetDate("semana", "2026-11-14")).toBe("2026-11-14");
    expect(bucketPresetDate("despues", "2026-11-15")).toBe("2026-11-16");
  });

  it("greeting by hour in org time zone", () => {
    // America/Mexico_City is UTC−6.
    expect(greeting(new Date("2026-11-09T17:59:00Z"), "Ana Pérez")).toBe("Buenos días, Ana");
    expect(greeting(new Date("2026-11-09T18:00:00Z"), "Ana Pérez")).toBe("Buenas tardes, Ana");
    expect(greeting(new Date("2026-11-10T00:59:00Z"), "Ana Pérez")).toBe("Buenas tardes, Ana");
    expect(greeting(new Date("2026-11-10T01:00:00Z"), "Ana Pérez")).toBe("Buenas noches, Ana");
    expect(greeting(new Date("2026-11-09T12:00:00Z"), "")).toBe("Buenos días");
  });

  it("daySentence 0/1/n tasks with and without reminder", () => {
    const now = new Date("2026-11-09T16:00:00Z"); // 10:00 in Mexico City
    const reminder = { text: "Llamar a obra", dueAt: "2026-11-09T22:00:00Z" };
    expect(daySentence({ now, todayCount: 0, reminder: null })).toBe("Lunes 9 de noviembre. No tienes tareas para hoy.");
    expect(daySentence({ now, todayCount: 1, reminder: null })).toBe("Lunes 9 de noviembre. Tienes 1 tarea para hoy.");
    expect(daySentence({ now, todayCount: 3, reminder: null })).toBe("Lunes 9 de noviembre. Tienes 3 tareas para hoy.");
    expect(daySentence({ now, todayCount: 3, reminder })).toBe(
      "Lunes 9 de noviembre. Tienes 3 tareas para hoy y «Llamar a obra» a las 16:00.",
    );
    expect(daySentence({ now, todayCount: 0, reminder })).toBe(
      "Lunes 9 de noviembre. No tienes tareas para hoy y «Llamar a obra» a las 16:00.",
    );
  });

  it("nextReminderToday takes the first live reminder later today", () => {
    const now = new Date("2026-11-09T16:00:00Z");
    const list = [
      { id: "antes", dueAt: "2026-11-09T15:00:00Z", cancelledAt: null },
      { id: "cancelado", dueAt: "2026-11-09T17:00:00Z", cancelledAt: "2026-11-09T10:00:00Z" },
      { id: "tarde", dueAt: "2026-11-09T22:00:00Z", cancelledAt: null },
      { id: "pronto", dueAt: "2026-11-09T19:00:00Z", cancelledAt: null },
      { id: "manana", dueAt: "2026-11-10T15:00:00Z", cancelledAt: null },
    ];
    expect(nextReminderToday(list, now)?.id).toBe("pronto");
    expect(nextReminderToday([list[4]!], now)).toBeNull();
  });

  it("timeAgo", () => {
    const now = new Date("2026-11-09T18:00:00Z");
    expect(timeAgo("2026-11-09T17:48:00Z", now)).toBe("hace 12 min");
    expect(timeAgo("2026-11-09T15:00:00Z", now)).toBe("hace 3 h");
    expect(timeAgo("2026-11-08T18:00:00Z", now)).toBe("ayer");
    expect(timeAgo("2026-11-06T18:00:00Z", now)).toBe("6 nov");
  });
});
