// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/query/options/inicio", () => ({ inicioPageOptions: vi.fn() }));
vi.mock("@/lib/query/options/tareas", () => ({ tareasPageKeyInputOf: vi.fn(), tareasPageOptions: vi.fn() }));
vi.mock("@/lib/actions/page-data/calendario-actions", () => ({
  getCalendarioRange: vi.fn(),
  getCalendarioList: vi.fn(),
  getCalendarioDaySummary: vi.fn(),
  getCalendarioWeekSummary: vi.fn(),
  getCalendarioLoad: vi.fn(),
  getMeetingDetail: vi.fn(),
  getMeetingPrep: vi.fn(),
  getMeetingMinutes: vi.fn(),
  getPlanWeek: vi.fn(),
  getProposal: vi.fn(),
}));

import { NAV_PREFETCH } from "./nav-prefetch";

describe("NAV_PREFETCH.calendario (Decision F2)", () => {
  it("warms the range /calendario opens with in the style's default vista", () => {
    const visual = NAV_PREFETCH.calendario!("visual");
    const esencial = NAV_PREFETCH.calendario!("esencial");
    expect(visual.queryKey.slice(0, 2)).toEqual(["calendario", "range"]);
    expect((visual.queryKey[2] as { view: string }).view).toBe("mes");
    expect((esencial.queryKey[2] as { view: string }).view).toBe("semana");
    expect((esencial.queryKey[2] as { filters: { quien: string } }).filters.quien).toBe("yo");
  });
});
