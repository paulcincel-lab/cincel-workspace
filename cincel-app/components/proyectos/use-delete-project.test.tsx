// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> };
  fn.error = vi.fn();
  fn.dismiss = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/actions/projects-actions", () => ({
  deleteProjectAction: vi.fn(),
  restoreProjectAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProjectDeletePreview: vi.fn(async (id: string) => ({ id, name: "Casa Roble", taskCount: 1, openTaskCount: 0 })),
  getDeletedProjects: vi.fn(async () => []),
}));

import type { SessionAccess } from "@/lib/auth/session";
import { deleteProjectAction, restoreProjectAction } from "@/lib/actions/projects-actions";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { useSessionStore } from "@/lib/stores/session-store";

import {
  PROJECT_DELETED_TOAST,
  PROJECT_RESTORE_EXPIRED,
  PROJECT_RESTORED_TOAST,
  projectDeleteDescription,
  typedNameMatches,
} from "./project-delete-copy";
import { restoreErrorText, useDeleteProject } from "./use-delete-project";

function signIn(access: string) {
  useSessionStore.setState({
    access: {
      status: "active",
      user: { id: "s1", name: "Ana", email: "ana@example.test", role: access, area: null, active: true, access },
    } as unknown as SessionAccess,
  });
}

function Harness() {
  const del = useDeleteProject();
  return (
    <>
      <span data-testid="can">{String(del.canDelete)}</span>
      {del.rowActions({ id: "p1", name: "Casa Roble" }).map((a) => (
        <button key={a.id} type="button" onClick={a.onSelect}>
          {a.label}
        </button>
      ))}
      {del.dialog}
    </>
  );
}

function renderHarness(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const LIST = {
  projects: [{ id: "p1" }, { id: "p2" }],
  portfolio: [{ projectId: "p1" }, { projectId: "p2" }],
} as unknown as ProyectosPageData;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useSessionStore.setState({ access: { status: "guest", user: null } });
});

describe("project delete copy", () => {
  it("names the tasks that go with the project", () => {
    expect(projectDeleteDescription(12)).toBe(
      "Se eliminan también sus 12 tareas y se quita el acceso al portal de sus clientes.",
    );
    expect(projectDeleteDescription(1)).toBe("Se elimina también su tarea y se quita el acceso al portal de sus clientes.");
    expect(projectDeleteDescription(0)).toBe("Se quita el acceso al portal de sus clientes.");
  });

  it("matches the typed name ignoring case, accents and spaces around it", () => {
    expect(typedNameMatches("  casa  ", "Casa")).toBe(true);
    expect(typedNameMatches("Jardin", "Jardín")).toBe(true);
    expect(typedNameMatches("", "")).toBe(false);
    expect(typedNameMatches("Casa R", "Casa Roble")).toBe(false);
  });

  it("turns a passed restore window into its own copy", () => {
    expect(restoreErrorText("INVALID: restore window")).toBe(PROJECT_RESTORE_EXPIRED);
  });
});

describe("useDeleteProject", () => {
  it("offers nothing without canDeleteProject", () => {
    signIn("Colaborador");
    renderHarness(createTestQueryClient());
    expect(screen.getByTestId("can").textContent).toBe("false");
    expect(screen.queryByRole("button", { name: "Eliminar proyecto" })).toBeNull();
  });

  it("deletes without typing when nothing is open, drops the row at once and offers Deshacer", async () => {
    signIn("Dirección");
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.list(), LIST);
    vi.mocked(deleteProjectAction).mockResolvedValue({ ok: true, data: { id: "p1", deletedTaskCount: 1 } });
    vi.mocked(restoreProjectAction).mockResolvedValue({ ok: true, data: { id: "p1", restoredTaskCount: 1 } });
    renderHarness(client);

    act(() => screen.getByRole("button", { name: "Eliminar proyecto" }).click());
    const confirm = (await screen.findByRole("button", { name: "Eliminar" })) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => confirm.click());

    expect(client.getQueryData<ProyectosPageData>(qk.proyectos.list())!.projects.map((p) => p.id)).toEqual(["p2"]);
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(PROJECT_DELETED_TOAST, expect.anything()));
    const options = toastMock.mock.calls[0][1] as { duration: number; action: { onClick(): void } };
    expect(options.duration).toBe(5000);
    await act(async () => options.action.onClick());
    await waitFor(() => expect(restoreProjectAction).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(PROJECT_RESTORED_TOAST));
  });

  it("puts the row back with an error toast when the delete fails", async () => {
    signIn("Administrador");
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.list(), LIST);
    vi.mocked(deleteProjectAction).mockResolvedValue({ ok: false, error: "FORBIDDEN: project delete" });
    renderHarness(client);

    act(() => screen.getByRole("button", { name: "Eliminar proyecto" }).click());
    const confirm = (await screen.findByRole("button", { name: "Eliminar" })) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    act(() => confirm.click());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(client.getQueryData<ProyectosPageData>(qk.proyectos.list())!.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(toastMock).not.toHaveBeenCalledWith(PROJECT_DELETED_TOAST, expect.anything());
  });
});
