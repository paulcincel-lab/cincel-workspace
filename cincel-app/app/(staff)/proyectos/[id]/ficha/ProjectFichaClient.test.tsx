import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

import type { ProjectDetail, ProjectSpace, TaskListRow } from "@/lib/types/core";

/** Every server action the ficha could call; none of them may run on mount. */
const actions = vi.hoisted(() => ({
  updateProjectAction: vi.fn(),
  setProjectMembersAction: vi.fn(),
  setProjectContactsAction: vi.fn(),
  addProjectLinkAction: vi.fn(),
  removeProjectLinkAction: vi.fn(),
  setProjectCurrentEtapaAction: vi.fn(),
  addProjectCommentAction: vi.fn(),
  createProjectSpaceAction: vi.fn(),
  renameProjectSpaceAction: vi.fn(),
  reorderProjectSpacesAction: vi.fn(),
  deleteProjectSpaceAction: vi.fn(),
}));
const pageData = vi.hoisted(() => ({ getProyectoFichaData: vi.fn(), getProyectoHistoryPage: vi.fn() }));
const catalog = vi.hoisted(() => ({
  fetchCatalogStaff: vi.fn(),
  fetchCatalogContacts: vi.fn(),
  fetchCatalogWorkflows: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
}));
const importActions = vi.hoisted(() => ({ getImportDataAction: vi.fn() }));
const remapActions = vi.hoisted(() => ({
  getMondayRemapAction: vi.fn(),
  previewMondayRemapAction: vi.fn(),
  applyMondayRemapAction: vi.fn(),
}));

vi.mock("@/lib/actions/projects-actions", () => actions);
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);
vi.mock("@/lib/actions/page-data/catalog-actions", () => catalog);
vi.mock("@/lib/actions/import-actions", () => importActions);
vi.mock("@/lib/actions/monday-import-actions", () => remapActions);
vi.mock("@/components/ui/DriveLinksEditor", () => ({ DriveLinksEditor: () => null }));
vi.mock("@/lib/google/use-google-connect-result", () => ({ useGoogleConnectResult: () => null }));
// Stands in for the Select-based fields so the test can pick a client directly.
vi.mock("@/components/proyectos/ProjectAdminFields", () => ({
  ProjectAdminFields: ({ onChange, value }: { onChange: (v: unknown) => void; value: Record<string, unknown> }) => (
    <button type="button" onClick={() => onChange({ ...value, clientId: "c2" })}>
      Elegir Grupo Norte
    </button>
  ),
  projectAdminPatch: (v: unknown) => v,
}));

import { qk } from "@/lib/query/keys";
import { hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import { seedSessionUser } from "@/tests/helpers/session-user";

import { ProjectFichaClient } from "./ProjectFichaClient";

const P = "p1";

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: P,
    code: null,
    name: "Casa Lomas",
    clientId: null,
    origin: null,
    originStaffId: null,
    status: "activo",
    currentWorkflowId: null,
    projectType: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    managerId: null,
    coordinatorId: null,
    progress: 0,
    startDate: null,
    endDate: null,
    contractAmountMxn: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    client: null,
    currentWorkflow: null,
    etapas: [],
    needsEtapa: true,
    stages: [],
    manager: null,
    coordinator: null,
    originStaff: null,
    mondayImport: null,
    members: [{ id: "s1", name: "Ana López", role: null, active: true }],
    contacts: [],
    links: [],
    ...overrides,
  };
}

function adminTask(): TaskListRow {
  return {
    id: "t-admin",
    projectId: P,
    kind: "admin",
    templateId: null,
    workflowId: null,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Asignar cliente y origen",
    createdById: "s1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: P, name: "Casa Lomas", clientName: null },
    workflow: null,
    phase: null,
    space: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    subtaskDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
  } as TaskListRow;
}

