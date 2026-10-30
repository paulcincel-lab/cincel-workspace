import { describe, expect, it } from "vitest";

import { projectsByArea, tasksByBaseStatus } from "./donut-groups";

describe("tasksByBaseStatus", () => {
  it("counts custom statuses under their base status", () => {
    const slices = tasksByBaseStatus([
      { status: "pendiente", customStatus: null },
      { status: "en_proceso", customStatus: { closes: false } },
      { status: "en_proceso", customStatus: { closes: true } },
      { status: "bloqueado" },
    ]);
    expect(Object.fromEntries(slices.map((s) => [s.key, s.count]))).toEqual({
      pendiente: 1,
      en_proceso: 1,
      completado: 1,
      bloqueado: 1,
    });
    expect(slices.find((s) => s.key === "bloqueado")?.color).toBe(
      "var(--destructive)",
    );
  });
});

describe("projectsByArea", () => {
  it("groups by área and puts projects without one in Sin área", () => {
    const diseno = { id: "a2", name: "Diseño", colorSlot: 2 };
    const slices = projectsByArea([
      { area: diseno },
      { area: diseno },
      { area: null },
    ]);
    expect(slices).toEqual([
      { key: "a2", label: "Diseño", count: 2, color: "var(--chart-2)" },
      {
        key: "sin-area",
        label: "Sin área",
        count: 1,
        color: "var(--muted-foreground)",
      },
    ]);
  });
});
