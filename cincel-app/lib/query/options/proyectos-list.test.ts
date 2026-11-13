/**
 * Proyectos list, Resumen and Tareas query options (Query Migration 5a,
 * #959): their keys, the screen stale time, the actions as query functions,
 * and the Resumen's root listing count seeded into the cached shell.
 */
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getProyectosPageData: vi.fn(),
  getProyectoResumenData: vi.fn(),
  getProyectoResumenSummary: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => actions);

import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { STALE, qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

import { proyectoResumenOptions, proyectoResumenSummaryOptions, proyectosPageOptions, seedResumenArchivosCount } from "./proyectos";

const ID = "33333333-3333-4333-8333-333333333333";

const shell = {
  detail: { id: ID },
  project: { id: ID, name: "Casa Lomas", etapa: null },
  counts: { tareas: 3, archivos: 0, clientes: 1 },
  canManagePortal: true,
} as unknown as ProjectTabShell;

const resumen = (files: unknown[] | null) => ({ project: { id: ID }, files }) as unknown as ProjectSummaryInput;

describe("Proyectos 5a query options", () => {
  it("use their keys and the screen stale time", () => {
    expect(proyectosPageOptions().queryKey).toEqual(qk.proyectos.list());
    expect(proyectoResumenOptions(ID).queryKey).toEqual(qk.proyectos.resumen(ID));
    expect(proyectoResumenSummaryOptions(ID).queryKey).toEqual(qk.proyectos.resumenSummary(ID));
    // Under the project's Tareas prefix: every task invalidation of the project refreshes it.
    expect(qk.proyectos.resumenSummary(ID).slice(0, 3)).toEqual(qk.proyectos.tab(ID, "tareas"));
    for (const opts of [proyectosPageOptions(), proyectoResumenOptions(ID), proyectoResumenSummaryOptions(ID)]) {
      expect(opts.staleTime).toBe(STALE.screen);
    }
  });

  it("fetch through their page-data actions", async () => {
    const client = createTestQueryClient();
    actions.getProyectosPageData.mockResolvedValueOnce({ projects: [] });
    actions.getProyectoResumenData.mockResolvedValueOnce(null);
    actions.getProyectoResumenSummary.mockResolvedValueOnce(null);
    await client.fetchQuery(proyectosPageOptions());
    await client.fetchQuery(proyectoResumenOptions(ID));
    await client.fetchQuery(proyectoResumenSummaryOptions(ID));
    expect(actions.getProyectosPageData).toHaveBeenCalledWith({});
    expect(actions.getProyectoResumenData).toHaveBeenCalledWith({ id: ID });
    expect(actions.getProyectoResumenSummary).toHaveBeenCalledWith({ id: ID });
  });

  it("the Resumen fetch writes its root listing count into the cached shell", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.shell(ID), shell);
    actions.getProyectoResumenData.mockResolvedValueOnce(resumen([{}, {}, {}]));
    await client.fetchQuery(proyectoResumenOptions(ID));
    expect(client.getQueryData<ProjectTabShell>(qk.proyectos.shell(ID))?.counts).toEqual({
      tareas: 3,
      archivos: 3,
      clientes: 1,
    });
  });

  it("seedResumenArchivosCount leaves the shell alone without a listing or without a shell", () => {
    const client = createTestQueryClient();
    seedResumenArchivosCount(client, ID, resumen([{}]));
    expect(client.getQueryData(qk.proyectos.shell(ID))).toBeUndefined();
    client.setQueryData(qk.proyectos.shell(ID), shell);
    seedResumenArchivosCount(client, ID, resumen(null));
    seedResumenArchivosCount(client, ID, null);
    expect(client.getQueryData<ProjectTabShell>(qk.proyectos.shell(ID))?.counts.archivos).toBe(0);
  });
});
