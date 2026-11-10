import { describe, expect, it } from "vitest";

import { DAYS_LATE_HEAT, OVERDUE_SHARE_HEAT, PLAN_DEVIATION_HEAT } from "@/components/tareas/lista-table";
import { heatLevel } from "@/components/widgets/record-table-format";

describe("heatLevel", () => {
  it("above (default) is strict on both thresholds", () => {
    const heat = [{ ...OVERDUE_SHARE_HEAT }];
    expect(heatLevel(heat, "pctVencidas", 45)).toBeNull();
    expect(heatLevel(heat, "pctVencidas", 46)).toBe("warn");
    expect(heatLevel(heat, "pctVencidas", 60)).toBe("warn");
    expect(heatLevel(heat, "pctVencidas", 61)).toBe("crit");
    expect(heatLevel(heat, "abiertas", 99)).toBeNull();
    expect(heatLevel(heat, "pctVencidas", null)).toBeNull();
    expect(heatLevel(undefined, "pctVencidas", 99)).toBeNull();
  });

  it("days late: 3–4 plain, 6–9 warn, 12 crit", () => {
    const heat = [{ ...DAYS_LATE_HEAT }];
    expect(heatLevel(heat, "diasRetraso", 3)).toBeNull();
    expect(heatLevel(heat, "diasRetraso", 4)).toBeNull();
    expect(heatLevel(heat, "diasRetraso", 6)).toBe("warn");
    expect(heatLevel(heat, "diasRetraso", 9)).toBe("warn");
    expect(heatLevel(heat, "diasRetraso", 10)).toBe("warn");
    expect(heatLevel(heat, "diasRetraso", 12)).toBe("crit");
  });

  it("heatLevel direction below", () => {
    const heat = [{ ...PLAN_DEVIATION_HEAT }];
    expect(heatLevel(heat, "desvPlan", 2)).toBeNull();
    expect(heatLevel(heat, "desvPlan", -4)).toBeNull();
    expect(heatLevel(heat, "desvPlan", -5)).toBe("warn");
    expect(heatLevel(heat, "desvPlan", -7)).toBe("warn");
    expect(heatLevel(heat, "desvPlan", -8)).toBe("crit");
    expect(heatLevel(heat, "desvPlan", "-9")).toBe("crit");
    expect(heatLevel(heat, "desvPlan", undefined)).toBeNull();
  });
});
