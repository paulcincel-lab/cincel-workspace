// @vitest-environment happy-dom
/**
 * `/proyectos/[id]/archivos` (Query Migration 5d, #962): the shell and the
 * folder are prefetched in parallel (no sequential shell), Drive is listed
 * once per page (the root listing seeds the shell's Archivos count; with
 * `?folder=` the root is not listed again), and the client view renders from
 * the hydrated cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

const state = vi.hoisted(() => ({ signedIn: true, shell: true, files: "ok" as "ok" | "not_found" }));
const loaders = vi.hoisted(() => ({ loadProyectoShell: vi.fn(), loadProyectoArchivos: vi.fn() }));
const pageData = vi.hoisted(() => ({ getProyectoShell: vi.fn(), getProyectoArchivosData: vi.fn() }));
const tabsSeen = vi.hoisted(() => [] as ProjectTabsProps[]);

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => {
    if (!state.signedIn) throw new Error("UNAUTHENTICATED");
    return { member: { id: "s1", name: "Ana" }, access: "Colaborador" };
  },
}));
vi.mock("@/lib/ui/preferences-server", () => ({ getResolvedAppearance: async () => ({ style: "visual" }) }));
vi.mock("@/lib/loaders/proyectos-shell", () => ({ loadProyectoShell: loaders.loadProyectoShell }));
vi.mock("@/lib/loaders/proyectos", () => ({ loadProyectoArchivos: loaders.loadProyectoArchivos }));
vi.mock("@/lib/actions/page-data/proyectos-shell-actions", () => ({ getProyectoShell: pageData.getProyectoShell }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({ getProyectoArchivosData: pageData.getProyectoArchivosData }));
vi.mock("@/lib/actions/projects-actions", () => ({ retryProjectFolderAction: vi.fn() }));
vi.mock("@/lib/query/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/query/server")>();
  const { createTestQueryClient: make } = await import("@/lib/query/test-utils");
  return { ...real, getQueryClient: () => make() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: ProjectTabsProps) => {
    tabsSeen.push(props);
    return <nav aria-label="Secciones del proyecto" />;
  },
}));
vi.mock("@/components/proyectos/ProjectFiles", () => ({
  ProjectFiles: (props: { result: StaffFilesResult; canRetry: boolean }) => (
    <div data-testid="files">{`${props.result.status} · retry ${props.canRetry ? "sí" : "no"}`}</div>
  ),
}));

import ProjectArchivosPage from "./page";

const ID = "22222222-2222-4222-8222-222222222222";

const root: StaffFilesResult = { status: "ok", folderId: "root", breadcrumbs: [], items: [] };

function params(search: Record<string, string> = {}) {
  return { params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(search) };
}

async function renderPage(search: Record<string, string> = {}) {
  const qs = new URLSearchParams(search).toString();
  window.history.replaceState(null, "", `/proyectos/${ID}/archivos${qs ? `?${qs}` : ""}`);
  return renderWithQueryClient(await ProjectArchivosPage(params(search)), { client: createTestQueryClient() });
}

beforeEach(() => {
  Object.assign(state, { signedIn: true, shell: true, files: "ok" });
  tabsSeen.length = 0;
  vi.clearAllMocks();
  loaders.loadProyectoShell.mockImplementation(async () =>
    state.shell
      ? {
          detail: { id: ID },
          project: { id: ID, name: "Casa Lomas", tramo: null },
          counts: { tareas: 1, archivos: 0, clientes: 0 },
          canManagePortal: false,
        }
      : null,
  );
  loaders.loadProyectoArchivos.mockImplementation(async (_user: unknown, input: { folderId: string | null }) =>
    state.files === "not_found"
      ? { kind: "not_found" }
      : { kind: "ok", canRetry: true, result: { ...root, folderId: input.folderId ?? "root", items: [{}, {}, {}] } },
  );
});
afterEach(cleanup);

describe("Archivos tab", () => {
  it("asks to sign in without a session and loads nothing", async () => {
    state.signedIn = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
    expect(loaders.loadProyectoArchivos).not.toHaveBeenCalled();
  });

  it("prefetches the shell and the root once, seeding the Archivos count, with no client call", async () => {
    await renderPage();
    expect(loaders.loadProyectoShell).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoArchivos).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoArchivos).toHaveBeenCalledWith(expect.anything(), { id: ID, folderId: null });
    expect(screen.getByTestId("files").textContent).toBe("ok · retry sí");
    expect(tabsSeen.at(-1)).toMatchObject({ active: "archivos", counts: { archivos: 3 } });
    expect(pageData.getProyectoShell).not.toHaveBeenCalled();
    expect(pageData.getProyectoArchivosData).not.toHaveBeenCalled();
  });

  it("with ?folder= lists only that folder (no second root listing for the count)", async () => {
    await renderPage({ folder: "cli" });
    expect(loaders.loadProyectoArchivos).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoArchivos).toHaveBeenCalledWith(expect.anything(), { id: ID, folderId: "cli" });
    // The shell keeps its Drive-free count until the root is cached.
    expect(tabsSeen.at(-1)).toMatchObject({ counts: { archivos: 0 } });
    expect(pageData.getProyectoArchivosData).not.toHaveBeenCalled();
  });

  it("shows not found for a project out of scope or a missing folder", async () => {
    state.shell = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Carpeta no encontrada" })).toBeTruthy();
    cleanup();

    state.shell = true;
    state.files = "not_found";
    await renderPage({ folder: "nope" });
    expect(screen.getByRole("heading", { name: "Carpeta no encontrada" })).toBeTruthy();
  });
});
