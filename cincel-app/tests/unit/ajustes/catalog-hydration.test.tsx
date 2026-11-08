// @vitest-environment happy-dom
/**
 * Ajustes catalog segments (Query Migration 9b, #964): what each page
 * prefetches on the server reaches the client through the dehydrated state,
 * so the client renders with **0** page-data calls on mount.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import type { Position, TaskStatusOption, WorkflowDetail } from "@/lib/types/core";

const pageData = vi.hoisted(() => ({
  getAjustesEstatusPageData: vi.fn(),
  getAjustesPuestosPageData: vi.fn(),
  getAjustesTramosPageData: vi.fn(),
  getAjustesPermisosPageData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

const mutations = vi.hoisted(() => ({
  fetchTaskStatusesAction: vi.fn(),
  createTaskStatusAction: vi.fn(),
  updateTaskStatusAction: vi.fn(),
  deleteTaskStatusAction: vi.fn(),
  fetchPositionsAction: vi.fn(),
  createPositionAction: vi.fn(),
  updatePositionAction: vi.fn(),
  deletePositionAction: vi.fn(),
  reorderPositionsAction: vi.fn(),
  setPositionPhasesAction: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  createTemplateAction: vi.fn(),
  updateTemplateAction: vi.fn(),
  deactivateTemplateAction: vi.fn(),
  reorderTemplatesAction: vi.fn(),
  createWorkflowPhaseAction: vi.fn(),
  updateWorkflowPhaseAction: vi.fn(),
  reorderWorkflowPhasesAction: vi.fn(),
  setWorkflowAutoStartAction: vi.fn(),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => mutations);
vi.mock("@/lib/actions/positions-actions", () => mutations);
vi.mock("@/lib/actions/workflows-actions", () => mutations);

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/FormDialog", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { PuestosClient } from "@/app/(staff)/ajustes/(admin)/puestos/PuestosClient";
import { TramosClient } from "@/app/(staff)/ajustes/(admin)/tramos/TramosClient";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";
import {
  ajustesEstatusOptions,
  ajustesPermisosOptions,
  ajustesPuestosOptions,
  ajustesTramosOptions,
  seedAjustesCatalogs,
} from "@/lib/query/options/ajustes";
import { prefetch } from "@/lib/query/server";

const STATUS: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };

const TRAMO: WorkflowDetail = {
  id: "w1",
  key: "diseno",
  name: "Diseño",
  description: null,
  active: true,
  sortOrder: 1,
  autoStart: "manual",
  phases: [{ id: "f1", name: "Ejecutivo", sortOrder: 0, workflowId: "w1", active: true, templateCount: 0 }],
  templates: [],
  readiness: null,
};
const INACTIVE_TRAMO: WorkflowDetail = { ...TRAMO, id: "w0", key: "viejo", name: "Viejo", active: false, sortOrder: 0 };

const PUESTO: Position = {
  id: "p1",
  name: "Residente de obra",
  sortOrder: 0,
  active: true,
  staffCount: 0,
  googleManaged: false,
  phases: [],
};

function noPageDataCalls() {
  for (const fn of Object.values(pageData)) expect(fn).not.toHaveBeenCalled();
  expect(mutations.fetchTaskStatusesAction).not.toHaveBeenCalled();
  expect(mutations.fetchPositionsAction).not.toHaveBeenCalled();
  expect(mutations.fetchWorkflowsAction).not.toHaveBeenCalled();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Ajustes catalog hydration", () => {
  it("estatus: renders the prefetched statuses and seeds catalog.taskStatuses", async () => {
    const { client, state, serverClient } = await hydrationRoundtrip(async (qc) => {
      await prefetch(qc, ajustesEstatusOptions(), async () => ({ statuses: [STATUS] }));
      seedAjustesCatalogs(qc, { seg: "estatus", data: { statuses: [STATUS] } });
    });
    expect(serverClient.getQueryData(qk.catalog.taskStatuses())).toEqual([STATUS]);

    renderWithQueryClient(<EstatusSettings />, { client, hydrate: state });

    expect(screen.getByRole("group", { name: "En revisión" })).toBeTruthy();
    expect(client.getQueryData(qk.catalog.taskStatuses())).toEqual([STATUS]);
    noPageDataCalls();
  });

  it("puestos: renders the prefetched puestos and seeds catalog.workflows", async () => {
    const data = { positions: [PUESTO], workflows: [TRAMO] };
    const { client, state } = await hydrationRoundtrip(async (qc) => {
      await prefetch(qc, ajustesPuestosOptions(), async () => data);
      seedAjustesCatalogs(qc, { seg: "puestos", data });
    });

    renderWithQueryClient(<PuestosClient />, { client, hydrate: state });

    expect(screen.getByText("Residente de obra")).toBeTruthy();
    expect(client.getQueryData(qk.catalog.workflows())).toEqual([
      { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 },
    ]);
    noPageDataCalls();
  });

  it("tramos: renders the prefetched tramos; the catalog seed keeps only active ones", async () => {
    const data = { workflows: [INACTIVE_TRAMO, TRAMO] };
    const { client, state } = await hydrationRoundtrip(async (qc) => {
      await prefetch(qc, ajustesTramosOptions(), async () => data);
      seedAjustesCatalogs(qc, { seg: "tramos", data });
    });

    renderWithQueryClient(<TramosClient />, { client, hydrate: state });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Viejo", "Diseño"]);
    expect(client.getQueryData(qk.catalog.workflows())).toEqual([
      { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 },
    ]);
    noPageDataCalls();
  });

  it("permisos: renders the prefetched summary", async () => {
    const data = {
      staff: [{ id: "a1", name: "Alejandro", lastName: null, active: true, access: "Administrador" as const }],
      defaultPermissions: buildDefaultPermissionsState(),
    };
    const { client, state } = await hydrationRoundtrip((qc) =>
      prefetch(qc, ajustesPermisosOptions(), async () => data),
    );

    renderWithQueryClient(<PermisosSettings />, { client, hydrate: state });

    expect(screen.getByRole("region", { name: "Personas por acceso" })).toBeTruthy();
    expect(screen.getByText(/Alejandro/)).toBeTruthy();
    noPageDataCalls();
  });
});
