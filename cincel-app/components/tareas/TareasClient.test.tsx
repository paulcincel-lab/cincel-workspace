// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { ME, LUIS } = vi.hoisted(() => ({
  ME: "11111111-1111-4111-8111-111111111111",
  LUIS: "22222222-2222-4222-8222-222222222222",
}));

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push, refresh: navigation.refresh }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: ME, name: "Ana" }, access: "Colaborador" }),
}));

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));

vi.mock("@/lib/tramos/compat", () => ({
  tramoColorVar: (key: string) => `var(--tramo-${key})`,
}));

// The filters bar pattern: chips are links with `aria-pressed`, then the selects and the search box.
vi.mock("@/components/patterns/FiltersBar", () => ({
  FiltersBar: (props: {
    chips?: { key: string; label: string; count?: number; colorVar?: string; pressed: boolean; href: string }[];
    selects?: ReactNode[];
    search?: { value: string; placeholder: string; onChange(v: string): void };
  }) => (
    <div role="group" aria-label="Filtros">
      {props.chips?.map((c) => (
        <a key={c.key} href={c.href} aria-pressed={c.pressed} data-color={c.colorVar ?? ""}>
          <span>{c.label}</span> <span data-testid={`count-${c.key}`}>{c.count}</span>
        </a>
      ))}
      {props.selects}
      {props.search ? (
        <input
          aria-label={props.search.placeholder}
          value={props.search.value}
          onChange={(e) => props.search?.onChange(e.target.value)}
        />
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: (props: { title: string; action?: { label: string; href?: string } }) => (
    <div role="status">
      <p>{props.title}</p>
      {props.action?.href ? <a href={props.action.href}>{props.action.label}</a> : null}
    </div>
  ),
}));

// The views (R3-04 to R3-06) render the header, the filters and, with no tasks, the empty state.
function MockView(props: {
  name: string;
  header?: { title: string; description?: string; actions?: ReactNode };
  filters?: ReactNode;
  empty?: { title: string; action?: { label: string; href?: string } };
  count: number;
}) {
  return (
    <section data-testid={`view-${props.name}`}>
      {props.header ? (
        <header>
          <h1>{props.header.title}</h1>
          <p>{props.header.description}</p>
          {props.header.actions}
        </header>
      ) : null}
      {props.filters}
      <span data-testid="view-count">{props.count}</span>
      {props.count === 0 && props.empty ? (
        <div role="status">
          <p>{props.empty.title}</p>
          {props.empty.action?.href ? <a href={props.empty.action.href}>{props.empty.action.label}</a> : null}
        </div>
      ) : null}
    </section>
  );
}

vi.mock("./TareasTablero", () => ({
  TABLERO_DESCRIPTION: "Descripción tablero",
  TareasTablero: (p: { board: Record<string, unknown[]>; header: never; filters: ReactNode; empty: never }) => (
    <MockView name="tablero" {...p} count={Object.values(p.board).reduce((n, c) => n + c.length, 0)} />
  ),
}));
vi.mock("./TareasLista", () => ({
  TareasLista: (p: { tasks: unknown[]; header: never; filters: ReactNode; empty: never }) => (
    <MockView name="lista" {...p} count={p.tasks.length} />
  ),
}));
vi.mock("./TareasCalendario", () => ({
  CALENDARIO_DESCRIPTION: "Descripción calendario",
  TareasCalendario: (p: { tasks: unknown[]; filters: Record<string, unknown> }) => (
    <section data-testid="view-calendario" data-filters={JSON.stringify(p.filters)}>
      {p.tasks.length}
    </section>
  ),
}));
// The task sheet (R3-08) opens from `?tarea=`; none here.
vi.mock("./TaskSheet", () => ({ TaskSheetRoute: () => null }));
vi.mock("./NewTaskDialog", () => ({
  NewTaskDialog: (p: { open: boolean; defaults?: { projectId?: string; tramoKey?: string } }) =>
    p.open ? <div role="dialog" aria-label="Nueva tarea" data-defaults={JSON.stringify(p.defaults ?? {})} /> : null,
}));

import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { StaffOption } from "@/lib/types/redesign";

import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { TAREAS_SEARCH_DEBOUNCE_MS, TareasClient, calendarTaskFilters } from "./TareasClient";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const TRAMOS: WorkflowRef[] = [
  { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w-construccion", key: "construccion", name: "Construcción", sortOrder: 3 },
];

function task(id: string, tramo: WorkflowRef | null, projectId: string, projectName: string): TaskListItem {
  return {
    id,
    title: `Tarea ${id}`,
    status: "pendiente",
    workflow: tramo,
    project: { id: projectId, name: projectName, clientName: null },
  } as unknown as TaskListItem;
}

const TASKS: TaskListItem[] = [
  task("t1", TRAMOS[0], P1, "Guadalajara 83"),
  task("t2", TRAMOS[1], P1, "Guadalajara 83"),
  task("t3", TRAMOS[1], P2, "Local Espinopapa"),
  task("t4", TRAMOS[2], P2, "Local Espinopapa"),
];

const STAFF: StaffOption[] = [
  { id: ME, name: "Ana", lastName: "Ruiz", suggested: false },
  { id: LUIS, name: "Luis", lastName: "Paz", suggested: false },
] as unknown as StaffOption[];

function renderClient(patch: Partial<TareasQuery> = {}, tasks: TaskListItem[] = TASKS) {
  const query: TareasQuery = { ...DEFAULT_TAREAS_QUERY, ...patch };
  return render(<TareasClient query={query} initial={{ tasks }} staff={STAFF} tramos={TRAMOS} />);
}

function chip(name: string): HTMLAnchorElement {
  const el = screen.getByText(name).closest("a");
  if (!el) throw new Error(`no chip ${name}`);
  return el;
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  navigation.search = "";
  caps.canCreateActivity = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("TareasClient filters", () => {
  it("shows the tramo chips with counts and aria-pressed", () => {
    renderClient();
    expect(chip("Todas").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("count-todas").textContent).toBe("4");
    expect(screen.getByTestId("count-presale").textContent).toBe("1");
    expect(screen.getByTestId("count-diseno").textContent).toBe("2");
    expect(screen.getByTestId("count-construccion").textContent).toBe("1");
    expect(chip("Diseño").getAttribute("aria-pressed")).toBe("false");
    expect(chip("Diseño").getAttribute("data-color")).toBe("var(--tramo-diseno)");
  });

  it("presses the selected tramo, keeps the other filters in the chip links and narrows the view", () => {
    renderClient({ vista: "lista", tramo: "diseno", responsable: "yo", q: "plano" });
    expect(chip("Diseño").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Todas").getAttribute("aria-pressed")).toBe("false");
    expect(chip("Presale").getAttribute("href")).toBe("/tareas?vista=lista&tramo=presale&responsable=yo&q=plano");
    expect(chip("Todas").getAttribute("href")).toBe("/tareas?vista=lista&responsable=yo&q=plano");
    expect(screen.getByTestId("view-count").textContent).toBe("2");
  });

  it("counts the tramo chips within the selected project", () => {
    renderClient({ proyecto: P2 });
    expect(screen.getByTestId("count-todas").textContent).toBe("2");
    expect(screen.getByTestId("count-presale").textContent).toBe("0");
    expect(screen.getByTestId("count-diseno").textContent).toBe("1");
  });

  it("labels the responsable combobox and writes the choice with router.replace (no scroll)", async () => {
    renderClient({ responsable: "yo" });
    const trigger = screen.getByRole("button", { name: "Responsable: Yo" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("Luis Paz"));
    expect(navigation.replace).toHaveBeenCalledWith(`/tareas?responsable=${LUIS}`, { scroll: false });
  });

  it("offers Yo and Todos before the people, without the viewer twice", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Responsable: Todos" }));
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Yo", "Todos", "Luis Paz"]);
    fireEvent.click(within(list).getByText("Yo"));
    expect(navigation.replace).toHaveBeenCalledWith("/tareas?responsable=yo", { scroll: false });
  });

  it("filters by project and clears it with Todos los proyectos", async () => {
    renderClient({ proyecto: P1 });
    fireEvent.click(screen.getByRole("button", { name: "Proyecto: Guadalajara 83" }));
    fireEvent.click(await screen.findByText("Todos los proyectos"));
    expect(navigation.replace).toHaveBeenCalledWith("/tareas", { scroll: false });

    cleanup();
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Proyecto" }));
    fireEvent.click(await screen.findByText("Local Espinopapa"));
    expect(navigation.replace).toHaveBeenCalledWith(`/tareas?proyecto=${P2}`, { scroll: false });
  });

  it("lists only the projects of the selected tramo", async () => {
    renderClient({ tramo: "presale" });
    fireEvent.click(screen.getByRole("button", { name: "Proyecto" }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todos los proyectos",
      "Guadalajara 83",
    ]);
  });

  it("writes the search to the URL after a pause, with router.replace and no scroll", () => {
    vi.useFakeTimers();
    renderClient({ tramo: "diseno" });
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar tareas" }), { target: { value: " renders " } });
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TAREAS_SEARCH_DEBOUNCE_MS);
    });
    expect(navigation.replace).toHaveBeenCalledWith("/tareas?tramo=diseno&q=renders", { scroll: false });
  });

  it("restores the search box when the URL changes (back / forward)", () => {
    const query: TareasQuery = { ...DEFAULT_TAREAS_QUERY, q: "renders" };
    const { rerender } = render(<TareasClient query={query} initial={{ tasks: TASKS }} staff={STAFF} tramos={TRAMOS} />);
    const box = screen.getByRole("textbox", { name: "Buscar tareas" }) as HTMLInputElement;
    expect(box.value).toBe("renders");
    rerender(<TareasClient query={{ ...query, q: null }} initial={{ tasks: TASKS }} staff={STAFF} tramos={TRAMOS} />);
    expect(box.value).toBe("");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("TareasClient view switch", () => {
  it("links the three views, keeps the filters and marks the active one with aria-current", () => {
    renderClient({ vista: "lista", tramo: "presale", responsable: "yo", cal: "semana" });
    const nav = screen.getByRole("navigation", { name: "Vista" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Tablero", "Lista", "Calendario"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/tareas?cal=semana&tramo=presale&responsable=yo",
      "/tareas?vista=lista&cal=semana&tramo=presale&responsable=yo",
      "/tareas?vista=calendario&cal=semana&tramo=presale&responsable=yo",
    ]);
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[0].hasAttribute("aria-current")).toBe(false);
    expect(links[2].hasAttribute("aria-current")).toBe(false);
  });

  it("renders the selected view with its description", () => {
    renderClient({ vista: "tablero" });
    expect(screen.getByTestId("view-tablero")).toBeTruthy();
    expect(screen.getByText("Descripción tablero")).toBeTruthy();
    cleanup();
    renderClient({ vista: "lista" });
    expect(screen.getByTestId("view-lista")).toBeTruthy();
    cleanup();
    renderClient({ vista: "calendario" });
    expect(screen.getByTestId("view-calendario")).toBeTruthy();
    expect(screen.getByText("Descripción calendario")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tareas" })).toBeTruthy();
  });

  it("passes the calendar the same filters the page loaded it with", () => {
    renderClient({ vista: "calendario", tramo: "diseno", responsable: "yo", proyecto: P1, q: "x", estado: "pendiente" });
    const filters = JSON.parse(screen.getByTestId("view-calendario").getAttribute("data-filters") ?? "{}");
    expect(filters).toEqual({
      search: "x",
      status: "pendiente",
      involvesStaffId: ME,
      workflowId: "w-diseno",
      projectId: P1,
    });
  });

  it("calendarTaskFilters maps a person and ignores an unknown tramo", () => {
    const q: TareasQuery = { ...DEFAULT_TAREAS_QUERY, responsable: LUIS, tramo: "otro" };
    expect(calendarTaskFilters(q, TRAMOS, ME)).toEqual({ involvesStaffId: LUIS });
  });
});

describe("TareasClient Nueva tarea", () => {
  it("opens the shell's NewTaskDialogHost with the tramo and project as defaults, without a navigation", () => {
    navigation.search = `tramo=presale&proyecto=${P1}`;
    renderClient({ tramo: "presale", proyecto: P1 });
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarea" }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      defaults: { projectId: P1, tramoKey: "presale" },
      source: "tareas",
    });
    // The host renders the dialog; this screen's own mount stays closed until 4a removes it.
    expect(screen.queryByRole("dialog", { name: "Nueva tarea" })).toBeNull();
  });

  it("hides the button without the create capability", () => {
    caps.canCreateActivity = false;
    renderClient();
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).toBeNull();
  });
});

describe("TareasClient empty state", () => {
  it("shows No hay tareas con estos filtros and Quitar filtros clears the URL filters", () => {
    renderClient({ vista: "lista", tramo: "presale", proyecto: P2, q: "nada" });
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" }).getAttribute("href")).toBe("/tareas?vista=lista");
  });

  it("keeps the calendar mode when clearing the filters in Calendario", () => {
    renderClient({ vista: "calendario", cal: "dia", responsable: LUIS }, []);
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" }).getAttribute("href")).toBe(
      "/tareas?vista=calendario&cal=dia",
    );
    expect(screen.queryByTestId("view-calendario")).toBeNull();
  });

  it("offers no Quitar filtros without filters", () => {
    renderClient({ vista: "lista" }, []);
    expect(screen.queryByRole("link", { name: "Quitar filtros" })).toBeNull();
  });
});
