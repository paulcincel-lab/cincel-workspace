// @vitest-environment happy-dom
/**
 * `<NewTaskDialogHost/>` (zustand.md §2.3): renders the one `NewTaskDialog`
 * from `useNewTaskUi`, gated by `canCreateActivity`; `?nueva=1` opens it with
 * the URL's `proyecto`/`tramo` defaults and strips the param with
 * `history.replaceState` (no `router.replace`, so no server re-render).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { seedSessionUser } from "@/tests/helpers/session-user";

const nav = vi.hoisted(() => ({
  pathname: "/tareas",
  search: "",
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canCreateActivity: caps.canCreateActivity }),
}));

vi.mock("./NewTaskDialog", () => ({
  NewTaskDialog: (p: { open: boolean; onOpenChange(open: boolean): void; defaults?: object }) =>
    p.open ? (
      <div role="dialog" aria-label="Nueva tarea" data-defaults={JSON.stringify(p.defaults ?? {})}>
        <button type="button" onClick={() => p.onOpenChange(false)}>
          Cancelar
        </button>
      </div>
    ) : null,
}));

import { NewTaskDialogHost } from "./NewTaskDialogHost";
import { useNewTaskParam } from "./use-new-task-param";

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  nav.pathname = "/tareas";
  nav.search = "";
  caps.canCreateActivity = true;
  seedSessionUser({ member: { id: "s-1", name: "Ana" }, access: "Colaborador" });
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  replaceState.mockRestore();
  vi.clearAllMocks();
  seedSessionUser(null);
});

function dialogDefaults() {
  return JSON.parse(screen.getByRole("dialog", { name: "Nueva tarea" }).getAttribute("data-defaults") ?? "{}");
}

describe("NewTaskDialogHost", () => {
  it("renders nothing until the store opens it", () => {
    render(<NewTaskDialogHost />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => useNewTaskUi.getState().openNewTask({ projectId: "p-1", status: "en_proceso" }, "tablero-quick-add"));
    expect(dialogDefaults()).toEqual({ projectId: "p-1", status: "en_proceso" });
  });

  it("closing the dialog closes the store", () => {
    render(<NewTaskDialogHost />);
    act(() => useNewTaskUi.getState().openNewTask(undefined, "tareas"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(useNewTaskUi.getState().open).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("?nueva=1 opens it with the URL defaults and strips the param through history.replaceState", () => {
    nav.search = "vista=lista&proyecto=p-roble&tramo=diseno&nueva=1";
    render(<NewTaskDialogHost />);

    expect(dialogDefaults()).toEqual({ projectId: "p-roble", tramoKey: "diseno" });
    expect(useNewTaskUi.getState().source).toBe("url");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/tareas?vista=lista&proyecto=p-roble&tramo=diseno");
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it("strips a lone ?nueva=1 down to the bare path", () => {
    nav.pathname = "/inicio";
    nav.search = "nueva=1";
    render(<NewTaskDialogHost />);
    expect(dialogDefaults()).toEqual({});
    expect(replaceState).toHaveBeenCalledWith(null, "", "/inicio");
  });

  it("leaves the URL alone without ?nueva=1", () => {
    nav.search = "vista=lista";
    render(<NewTaskDialogHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("renders nothing and keeps ?nueva=1 without canCreateActivity", () => {
    caps.canCreateActivity = false;
    nav.search = "nueva=1";
    render(<NewTaskDialogHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useNewTaskUi.getState().open).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("renders nothing for a guest", () => {
    seedSessionUser(null);
    nav.search = "nueva=1";
    render(<NewTaskDialogHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("useNewTaskParam (transitional, until 4a)", () => {
  function Opener() {
    const { open, setOpen } = useNewTaskParam();
    return (
      <button type="button" data-open={String(open)} onClick={() => setOpen(true)}>
        Nueva tarea
      </button>
    );
  }

  it("opens the host with the view's filters instead of writing ?nueva=1", () => {
    nav.search = "vista=tablero&proyecto=p-norte&tramo=presale";
    render(
      <>
        <Opener />
        <NewTaskDialogHost />
      </>,
    );
    const button = screen.getByRole("button", { name: "Nueva tarea" });
    expect(button.getAttribute("data-open")).toBe("false");
    fireEvent.click(button);

    expect(dialogDefaults()).toEqual({ projectId: "p-norte", tramoKey: "presale" });
    expect(useNewTaskUi.getState().source).toBe("tareas");
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
