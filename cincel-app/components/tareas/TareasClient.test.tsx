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
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));

vi.mock("@/lib/etapas/compat", () => ({
  etapaColorVar: (key: string) => `var(--etapa-${key})`,
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

// The task sheet (R3-08) opens from `?tarea=`; none here.
vi.mock("./TaskSheet", () => ({ TaskSheetRoute: () => null }));
// The start slot reads its own query (`TareasStartSlot.test.tsx`); here it only shows which etapa it was mounted for.
vi.mock("./TareasStartSlot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./TareasStartSlot")>()),
  TareasStartSlot: ({ workflow }: { workflow: { id: string } }) => (
    <div data-testid="tareas-start-slot" data-workflow={workflow.id} />
  ),
}));
// The per-style layouts read their own queries (their own tests); here they show the props they get.
vi.mock("./TareasVisual", () => ({
  TareasVisual: (p: { actions?: ReactNode; startSlot?: ReactNode } & Record<string, unknown>) => (
    <section data-testid="view-visual" data-props={Object.keys(p).sort().join(",")}>
      {p.actions}
      {p.startSlot}
    </section>
  ),
}));
vi.mock("./TareasEsencial", () => ({
  TareasEsencial: (p: { startSlot?: ReactNode }) => <section data-testid="view-esencial">{p.startSlot}</section>,
}));
vi.mock("./TareasAnalitico", () => ({
  TareasAnalitico: (
    p: {
      actions?: ReactNode;
      search?: string;
      onSearch?(v: string): void;
      empty?: { title: string; action?: { label: string; href?: string } };
      startSlot?: ReactNode;
    } & Record<string, unknown>,
  ) => (
    <section data-testid="view-analitico" data-props={Object.keys(p).sort().join(",")}>
      {p.actions}
      {p.startSlot}
      <input aria-label="Buscar tareas" value={p.search ?? ""} onChange={(e) => p.onSearch?.(e.target.value)} />
      {p.empty?.action?.href ? (
        <div role="status">
          <p>{p.empty.title}</p>
          <a href={p.empty.action.href}>{p.empty.action.label}</a>
        </div>
      ) : null}
    </section>
  ),
}));

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

const ETAPAS: WorkflowRef[] = [
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
  byEtapa: { presale: 1, diseno: 2, construccion: 1 },
  projects: [
    { id: P1, name: "Guadalajara 83", count: 2 },
    { id: P2, name: "Local Espinopapa", count: 2 },
  ],
};

/** The style these tests render: Analítico is `TareasAnalitico`; Visual and Esencial have layouts of their own. */
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
  const page: TareasPageData = { facets, etapas: ETAPAS, staff: STAFF };
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(query, style)), page);
  client.setQueryData(qk.tareas.facets(tareasListFiltersOf(query)), facets);
}

function renderClient(patch: Partial<TareasQuery> = {}, facets: TareasFacets = FACETS) {
  navigation.search = toTareasSearch(patch).replace(/^\?/, "");
  const client = createTestQueryClient();
  seed(client, parseTareasQuery(new URLSearchParams(navigation.search)), facets);
  return renderWithQueryClient(styled(<TareasClient />), { client });
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
  it("passes the Analítico layout no data props: the query, the facets and the shell only", () => {
    renderClient();
    expect(screen.getByTestId("view-analitico").getAttribute("data-props")).toBe(
      "actions,canCreate,empty,etapas,facets,onQuery,onSearch,query,search,staff,startSlot",
    );
  });

  it("reads the hydrated bundle: no request on mount", () => {
    renderClient();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
    expect(pageData.getTareasFacets).not.toHaveBeenCalled();
  });

  it("a filter change is a new key: one bundle request, no facets request of its own", () => {
    const { rerender } = renderClient();
    pageData.getTareasPageData.mockReturnValue(new Promise(() => {}));
    navigation.search = "etapa=diseno";
    rerender(styled(<TareasClient />));
    expect(pageData.getTareasPageData).toHaveBeenCalledTimes(1);
    expect(pageData.getTareasPageData).toHaveBeenCalledWith(
      expect.objectContaining({ estilo: "analitico", etapa: "diseno" }),
    );
    expect(pageData.getTareasFacets).not.toHaveBeenCalled();
    // The layout stays on screen while the next bundle loads.
    expect(screen.getByTestId("view-analitico")).toBeTruthy();
  });
});

