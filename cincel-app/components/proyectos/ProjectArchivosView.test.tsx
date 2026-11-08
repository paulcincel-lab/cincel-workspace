// @vitest-environment happy-dom
/**
 * Archivos client view (Query Migration 5d, #962): opening a folder changes
 * `?folder=` with `history.pushState` (no `router.push`, no server render)
 * and so the key `proyectos.archivos(id, folder)`; one action call per
 * uncached folder, none for a cached one (the root, within its stale time).
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import type { ProyectoArchivosData } from "@/lib/loaders/proyectos";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

const nav = vi.hoisted(() => ({ listeners: new Set<() => void>(), push: vi.fn(), refresh: vi.fn() }));
// `useSearchParams` follows `window.location`, as Next's patched `pushState` makes it do.
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: vi.fn() }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (listener: () => void) => {
          nav.listeners.add(listener);
          return () => nav.listeners.delete(listener);
        },
        () => window.location.search,
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const pageData = vi.hoisted(() => ({ getProyectoArchivosData: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);
const shellAction = vi.hoisted(() => ({ getProyectoShell: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-shell-actions", () => shellAction);
vi.mock("@/lib/actions/projects-actions", () => ({ retryProjectFolderAction: vi.fn() }));

const tabsSeen = vi.hoisted(() => [] as ProjectTabsProps[]);
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: ProjectTabsProps) => {
    tabsSeen.push(props);
    return <nav aria-label="Secciones del proyecto">{`archivos ${props.counts.archivos}`}</nav>;
  },
}));
// The widgets render the folder cards as real links, like `EntityCardGrid`.
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: (props: ListPageProps) => (
    <div>
      {props.filters as ReactNode}
      {props.spec.kind === "cards"
        ? props.spec.items.map((item) =>
            item.href ? (
              <a key={item.id} href={item.href}>
                {item.title}
              </a>
            ) : (
              <span key={item.id}>{item.title}</span>
            ),
          )
        : null}
    </div>
  ),
}));
vi.mock("@/components/widgets/DistributionWidget", () => ({ DistributionWidget: () => null }));

import { ProjectArchivosView } from "./ProjectArchivosView";

const ID = "22222222-2222-4222-8222-222222222222";
const BASE = `/proyectos/${ID}/archivos`;
const FOLDER = "application/vnd.google-apps.folder";

const root: StaffFilesResult = {
  status: "ok",
  folderId: "root",
  breadcrumbs: [{ id: "root", name: "Casa Lomas" }],
  items: [
    { id: "cli", name: "02 Cliente", mimeType: FOLDER, sizeBytes: null, modifiedAt: "", iconLink: null, webViewLink: null, kind: "folder" },
    { id: "f", name: "Planta.pdf", mimeType: "application/pdf", sizeBytes: 10, modifiedAt: "", iconLink: null, webViewLink: "https://drive.example/f", kind: "file" },
  ],
};
const sub: StaffFilesResult = {
  status: "ok",
  folderId: "cli",
  breadcrumbs: [
    { id: "root", name: "Casa Lomas" },
    { id: "cli", name: "02 Cliente" },
  ],
  items: [
    { id: "r", name: "Render.png", mimeType: "image/png", sizeBytes: 5, modifiedAt: "", iconLink: null, webViewLink: "https://drive.example/r", kind: "file" },
  ],
};

const shell = {
  detail: { id: ID },
  project: { id: ID, name: "Casa Lomas", tramo: null },
  counts: { tareas: 1, archivos: 2, clientes: 0 },
  canManagePortal: false,
} as unknown as ProjectTabShell;

const ok = (result: StaffFilesResult): ProyectoArchivosData => ({ kind: "ok", result, canRetry: false });

let pushState: History["pushState"];

beforeEach(() => {
  vi.clearAllMocks();
  tabsSeen.length = 0;
  window.history.replaceState(null, "", BASE);
  pushState = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    pushState(data, unused, url);
    nav.listeners.forEach((listener) => listener());
  });
  pageData.getProyectoArchivosData.mockImplementation(async ({ folderId }: { folderId: string | null }) =>
    ok(folderId === "cli" ? sub : root),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function hydratedClient() {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.shell(ID), shell);
  client.setQueryData(qk.proyectos.archivos(ID, null), ok(root));
  return client;
}

describe("ProjectArchivosView", () => {
  it("renders the hydrated root with no action call", () => {
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client: hydratedClient() });
    expect(screen.getByRole("link", { name: "02 Cliente" })).toBeTruthy();
    expect(screen.getByText("archivos 2")).toBeTruthy();
    expect(pageData.getProyectoArchivosData).not.toHaveBeenCalled();
    expect(shellAction.getProyectoShell).not.toHaveBeenCalled();
  });

  it("opens a sub-folder with one archivos call and no router.push, then returns to the cached root with none", async () => {
    const client = hydratedClient();
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client });

    fireEvent.click(screen.getByRole("link", { name: "02 Cliente" }));
    expect(window.location.search).toBe("?folder=cli");
    expect(await screen.findByText("Render.png")).toBeTruthy();
    expect(pageData.getProyectoArchivosData).toHaveBeenCalledTimes(1);
    expect(pageData.getProyectoArchivosData).toHaveBeenCalledWith({ id: ID, folderId: "cli" });
    expect(client.getQueryData(qk.proyectos.archivos(ID, "cli"))).toEqual(ok(sub));
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();

    // Back to the root through the breadcrumb: the root is cached, so no call.
    fireEvent.click(screen.getByRole("link", { name: "Casa Lomas" }));
    expect(window.location.search).toBe("");
    expect(await screen.findByText("Planta.pdf")).toBeTruthy();
    expect(pageData.getProyectoArchivosData).toHaveBeenCalledTimes(1);
  });

  it("restores the folder when the URL changes back (history)", async () => {
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client: hydratedClient() });
    fireEvent.click(screen.getByRole("link", { name: "02 Cliente" }));
    expect(await screen.findByText("Render.png")).toBeTruthy();

    act(() => {
      window.history.replaceState(null, "", BASE);
      nav.listeners.forEach((listener) => listener());
    });
    await waitFor(() => expect(screen.getByText("Planta.pdf")).toBeTruthy());
    expect(pageData.getProyectoArchivosData).toHaveBeenCalledTimes(1);
  });

  it("seeds the shell's Archivos count from a fetched root listing", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.shell(ID), { ...shell, counts: { ...shell.counts, archivos: 0 } });
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client });

    expect(await screen.findByText("archivos 2")).toBeTruthy();
    expect(pageData.getProyectoArchivosData).toHaveBeenCalledWith({ id: ID, folderId: null });
    expect(shellAction.getProyectoShell).not.toHaveBeenCalled();
  });

  it("shows the Drive error and the not-found states", async () => {
    pageData.getProyectoArchivosData.mockResolvedValueOnce({ kind: "drive_error" });
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.shell(ID), shell);
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client });
    expect(await screen.findByText("No se pudo leer la carpeta en Drive.")).toBeTruthy();
    cleanup();

    const missing = createTestQueryClient();
    missing.setQueryData(qk.proyectos.shell(ID), shell);
    missing.setQueryData(qk.proyectos.archivos(ID, null), { kind: "not_found" });
    renderWithQueryClient(<ProjectArchivosView projectId={ID} />, { client: missing });
    expect(screen.getByText("El proyecto o la carpeta no existen.")).toBeTruthy();
  });
});
