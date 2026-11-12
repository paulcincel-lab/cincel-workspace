import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  canViewCalendar: true,
  user: { member: { id: "s-viewer" }, email: "", access: "Colaborador" },
  loadCalendarioRange: vi.fn(),
  loadCalendarioList: vi.fn(),
  loadCatalogWorkflows: vi.fn(),
  loadCatalogProjectOptions: vi.fn(),
  appearance: { style: "visual" as string | null },
  org: { styleDefault: "visual", allowUserOverride: true },
  preferences: null as { hideCompletedTasks?: boolean } | null,
  client: null as unknown,
}));

vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => m.user) }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveCalendarCapabilities: () => ({ canViewCalendar: m.canViewCalendar, canViewTeamCalendar: false, canViewDailyAgenda: true }),
}));
vi.mock("@/lib/loaders/calendario", () => ({ loadCalendarioRange: m.loadCalendarioRange, loadCalendarioList: m.loadCalendarioList }));
vi.mock("@/lib/loaders/catalog", () => ({
  loadCatalogWorkflows: m.loadCatalogWorkflows,
  loadCatalogProjectOptions: m.loadCatalogProjectOptions,
}));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () => m.appearance,
  getStoredOrgAppearance: async () => m.org,
  getMyPreferences: async () => m.preferences,
}));
vi.mock("@/lib/query/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/server")>()),
  getQueryClient: () => m.client,
}));
vi.mock("@/components/calendario/CalendarioClient", () => ({ CalendarioClient: () => null }));

import { CalendarioClient } from "@/components/calendario/CalendarioClient";
import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { Hydrate } from "@/lib/query/hydrate";
import { createTestQueryClient } from "@/lib/query/test-utils";

import CalendarioPage from "./page";

const run = (searchParams: Record<string, string> = {}) => CalendarioPage({ searchParams: Promise.resolve(searchParams) });

const lastRangeInput = () => m.loadCalendarioRange.mock.calls.at(-1)?.[1] as { view: string; from: string; to: string; filters: { ocultarCompletadas: boolean } };

beforeEach(() => {
  m.canViewCalendar = true;
  m.appearance = { style: "visual" };
  m.org = { styleDefault: "visual", allowUserOverride: true };
  m.preferences = null;
  m.client = createTestQueryClient();
  m.loadCalendarioRange.mockReset().mockImplementation(async (_user: unknown, i: { from: string; to: string }) => emptyCalendarioRange(i));
  m.loadCalendarioList.mockReset().mockResolvedValue({ rows: [], nextCursor: null, total: 0 });
  m.loadCatalogWorkflows.mockReset().mockResolvedValue([]);
  m.loadCatalogProjectOptions.mockReset().mockResolvedValue([]);
});

describe("/calendario", () => {
  it("shows the permission-denied state without canViewCalendar and loads nothing", async () => {
    m.canViewCalendar = false;
    const element = (await run()) as ReactElement;
    expect(element.type).toBe(PermissionDenied);
    expect(m.loadCalendarioRange).not.toHaveBeenCalled();
  });

  it("prefetches the range and the catalogs and hydrates CalendarioClient with no data props", async () => {
    const element = (await run({ vista: "semana", fecha: "2026-11-11" })) as ReactElement<{ qc: unknown; children: ReactElement }>;
    expect(element.type).toBe(Hydrate);
    expect(element.props.qc).toBe(m.client);
    expect(element.props.children.type).toBe(CalendarioClient);
    expect(element.props.children.props).toEqual({});
    expect(lastRangeInput()).toMatchObject({ view: "semana", from: "2026-11-09", to: "2026-11-15" });
    expect(m.loadCatalogWorkflows).toHaveBeenCalledTimes(1);
    expect(m.loadCatalogProjectOptions).toHaveBeenCalledTimes(1);
  });

  it("defaults the vista to the month in Visual and to the week in Esencial and Analítico (F3)", async () => {
    await run({ fecha: "2026-11-11" });
    expect(lastRangeInput().view).toBe("mes");
    m.client = createTestQueryClient();
    m.appearance = { style: "esencial" };
    await run({ fecha: "2026-11-11" });
    expect(lastRangeInput().view).toBe("semana");
    m.client = createTestQueryClient();
    await run({ fecha: "2026-11-11", estilo: "analitico" });
    expect(lastRangeInput().view).toBe("semana");
  });

  it("prefetches the first page of rows only for Analítico", async () => {
    await run();
    expect(m.loadCalendarioList).not.toHaveBeenCalled();
    m.client = createTestQueryClient();
    m.appearance = { style: "analitico" };
    await run({ fecha: "2026-11-11" });
    expect(m.loadCalendarioList).toHaveBeenCalledTimes(1);
    expect(m.loadCalendarioList.mock.calls[0]![1]).toMatchObject({ from: "2026-11-09", to: "2026-11-15", orderDir: "asc", cursor: null });
  });

  it("follows the hide-completed preference when the URL does not say", async () => {
    m.preferences = { hideCompletedTasks: true };
    await run();
    expect(lastRangeInput().filters.ocultarCompletadas).toBe(true);
    m.client = createTestQueryClient();
    await run({ ocultar: "0" });
    expect(lastRangeInput().filters.ocultarCompletadas).toBe(false);
  });
});
