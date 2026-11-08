/**
 * `proyectoShellOptions` (#954): `qk.proyectos.shell(id)`, 30 s stale, the
 * action as `queryFn`, and `counts.archivos` from the cached root listing.
 */
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ getProyectoShell: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-shell-actions", () => action);

import { qk, STALE } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";

import { proyectoShellOptions, withCachedArchivosCount } from "./proyectos-shell";

const ID = "22222222-2222-4222-8222-222222222222";

const shell = {
  detail: { id: ID },
  project: { id: ID, name: "Casa Lomas", tramo: null, projectType: null, addressCity: null, manager: null },
  counts: { tareas: 3, archivos: 0, clientes: 1 },
  canManagePortal: true,
} as unknown as ProjectTabShell;

describe("proyectoShellOptions", () => {
  it("uses the shell key and the screen stale time", () => {
    const opts = proyectoShellOptions(ID);
    expect(opts.queryKey).toEqual(qk.proyectos.shell(ID));
    expect(opts.staleTime).toBe(STALE.screen);
    expect("initialData" in opts).toBe(false);
    expect(proyectoShellOptions(ID, shell).initialData).toBe(shell);
  });

  it("fetches through getProyectoShell", async () => {
    action.getProyectoShell.mockResolvedValueOnce(shell);
    const client = createTestQueryClient();
    expect(await client.fetchQuery(proyectoShellOptions(ID))).toEqual(shell);
    expect(action.getProyectoShell).toHaveBeenCalledWith({ id: ID });
  });

  it("takes archivos from the cached root listing", async () => {
    action.getProyectoShell.mockResolvedValueOnce(shell);
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.archivos(ID, null), {
      status: "ok",
      folderId: "root",
      breadcrumbs: [],
      items: [{}, {}, {}, {}],
    });
    const data = await client.fetchQuery(proyectoShellOptions(ID));
    expect(data?.counts).toEqual({ tareas: 3, archivos: 4, clientes: 1 });
  });
});

describe("withCachedArchivosCount", () => {
  it("leaves null and uncached or non-ok listings as they are", () => {
    const client = createTestQueryClient();
    expect(withCachedArchivosCount(client, null)).toBeNull();
    expect(withCachedArchivosCount(client, shell)).toBe(shell);
    client.setQueryData(qk.proyectos.archivos(ID, null), { status: "needs_consent" });
    expect(withCachedArchivosCount(client, shell)).toBe(shell);
  });
});
