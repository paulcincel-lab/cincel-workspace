/**
 * Cronograma and Reporte hydrate from the server prefetch (#961): the page
 * calls `loadProyectoCronograma` directly under `qk.proyectos.cronograma(id)`,
 * dehydrates, and the client renders with no action call. A non-admin's
 * dehydrated state carries no payment rows (plan §4.8 rule 2).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/proyectos/p/cronograma",
}));

const actions = vi.hoisted(() => ({
  getProyectoCronogramaData: vi.fn(),
  setTaskStatusAction: vi.fn(),
  toggleTaskFlagAction: vi.fn(),
}));

vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoCronogramaData: actions.getProyectoCronogramaData,
}));

vi.mock("@/lib/actions/schedule-actions", () => ({
  setTaskStatusAction: actions.setTaskStatusAction,
  toggleTaskFlagAction: actions.toggleTaskFlagAction,
  addImprevistoAction: vi.fn(),
  deleteImprevistoAction: vi.fn(),
  previewImportScheduleAction: vi.fn(),
  commitImportScheduleAction: vi.fn(),
  importLegacyStateAction: vi.fn(),
}));

const PAYMENTS = [
  { fecha: "2026-09-01", pagadoPct: 30, avancePct: 40 },
  { fecha: "2026-10-01", pagadoPct: 60, avancePct: 70 },
];

// The repository's rule (#946): payment rows are read for admins only.
const repo = vi.hoisted(() => ({ getScheduleForProject: vi.fn() }));
vi.mock("@/lib/repositories/schedule-repository", () => repo);

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { loadProyectoCronograma } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { proyectoCronogramaOptions } from "@/lib/query/options/proyectos";
import { prefetch } from "@/lib/query/server";
import { hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import type { CronogramaData } from "@/lib/types/schedule";
import type { ViewerScope } from "@/lib/types/core";
import { settle } from "@/tests/helpers/settle";

import CronogramaView from "./cronograma-view";
import { CronogramaReport } from "./cronograma-report";

const PID = "11111111-1111-4111-8111-111111111111";

function user(access: "Administrador" | "Colaborador"): AuthenticatedUser {
  return {
    member: {
      id: `${access}-id`,
      name: access,
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access,
  } as AuthenticatedUser;
}

function schedule(withPayments: boolean): CronogramaData {
  return {
    project: { id: PID, name: "Madrid 22", address: null },
    schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
    tasks: [
      {
        id: "t1",
        stableKey: "PB-1",
        legacyId: null,
        planta: "PB",
        seccion: "Preliminares",
        responsable: null,
        inicio: "2026-09-14",
        fin: "2026-09-20",
        tarea: "Trazo y nivelación",
        status: "progress",
        flagged: false,
      },
    ],
    payments: withPayments ? PAYMENTS : [],
    imprevistos: [{ id: "i1", fecha: "2026-09-02", texto: "Reparación de muro" }],
    adicionales: [],
  };
}

repo.getScheduleForProject.mockImplementation(async (_id: string, viewer: ViewerScope) => schedule(viewer.isAdmin));

function prefetchAs(access: "Administrador" | "Colaborador") {
  return hydrationRoundtrip((server) =>
    prefetch(server, proyectoCronogramaOptions(PID), () => loadProyectoCronograma(user(access), { id: PID })),
  );
}

const noActionCalls = () => {
  expect(actions.getProyectoCronogramaData).not.toHaveBeenCalled();
  expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
  expect(actions.toggleTaskFlagAction).not.toHaveBeenCalled();
};

afterEach(() => {
  cleanup();
  actions.getProyectoCronogramaData.mockClear();
});

describe("Cronograma hydration", () => {
  it("renders the tab from the dehydrated schedule with 0 client action calls", async () => {
    const { client, state } = await prefetchAs("Colaborador");
    renderWithQueryClient(<CronogramaView projectId={PID} />, { client, hydrate: state });
    await settle(client);
    expect(screen.getAllByText("Trazo y nivelación").length).toBeGreaterThan(0);
    expect(screen.getByText("Reparación de muro")).toBeTruthy();
    noActionCalls();
  });

  it("renders Reporte from the same key with 0 client action calls", async () => {
    const { client, state } = await prefetchAs("Colaborador");
    renderWithQueryClient(<CronogramaReport projectId={PID} asOf="2026-09-18" />, { client, hydrate: state });
    await settle(client);
    expect(screen.getByRole("article", { name: "Hoja del reporte" })).toBeTruthy();
    noActionCalls();
  });

  it("dehydrates one query, the cronograma key", async () => {
    const { state } = await prefetchAs("Colaborador");
    expect(state.queries.map((q) => q.queryKey)).toEqual([qk.proyectos.cronograma(PID)]);
  });

  it("a non-admin's dehydrated state has no payment rows", async () => {
    const { state } = await prefetchAs("Colaborador");
    const json = JSON.stringify(state);
    expect(json).not.toContain("pagadoPct");
    expect(json).not.toContain("avancePct");
    const view = state.queries[0]!.state.data as { data: CronogramaData };
    expect(view.data.payments).toEqual([]);
  });

  it("an admin's dehydrated state has the payments", async () => {
    const { state } = await prefetchAs("Administrador");
    const view = state.queries[0]!.state.data as { data: CronogramaData };
    expect(view.data.payments).toEqual(PAYMENTS);
  });
});
