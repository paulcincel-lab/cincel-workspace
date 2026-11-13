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
  getAjustesEtapasPageData: vi.fn(),
  getAjustesPermisosPageData: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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
vi.mock("@/lib/actions/permissions-actions", () => ({ savePermissionsMatrixAction: vi.fn(), restoreDefaultPermissionsAction: vi.fn() }));

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/FormDialog", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { PuestosClient } from "@/app/(staff)/ajustes/(admin)/puestos/PuestosClient";
import { EtapasClient } from "@/app/(staff)/ajustes/(admin)/etapas/EtapasClient";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";
import {
  ajustesEstatusOptions,
  ajustesPermisosOptions,
  ajustesPuestosOptions,
  ajustesEtapasOptions,
  seedAjustesCatalogs,
} from "@/lib/query/options/ajustes";
import { prefetch } from "@/lib/query/server";

const STATUS: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };

const ETAPA: WorkflowDetail = {
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
const INACTIVE_ETAPA: WorkflowDetail = { ...ETAPA, id: "w0", key: "viejo", name: "Viejo", active: false, sortOrder: 0 };

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
      const data = { statuses: [STATUS], baseCounts: { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 }, customUsage: {} };
      await prefetch(qc, ajustesEstatusOptions(), async () => data);
      seedAjustesCatalogs(qc, { seg: "estatus", data });
    });
    expect(serverClient.getQueryData(qk.catalog.taskStatuses())).toEqual([STATUS]);

    renderWithQueryClient(<EstatusSettings />, { client, hydrate: state });

    expect(screen.getByRole("row", { name: /En revisión/ })).toBeTruthy();
    expect(client.getQueryData(qk.catalog.taskStatuses())).toEqual([STATUS]);
    noPageDataCalls();
  });

  it("puestos: renders the prefetched puestos and seeds catalog.workflows", async () => {
    const data = { positions: [PUESTO], workflows: [ETAPA] };
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

  it("etapas: renders the prefetched etapas; the catalog seed keeps only active ones", async () => {
    const data = { workflows: [INACTIVE_ETAPA, ETAPA], activeProjects: {}, phaseTaskCounts: {} };
    const { client, state } = await hydrationRoundtrip(async (qc) => {
      await prefetch(qc, ajustesEtapasOptions(), async () => data);
      seedAjustesCatalogs(qc, { seg: "etapas", data });
    });

    renderWithQueryClient(<EtapasClient />, { client, hydrate: state });

    // One row per etapa, in flow order.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent?.startsWith("Viejo")).toBe(true);
    expect(rows[1].textContent?.startsWith("Diseño")).toBe(true);
    expect(client.getQueryData(qk.catalog.workflows())).toEqual([
      { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 },
    ]);
    noPageDataCalls();
  });

  it("permisos: renders the prefetched summary", async () => {
    const data = {
      staff: [{ id: "a1", name: "Alejandro", lastName: null, active: true, access: "Administrador" as const }],
      defaultPermissions: buildDefaultPermissionsState(),
      permissions: buildDefaultPermissionsState(),
      hasCustom: false,
    };
    const { client, state } = await hydrationRoundtrip((qc) =>
      prefetch(qc, ajustesPermisosOptions(), async () => data),
    );

    renderWithQueryClient(<PermisosSettings />, { client, hydrate: state });

    expect(screen.getByRole("rowheader", { name: "Personas por acceso" })).toBeTruthy();
    // Each access count names its people in the cell's title.
    expect(screen.getByTitle(/Alejandro/)).toBeTruthy();
    noPageDataCalls();
  });
});