describe("TareasClient search", () => {
  it("writes the search to the URL after a pause, with history.replaceState", () => {
    vi.useFakeTimers();
    renderClient({ etapa: "diseno" });
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar tareas" }), { target: { value: " renders " } });
    expect(replaceState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TAREAS_SEARCH_DEBOUNCE_MS);
    });
    expect(lastReplaced()).toBe("/tareas?etapa=diseno&q=renders");
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

describe("TareasClient per style", () => {
  it("Visual renders the team board with the query, facets, search and the header actions", () => {
    style = "visual";
    renderClient({ etapa: "presale" });
    const visual = screen.getByTestId("view-visual");
    expect(visual.getAttribute("data-props")).toBe("actions,empty,etapas,facets,onQuery,onSearch,query,search,startSlot");
    expect(within(visual).getByRole("button", { name: "Nueva tarea" })).toBeTruthy();
    expect(screen.queryByTestId("view-tablero")).toBeNull();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
  });

  it("Esencial renders its own layout", () => {
    style = "esencial";
    renderClient();
    expect(screen.getByTestId("view-esencial")).toBeTruthy();
  });

  it("Analítico renders the tables by project and etapa", () => {
    renderClient();
    expect(screen.getByTestId("view-analitico")).toBeTruthy();
    expect(screen.queryByTestId("view-visual")).toBeNull();
    expect(screen.queryByTestId("view-esencial")).toBeNull();
  });

  it("an old view param changes nothing: the style picks the layout", () => {
    for (const old of ["vista=tablero", "vista=lista", "vista=calendario&cal=dia"]) {
      navigation.search = old;
      const client = createTestQueryClient();
      seed(client, parseTareasQuery(new URLSearchParams(old)), FACETS);
      renderWithQueryClient(styled(<TareasClient />), { client });
      expect(screen.getByTestId("view-analitico")).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: "Vista" })).toBeNull();
      expect(pageData.getTareasPageData).not.toHaveBeenCalled();
      cleanup();
    }
  });
});

describe("TareasClient start slot", () => {
  const VIEWS = { visual: "view-visual", esencial: "view-esencial", analitico: "view-analitico" } as const;

  for (const [s, testId] of Object.entries(VIEWS) as [PresentationStyle, string][]) {
    it(`${s}: one etapa filter mounts the slot for that etapa inside the layout`, () => {
      style = s;
      renderClient({ etapa: "diseno" });
      const slot = within(screen.getByTestId(testId)).getByTestId("tareas-start-slot");
      expect(slot.getAttribute("data-workflow")).toBe("w-diseno");
      expect(screen.getAllByTestId("tareas-start-slot")).toHaveLength(1);
    });

    it(`${s}: no slot without an etapa filter`, () => {
      style = s;
      renderClient();
      expect(screen.getByTestId(testId)).toBeTruthy();
      expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
    });
  }

  it("no slot for several etapas or an unknown etapa", () => {
    for (const etapa of ["presale,diseno", "nope"]) {
      renderClient({ etapa });
      expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
      cleanup();
    }
  });

  it("keeps ?project=X&iniciar=1 in the URL for the slot to open the sheet", () => {
    navigation.search = "etapa=diseno&project=p9&iniciar=1";
    const client = createTestQueryClient();
    seed(client, parseTareasQuery(new URLSearchParams(navigation.search)), FACETS);
    renderWithQueryClient(styled(<TareasClient />), { client });
    expect(screen.getByTestId("tareas-start-slot").getAttribute("data-workflow")).toBe("w-diseno");
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("TareasClient Nueva tarea", () => {
  it("opens the shell's NewTaskDialogHost with the etapa and project as defaults, without a navigation", () => {
    renderClient({ etapa: "presale", proyecto: P1 });
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarea" }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      defaults: { projectId: P1, etapaKey: "presale" },
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
  it("hands the layouts No hay tareas con estos filtros and Quitar filtros clears the URL filters", () => {
    renderClient({ etapa: "presale", proyecto: P2, q: "nada" });
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" }).getAttribute("href")).toBe("/tareas");
  });

  it("offers no Quitar filtros without filters", () => {
    renderClient();
    expect(screen.queryByRole("link", { name: "Quitar filtros" })).toBeNull();
  });
});