const SPACES: ProjectSpace[] = [{ id: "e1", name: "Depto 201", projectId: P, sortOrder: 0, taskCount: 0 }];
const STAFF = [
  { id: "s1", name: "Ana López" },
  { id: "s2", name: "Beto Ruiz" },
];
const CONTACTS = [
  { id: "c1", name: "Familia Ruiz", type: "cliente" as const },
  { id: "c2", name: "Grupo Norte", type: "cliente" as const },
  { id: "c3", name: "Herrería Sol", type: "proveedor" as const },
];

const TABS = <nav aria-label="Secciones del proyecto" data-testid="project-tabs" />;

/**
 * What the page prefetches, through a real dehydrate/hydrate round trip:
 * the ficha (seeding espacios and import data), the first Bitácora page and,
 * for editors, the catalogs.
 */
async function renderFicha(opts: { admin?: boolean; editor?: boolean; tasks?: TaskListRow[] } = {}) {
  const editor = opts.editor ?? true;
  seedSessionUser({
    member: { id: "s1", name: "Ana López" },
    access: opts.admin ? "Administrador" : editor ? "Dirección" : "Colaborador",
  });
  const { client, state } = await hydrationRoundtrip(async (server: QueryClient) => {
    server.setQueryData(qk.proyectos.tab(P, "ficha"), {
      project: project(),
      tasks: opts.tasks ?? (opts.admin ? [adminTask()] : []),
      spaces: SPACES,
      importData: null,
    });
    server.setQueryData(qk.catalog.projectSpaces(P), SPACES);
    server.setQueryData(qk.importData("project", P), null);
    server.setQueryData(qk.proyectos.history(P), { pages: [{ events: [], nextCursor: null }], pageParams: [null] });
    if (editor || opts.admin) {
      server.setQueryData(qk.catalog.staff(), STAFF);
      server.setQueryData(qk.catalog.contacts(), CONTACTS);
      server.setQueryData(qk.catalog.etapas(), []);
    }
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const result = renderWithQueryClient(<ProjectFichaClient projectId={P} tabs={TABS} />, { client, hydrate: state });
  const invalidated = () => invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
  return { ...result, client, invalidated };
}

/** Every action double that was called. */
function calledActions(): string[] {
  return Object.entries({ ...actions, ...pageData, ...catalog, ...importActions, ...remapActions })
    .filter(([, fn]) => fn.mock.calls.length > 0)
    .map(([name]) => name);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.updateProjectAction.mockResolvedValue({ ok: true, data: project({ projectType: "Residencial" }) });
  actions.setProjectMembersAction.mockResolvedValue({ ok: true, data: undefined });
  actions.setProjectContactsAction.mockResolvedValue({ ok: true, data: undefined });
  pageData.getProyectoFichaData.mockResolvedValue({ project: project(), tasks: [], spaces: SPACES, importData: null });
  pageData.getProyectoHistoryPage.mockResolvedValue({ events: [], nextCursor: null });
});

afterEach(cleanup);

describe("ficha from the hydrated cache", () => {
  it("renders at once with 0 action calls on mount and no loading copy", async () => {
    await renderFicha();
    expect(screen.getByRole("heading", { name: "Ficha" })).toBeTruthy();
    expect(screen.getByTestId("project-tabs")).toBeTruthy();
    expect(screen.queryByText("Cargando proyecto…")).toBeNull();
    expect(screen.getByText("Depto 201")).toBeTruthy();
    // Let any effect or query run before counting.
    await new Promise((r) => setTimeout(r, 20));
    expect(calledActions()).toEqual([]);
  });

  it("a viewer who can't edit fetches no catalog and sees the members from the project", async () => {
    await renderFicha({ editor: false });
    expect(screen.getByText("En equipo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(calledActions()).toEqual([]);
  });

  it("splits catalog.contacts() into clients (admin field) and socios/proveedores", async () => {
    await renderFicha();
    expect(screen.getByText("Herrería Sol")).toBeTruthy();
    expect(screen.queryByText("Familia Ruiz")).toBeNull();
  });
});

describe("ficha admin data", () => {
  it("shows no client line, admin fields or Administración group to non-admins", async () => {
    await renderFicha();
    expect(screen.queryByText("Cliente:")).toBeNull();
    expect(screen.queryByText("Por asignar")).toBeNull();
    expect(screen.queryByText("Administración")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("button", { name: "Elegir Grupo Norte" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(actions.updateProjectAction).toHaveBeenCalled());
    const patch = actions.updateProjectAction.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("clientId");
    expect(patch).not.toHaveProperty("origin");
    expect(patch).not.toHaveProperty("originStaffId");
  });

  it("shows admins the Por asignar client line and the Administración group", async () => {
    await renderFicha({ admin: true });
    expect(screen.getByText("Cliente:")).toBeTruthy();
    expect(screen.getByText("Por asignar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Asignar" })).toBeTruthy();
    expect(screen.getByText("Administración")).toBeTruthy();
  });

  it("confirms a client change with an AlertDialog, saves and invalidates the Clientes tab too", async () => {
    const { invalidated } = await renderFicha({ admin: true });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir Grupo Norte" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("¿Cambiar el cliente del proyecto?");
    expect(actions.updateProjectAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar cliente" }));
    await waitFor(() =>
      expect(actions.updateProjectAction).toHaveBeenCalledWith(
        P,
        expect.objectContaining({ clientId: "c2", origin: null, originStaffId: null }),
      ),
    );
    await waitFor(() => expect(invalidated()).toContainEqual(qk.proyectos.tab(P, "clientes")));
  });

  it("no longer uses window.confirm or the per-render session getter", () => {
    const source = readFileSync(resolve(__dirname, "ProjectFichaClient.tsx"), "utf8");
    expect(source).not.toContain("window.confirm");
    expect(source).not.toContain("getCurrentAuthenticatedUser");
    expect(source).not.toMatch(/\breload\(/);
    expect(source).not.toContain("router.refresh");
  });
});

describe("ficha saves", () => {
  it("writes the saved project into the ficha key and invalidates only the project's keys", async () => {
    // The refetch the invalidation starts stays pending, so the cache shows what the save wrote.
    pageData.getProyectoFichaData.mockReturnValue(new Promise(() => {}));
    const { client, invalidated } = await renderFicha();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(invalidated()).toEqual([
        qk.proyectos.detail(P),
        qk.proyectos.list(),
        qk.catalog.projectOptions(),
        qk.inicio(),
      ]),
    );
    expect(actions.updateProjectAction).toHaveBeenCalledWith(P, expect.any(Object));
    expect(
      (client.getQueryData(qk.proyectos.tab(P, "ficha")) as { project: ProjectDetail }).project.projectType,
    ).toBe("Residencial");
    // Edit mode closed after the save.
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy());
  });

  it("shows a failed save's specific copy and keeps the form open", async () => {
    actions.updateProjectAction.mockResolvedValue({ ok: false, error: "NAME_TAKEN" });
    await renderFicha();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Ya existe un proyecto con ese nombre.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("toggles a member and invalidates the ficha, Resumen and the list", async () => {
    const { invalidated } = await renderFicha();
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);

    await waitFor(() =>
      expect(actions.setProjectMembersAction).toHaveBeenCalledWith(P, [
        { staffId: "s1", role: null },
        { staffId: "s2", role: null },
      ]),
    );
    await waitFor(() =>
      expect(invalidated()).toEqual([qk.proyectos.tab(P, "ficha"), qk.proyectos.resumen(P), qk.proyectos.list()]),
    );
  });

  it("links a contact and also invalidates the Clientes tab", async () => {
    const { invalidated } = await renderFicha();
    // Equipo first (Beto Ruiz), then Socios y proveedores (Herrería Sol).
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[1]);
    await waitFor(() => expect(actions.setProjectContactsAction).toHaveBeenCalledWith(P, [{ contactId: "c3", role: null }]));
    await waitFor(() => expect(invalidated()).toContainEqual(qk.proyectos.tab(P, "clientes")));
  });
});
