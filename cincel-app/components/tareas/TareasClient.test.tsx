// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
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

// Next's Link only calls `onNavigate` inside a router; the stand-in calls it on every click.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll,
    prefetch,
    onNavigate,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    scroll?: boolean;
    prefetch?: boolean | null;
    onNavigate?: (e: { preventDefault(): void }) => void;
  }) => {
    void scroll;
    void prefetch;
    return (
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          onNavigate?.({ preventDefault: () => e.preventDefault() });
        }}
      >
        {children}
      </a>
    );
  },
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

// Reads never reach the server here: the cache is seeded as `/tareas` hydrates it.
const pageData = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

// The filters bar pattern: chips are links with `aria-pressed` and a shallow
// `onSelect`, then the selects and the search box.
vi.mock("@/components/patterns/FiltersBar", () => ({
  FiltersBar: (props: {
    chips?: {
      key: string;
      label: string;
      count?: number;
      colorVar?: string;
      pressed: boolean;
      href: string;
      onSelect?(): void;
    }[];
    selects?: ReactNode[];
    search?: { value: string; placeholder: string; onChange(v: string): void };
  }) => (
    <div role="group" aria-label="Filtros">
      {props.chips?.map((c) => (
        <a
          key={c.key}
          href={c.href}
          aria-pressed={c.pressed}
          data-color={c.colorVar ?? ""}
          onClick={(e) => {
            if (!c.onSelect) return;
            e.preventDefault();
            c.onSelect();
          }}
        >
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

// The views read their own queries; here they show the props they get: no data, the query, the shell.
function MockView(props: {
  name: string;
  query: { vista: string };
  header?: { title: string; description?: string; actions?: ReactNode };
  filters?: ReactNode;
  empty?: { title: string; action?: { label: string; href?: string } };
}) {
  return (
    <section data-testid={`view-${props.name}`} data-props={Object.keys(props).filter((key) => key !== "name").sort().join(",")}>
      {props.header ? (
        <header>
          <h1>{props.header.title}</h1>
          <p>{props.header.description}</p>
          {props.header.actions}
        </header>
      ) : null}
      {props.filters}
      {props.empty ? (
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
  TareasTablero: (p: Omit<Parameters<typeof MockView>[0], "name">) => <MockView name="tablero" {...p} />,
}));
vi.mock("./TareasLista", () => ({
  TareasLista: (p: Omit<Parameters<typeof MockView>[0], "name">) => <MockView name="lista" {...p} />,
}));
vi.mock("./TareasCalendario", () => ({
  CALENDARIO_DESCRIPTION: "Descripción calendario",
  TareasCalendario: () => <section data-testid="view-calendario" />,
}));
// The task sheet (R3-08) opens from `?tarea=`; none here.
vi.mock("./TaskSheet", () => ({ TaskSheetRoute: () => null }));
// The per-style layouts read their own queries (their own tests); here they show the props they get.
vi.mock("./TareasVisual", () => ({
  TareasVisual: (p: { actions?: ReactNode } & Record<string, unknown>) => (
    <section data-testid="view-visual" data-props={Object.keys(p).sort().join(",")}>
      {p.actions}
    </section>
  ),
}));
vi.mock("./TareasEsencial", () => ({ TareasEsencial: () => <section data-testid="view-esencial" /> }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import type { PresentationStyle } from "@/lib/types/redesign";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TareasFacets, TareasPageData } from "@/lib/tareas/page-data";
import { parseTareasQuery, toTareasSearch, type TareasQuery } from "@/lib/tareas/query";
import type { WorkflowRef } from "@/lib/types/core";

import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { TAREAS_SEARCH_DEBOUNCE_MS, TareasClient } from "./TareasClient";
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

const STAFF = [
  { id: ME, name: "Ana Ruiz" },
  { id: LUIS, name: "Luis Paz" },
];

const FACETS: TareasFacets = {
  total: 4,
  byTramo: { presale: 1, diseno: 2, construccion: 1 },
  projects: [
    { id: P1, name: "Guadalajara 83", count: 2 },
    { id: P2, name: "Local Espinopapa", count: 2 },
  ],
};

/**
 * The style these tests render: Analítico still shows the selected `?vista=`
 * view with the shared filters bar; Visual and Esencial have layouts of their own.
 */
let style: PresentationStyle = "analitico";

/** The client under the test's style. */
function styled(node: ReactNode) {
  return (
    <StyleProvider style={style} scope="staff">
      {node}
    </StyleProvider>
  );
}

/** The query the URL holds and the cache `/tareas` hydrates for it: the bundle and the facets it seeded. */
function seed(client: QueryClient, query: TareasQuery, facets: TareasFacets) {
  const page: TareasPageData = { facets, tramos: TRAMOS, staff: STAFF };
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(query, style)), page);
  client.setQueryData(qk.tareas.facets(tareasListFiltersOf(query)), facets);
}

function renderClient(patch: Partial<TareasQuery> = {}, facets: TareasFacets = FACETS) {
  navigation.search = toTareasSearch(patch).replace(/^\?/, "");
  const client = createTestQueryClient();
  seed(client, parseTareasQuery(new URLSearchParams(navigation.search)), facets);
  return renderWithQueryClient(styled(<TareasClient />), { client });
}

function chip(name: string): HTMLAnchorElement {
  const el = screen.getByText(name).closest("a");
  if (!el) throw new Error(`no chip ${name}`);
  return el;
}

let replaceState: ReturnType<typeof vi.spyOn>;
let pushState: ReturnType<typeof vi.spyOn>;

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
  style = "analitico";
  caps.canCreateActivity = true;
  for (const fn of Object.values(pageData)) fn.mockReset();
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  replaceState.mockRestore();
  pushState.mockRestore();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** Every URL write goes through `history.replaceState`, never the router. */
function lastReplaced(): string | undefined {
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.refresh).not.toHaveBeenCalled();
  return replaceState.mock.calls.at(-1)?.[2] as string | undefined;
}

describe("TareasClient data", () => {
  it("passes the views no data props: the query and the shell only", () => {
    renderClient({ vista: "tablero" });
    expect(screen.getByTestId("view-tablero").getAttribute("data-props")).toBe("empty,filters,header,query");
    cleanup();
    renderClient({ vista: "lista" });
    expect(screen.getByTestId("view-lista").getAttribute("data-props")).toBe("empty,filters,header,query");
  });

  it("reads the hydrated bundle: no request on mount", () => {
    renderClient();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
    expect(pageData.getTareasFacets).not.toHaveBeenCalled();
  });

  it("a filter change is a new key: one bundle request, no facets request of its own", () => {
    const { rerender } = renderClient();
    pageData.getTareasPageData.mockReturnValue(new Promise(() => {}));
    navigation.search = "tramo=diseno";
    rerender(styled(<TareasClient />));
    expect(pageData.getTareasPageData).toHaveBeenCalledTimes(1);
    expect(pageData.getTareasPageData).toHaveBeenCalledWith(
      expect.objectContaining({ estilo: "analitico", tramo: "diseno", cal: "mes" }),
    );
    expect(pageData.getTareasFacets).not.toHaveBeenCalled();
    // The previous chips stay while the next bundle loads.
    expect(screen.getByTestId("count-todas").textContent).toBe("4");
  });
});

describe("TareasClient filters", () => {
  it("shows the tramo chips with the facet counts and aria-pressed", () => {
    renderClient();
    expect(chip("Todas").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("count-todas").textContent).toBe("4");
    expect(screen.getByTestId("count-presale").textContent).toBe("1");
    expect(screen.getByTestId("count-diseno").textContent).toBe("2");
    expect(screen.getByTestId("count-construccion").textContent).toBe("1");
    expect(chip("Diseño").getAttribute("aria-pressed")).toBe("false");
    expect(chip("Diseño").getAttribute("data-color")).toBe("var(--tramo-diseno)");
  });

  it("presses the selected tramo and keeps the other filters in the chip links", () => {
    renderClient({ vista: "lista", tramo: "diseno", responsable: "yo", q: "plano" });
    expect(chip("Diseño").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Todas").getAttribute("aria-pressed")).toBe("false");
    expect(chip("Presale").getAttribute("href")).toBe("/tareas?vista=lista&tramo=presale&responsable=yo&q=plano");
    expect(chip("Todas").getAttribute("href")).toBe("/tareas?vista=lista&responsable=yo&q=plano");
  });

  it("picks a chip with history.replaceState, never the router", () => {
    renderClient({ vista: "lista" });
    fireEvent.click(chip("Diseño"));
    expect(lastReplaced()).toBe("/tareas?vista=lista&tramo=diseno");
  });

  it("counts a tramo with no facet entry as 0", () => {
    renderClient({ proyecto: P2 }, { total: 2, byTramo: { diseno: 1, construccion: 1 }, projects: FACETS.projects });
    expect(screen.getByTestId("count-todas").textContent).toBe("2");
    expect(screen.getByTestId("count-presale").textContent).toBe("0");
    expect(screen.getByTestId("count-diseno").textContent).toBe("1");
  });

  it("labels the responsable combobox and writes the choice with history.replaceState", async () => {
    renderClient({ responsable: "yo" });
    const trigger = screen.getByRole("button", { name: "Responsable: Yo" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("Luis Paz"));
    expect(lastReplaced()).toBe(`/tareas?responsable=${LUIS}`);
  });

  it("offers Yo and Todos before the people ({id,name} only), without the viewer twice", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Responsable: Todos" }));
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Yo", "Todos", "Luis Paz"]);
    fireEvent.click(within(list).getByText("Yo"));
    expect(lastReplaced()).toBe("/tareas?responsable=yo");
  });

  it("filters by project from the facets and clears it with Todos los proyectos", async () => {
    renderClient({ proyecto: P1 });
    fireEvent.click(screen.getByRole("button", { name: "Proyecto: Guadalajara 83" }));
    fireEvent.click(await screen.findByText("Todos los proyectos"));
    expect(lastReplaced()).toBe("/tareas");

    cleanup();
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Proyecto" }));
    fireEvent.click(await screen.findByText("Local Espinopapa"));
    expect(lastReplaced()).toBe(`/tareas?proyecto=${P2}`);
  });

  it("lists the facet projects (the server keeps only the selected tramo's)", async () => {
    renderClient({ tramo: "presale" }, { total: 4, byTramo: { presale: 1 }, projects: [FACETS.projects[0]] });
    fireEvent.click(screen.getByRole("button", { name: "Proyecto" }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todos los proyectos",
      "Guadalajara 83",
    ]);
  });

  it("writes the search to the URL after a pause, with history.replaceState", () => {
    vi.useFakeTimers();
    renderClient({ tramo: "diseno" });
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar tareas" }), { target: { value: " renders " } });
    expect(replaceState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TAREAS_SEARCH_DEBOUNCE_MS);
    });
    expect(lastReplaced()).toBe("/tareas?tramo=diseno&q=renders");
  });

  it("restores the search box when the URL changes (back / forward)", () => {
    const { rerender } = renderClient({ q: "renders" });
    const box = screen.getByRole("textbox", { name: "Buscar tareas" }) as HTMLInputElement;
    expect(box.value).toBe("renders");
    navigation.search = "";
    rerender(styled(<TareasClient />));
    expect(box.value).toBe("");
    expect(replaceState).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("TareasClient view switch", () => {
  it("renders no Vista switch", () => {
    for (const vista of ["tablero", "lista", "calendario"] as const) {
      renderClient({ vista, tramo: "presale" });
      expect(screen.queryByRole("navigation", { name: "Vista" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Tablero" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Lista" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Calendario" })).toBeNull();
      cleanup();
    }
  });

  it("still accepts ?vista= in the URL", () => {
    navigation.search = "vista=lista&tramo=presale";
    const client = createTestQueryClient();
    seed(client, parseTareasQuery(new URLSearchParams(navigation.search)), FACETS);
    renderWithQueryClient(styled(<TareasClient />), { client });
    expect(screen.getByTestId("view-lista")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tareas" })).toBeTruthy();
    cleanup();

    // An unknown value falls back to the default view instead of failing.
    navigation.search = "vista=kanban";
    const other = createTestQueryClient();
    seed(other, parseTareasQuery(new URLSearchParams(navigation.search)), FACETS);
    renderWithQueryClient(styled(<TareasClient />), { client: other });
    expect(screen.getByTestId("view-tablero")).toBeTruthy();
    expect(pushState).not.toHaveBeenCalled();
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
});

describe("TareasClient per style", () => {
  it("Visual renders the team board with the query, facets, search and the header actions", () => {
    style = "visual";
    renderClient({ tramo: "presale" });
    const visual = screen.getByTestId("view-visual");
    expect(visual.getAttribute("data-props")).toBe("actions,empty,facets,onQuery,onSearch,query,search,tramos");
    expect(within(visual).getByRole("button", { name: "Nueva tarea" })).toBeTruthy();
    expect(screen.queryByTestId("view-tablero")).toBeNull();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
  });

  it("Esencial renders its own layout", () => {
    style = "esencial";
    renderClient();
    expect(screen.getByTestId("view-esencial")).toBeTruthy();
  });
});

describe("TareasClient Nueva tarea", () => {
  it("opens the shell's NewTaskDialogHost with the tramo and project as defaults, without a navigation", () => {
    renderClient({ tramo: "presale", proyecto: P1 });
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarea" }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      defaults: { projectId: P1, tramoKey: "presale" },
      source: "tareas",
    });
    // The host renders the dialog; this screen mounts none of its own.
    expect(screen.queryByRole("dialog", { name: "Nueva tarea" })).toBeNull();
  });

  it("hides the button without the create capability", () => {
    caps.canCreateActivity = false;
    renderClient();
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).toBeNull();
  });
});

describe("TareasClient empty state", () => {
  it("hands the views No hay tareas con estos filtros and Quitar filtros clears the URL filters", () => {
    renderClient({ vista: "lista", tramo: "presale", proyecto: P2, q: "nada" });
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" }).getAttribute("href")).toBe("/tareas?vista=lista");
  });

  it("keeps the calendar mode when clearing the filters in Calendario", () => {
    renderClient({ vista: "calendario", cal: "dia", responsable: LUIS }, { total: 0, byTramo: {}, projects: [] });
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" }).getAttribute("href")).toBe(
      "/tareas?vista=calendario&cal=dia",
    );
    expect(screen.queryByTestId("view-calendario")).toBeNull();
  });

  it("shows the calendar when the selected tramo has tasks", () => {
    renderClient({ vista: "calendario", tramo: "diseno" });
    expect(screen.getByTestId("view-calendario")).toBeTruthy();
  });

  it("offers no Quitar filtros without filters", () => {
    renderClient({ vista: "lista" });
    expect(screen.queryByRole("link", { name: "Quitar filtros" })).toBeNull();
  });
});
