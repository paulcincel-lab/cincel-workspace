import { describe, expect, it } from "vitest";

import { projectsByTramo, tasksByBaseStatus } from "./donut-groups";

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

describe("projectsByTramo", () => {
  it("groups by current etapa in etapa order and puts projects without one in Sin etapa", () => {
    const presale = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
    const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
    const slices = projectsByTramo([
      { currentWorkflow: diseno },
      { currentWorkflow: null },
      { currentWorkflow: presale },
      { currentWorkflow: diseno },
    ]);
    expect(slices.map(({ key, label, count }) => ({ key, label, count }))).toEqual([
      { key: "w1", label: "Presale", count: 1 },
      { key: "w2", label: "Diseño", count: 2 },
      { key: "sin-tramo", label: "Sin etapa", count: 1 },
    ]);
    expect(slices[0].color).toBe("var(--chart-1)");
    expect(slices[1].color).toBe("var(--chart-2)");
    expect(slices[2].color).toBe("var(--muted-foreground)");
  });

  it("has no Sin etapa slice when every project has a etapa", () => {
    const slices = projectsByTramo([{ currentWorkflow: { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 } }]);
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ key: "w3", count: 1 });
  });

  it("returns no slices for no projects", () => {
    expect(projectsByTramo([])).toEqual([]);
  });
});
