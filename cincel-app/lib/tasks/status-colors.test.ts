// @vitest-environment node
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  changeToneClass,
  customStatusBase,
  isDueDateLate,
  statusBorderClass,
  statusColorToken,
  statusColorVar,
  statusDotClass,
  statusTintClass,
} from "./status-options";

describe("status → color token mapping", () => {
  it("maps every base status to its token", () => {
    expect(BASE_STATUS_COLOR).toEqual({
      completado: "chart-1",
      en_proceso: "chart-2",
      pendiente: "chart-3",
      bloqueado: "destructive",
    });
    for (const status of BASE_STATUSES) expect(BASE_STATUS_COLOR[status]).toBeDefined();
  });

  it("uses red (destructive) only for Bloqueado", () => {
    const red = BASE_STATUSES.filter((s) => BASE_STATUS_COLOR[s] === "destructive");
    expect(red).toEqual(["bloqueado"]);
  });

  it("colors a base-status task by its status", () => {
    expect(statusColorToken({ status: "completado" })).toBe("chart-1");
    expect(statusColorToken({ status: "en_proceso", customStatus: null })).toBe("chart-2");
    expect(statusColorToken({ status: "pendiente" })).toBe("chart-3");
    expect(statusColorToken({ status: "bloqueado" })).toBe("destructive");
  });

  it("colors a custom status with its base status's color", () => {
    const open = { closes: false };
    expect(statusColorToken({ status: "en_proceso", customStatus: open })).toBe("chart-2");
    expect(statusColorToken({ status: "pendiente", customStatus: open })).toBe("chart-3");
    expect(statusColorToken({ status: "bloqueado", customStatus: open })).toBe("destructive");
    expect(statusColorToken({ status: "completado", customStatus: { closes: true } })).toBe("chart-1");
  });

  it("treats a closing custom status as Completado even without the stored base", () => {
    expect(statusColorToken({ status: "en_proceso", customStatus: { closes: true } })).toBe("chart-1");
  });

  it("gives a custom status without a task the base it reads as", () => {
    expect(BASE_STATUS_COLOR[customStatusBase({ closes: true })]).toBe("chart-1");
    expect(BASE_STATUS_COLOR[customStatusBase({ closes: false })]).toBe("chart-2");
  });

  it("returns token classes and CSS vars, never hex", () => {
    expect(statusDotClass("chart-1")).toBe("bg-chart-1");
    expect(statusDotClass("destructive")).toBe("bg-destructive");
    expect(statusTintClass("chart-2")).toBe("bg-chart-2/10");
    expect(statusBorderClass("chart-3")).toBe("border-chart-3");
    expect(statusColorVar("chart-3")).toBe("var(--chart-3)");
    expect(statusColorVar("destructive")).toBe("var(--destructive)");
  });
});

describe("change and late colors", () => {
  it("positive change is success, negative is destructive, zero is neutral", () => {
    expect(changeToneClass(12)).toBe("bg-success text-success-foreground");
    expect(changeToneClass(-4)).toBe("bg-destructive/10 text-destructive");
    expect(changeToneClass(0)).toBe("bg-muted text-muted-foreground");
  });

  it("flags a due date as late only when past and the task is open", () => {
    const today = "2026-10-29";
    expect(isDueDateLate("2026-10-27", today, { status: "en_proceso" })).toBe(true);
    expect(isDueDateLate("2026-10-29", today, { status: "en_proceso" })).toBe(false);
    expect(isDueDateLate("2026-11-02", today, { status: "pendiente" })).toBe(false);
    expect(isDueDateLate("2026-10-27", today, { status: "completado" })).toBe(false);
    expect(isDueDateLate("2026-10-27", today, { status: "en_proceso", customStatus: { closes: true } })).toBe(false);
    expect(isDueDateLate(null, today, { status: "en_proceso" })).toBe(false);
  });
});

// Components that show a task status must take its color from the mapping above.
const STATUS_COMPONENTS = [
  "app/dashboard/DashboardClient.tsx",
  "components/tareas/TaskStatusCell.tsx",
  "components/v2/status/StatusBadge.tsx",
  "components/cronograma/task-card.tsx",
  "app/configuracion/estatus/EstatusClient.tsx",
  "app/proyectos/[id]/ficha/page.tsx",
];

describe("status components", () => {
  it.each(STATUS_COMPONENTS)("%s does not hard-code status colors", (file) => {
    const src = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(?:bg|text|border)-(?:red|green|yellow|emerald|blue|orange)-\d{2,3}\b/);
    expect(src).not.toMatch(/\b(?:bg|border)-(?:chart-\d|destructive)\b(?!\/)/);
  });
});
