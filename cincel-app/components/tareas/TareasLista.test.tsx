// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { ListPageProps } from "@/components/patterns/ListPage";
import type { PresentationStyle } from "@/lib/types/redesign";

import { LISTA_TASKS, LISTA_TRAMOS } from "./fixtures/lista-tasks";

const nav = vi.hoisted(() => ({
  search: "estilo=analitico",
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll,
    onNavigate,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    scroll?: boolean;
    onNavigate?: (e: { preventDefault(): void }) => void;
  }) => {
    void scroll;
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

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" }),
}));

vi.mock("@/lib/actions/tramo-start-actions", () => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
const pageData = vi.hoisted(() => ({
  getTareasStartSlotData: vi.fn(),
  getTareasPageData: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

// The slot's own behaviour (its query, the deep link, the sheet) is covered by
// `TareasStartSlot.test.tsx`; here it only shows which tramo it was mounted for.
vi.mock("@/components/tareas/TareasStartSlot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./TareasStartSlot")>()),
  TareasStartSlot: ({ workflow }: { workflow: { id: string } }) => (
    <div data-testid="tareas-start-slot" data-workflow={workflow.id} />
  ),
}));
vi.mock("@/components/widgets/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } }) => <span data-testid="tramo-badge">{tramo.name}</span>,
}));
vi.mock("@/components/tareas/StartTramoSheet", () => ({
  StartTramoSheet: ({ open, projectId, onClose }: { open: boolean; projectId: string | null; onClose(): void }) => (
    <div data-testid="start-tramo-sheet" data-open={String(open)} data-project={projectId ?? ""}>
      <button type="button" onClick={onClose}>
        Cerrar hoja
      </button>
    </div>
  ),
}));

// ListPage renders its filters and the table spec as plain markup: this file
// checks what the Lista view hands the pattern, not the widget's styling.
const listPageProps: ListPageProps[] = [];
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: (props: ListPageProps) => {
    listPageProps.push(props);
    const spec = props.spec;
    if (spec.kind !== "table") return null;
    return (
      <div>
        <h1>{props.header.title}</h1>
        {props.filters}
        <table data-testid="lista-table" data-group-by={spec.data.groupBy} data-columns={spec.data.columns.map((c) => c.key).join(",")}>
          <tbody>
            {spec.data.rows.map((row) => (
              <tr key={String(row.id)} data-row-id={String(row.id)}>
                <td>{spec.renderCell?.("tarea", row) ?? String(row.tarea)}</td>
                <td>{spec.renderCell?.("tramo", row) ?? String(row.tramo ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
}));

import { TareasLista } from "./TareasLista";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf, type TareasListPages } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TareasPageData } from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import type { TaskListRow } from "@/lib/types/core";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const LISTA_ROWS = LISTA_TASKS.map(
  (t) =>
    ({
      ...t,
      subtaskDone: t.subtaskDoneCount,
      commentCount: 0,
      attachmentCount: 0,
      checklistTotal: t.checklist.total,
      checklistDone: t.checklist.completed,
    }) as TaskListRow,
);

/** The cache `/tareas?estilo=analitico` hydrates: the page bundle and the first list page it seeded. */
function seededClient(query: TareasQuery, nextCursor: string | null = null) {
  const client = createTestQueryClient();
  const page: TareasPageData = { facets: { total: 5, byTramo: {}, projects: [] }, tramos: LISTA_TRAMOS, staff: [] };
  // The bundle is keyed by the style; seed it for every one the tests render.
  for (const estilo of ["visual", "esencial", "analitico"] as const) {
    client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(query, estilo)), page);
  }
  client.setQueryData<TareasListPages>(qk.tareas.list(tareasListFiltersOf(query)), {
    pages: [{ rows: LISTA_ROWS, nextCursor, total: nextCursor ? 60 : LISTA_ROWS.length }],
    pageParams: [null],
  });
  return client;
}

function renderLista({
  tramo = null,
  style = "visual",
  nextCursor = null,
}: { tramo?: string | null; style?: PresentationStyle; nextCursor?: string | null } = {}) {
  const query: TareasQuery = { ...DEFAULT_TAREAS_QUERY, tramo };
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <TareasLista query={query} header={{ title: "Tareas" }} />
    </StyleProvider>,
    { client: seededClient(query, nextCursor) },
  );
}

beforeEach(() => {
  nav.search = "estilo=analitico";
  listPageProps.length = 0;
  for (const fn of Object.values(pageData)) fn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TareasLista", () => {
  it("hands ListPage the same grouped table in Visual, Esencial and Analítico", () => {
    const specs = (["visual", "esencial", "analitico"] as const).map((style) => {
      listPageProps.length = 0;
      renderLista({ style });
      const spec = listPageProps[listPageProps.length - 1].spec;
      cleanup();
      return spec;
    });
    for (const spec of specs) {
      expect(spec.kind).toBe("table");
      if (spec.kind !== "table") continue;
      expect(spec.data.groupBy).toBe("estatus");
      expect(spec.data.rows).toHaveLength(5);
    }
    const [visual, esencial, analitico] = specs.map((s) => (s.kind === "table" ? s.data : null));
    expect(esencial).toEqual(visual);
    expect(analitico).toEqual(visual);
  });

  it("links each task to its sheet over the current view and shows its tramo", () => {
    renderLista();
    const link = screen.getByRole("link", { name: "Levantamiento" });
    expect(link.getAttribute("href")).toBe("/tareas?estilo=analitico&tarea=t1");
    expect(screen.getAllByTestId("tramo-badge").map((b) => b.textContent)).toContain("Diseño");
    expect(screen.getByTestId("lista-table").getAttribute("data-columns")).toContain("pctVencidas");
  });

  it("shows only the selected tramo's tasks", () => {
    nav.search = "estilo=analitico&tramo=diseno";
    renderLista({ tramo: "diseno" });
    const rows = screen.getByTestId("lista-table").querySelectorAll("tr[data-row-id]");
    expect([...rows].map((r) => r.getAttribute("data-row-id"))).toEqual(["t1", "t2"]);
  });

  it("passes the Lista empty state", () => {
    renderLista();
    expect(listPageProps[listPageProps.length - 1].empty).toEqual({ title: "No hay tareas con estos filtros" });
  });

  it("opens a task's sheet shallowly (history.pushState, no navigation)", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    renderLista();
    screen.getByRole("link", { name: "Levantamiento" }).click();
    expect(pushState).toHaveBeenCalledWith(null, "", "/tareas?estilo=analitico&tarea=t1");
    pushState.mockRestore();
  });

  it("reads the seeded first page: no request on mount", () => {
    renderLista();
    expect(pageData.getTareasListPage).not.toHaveBeenCalled();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
  });

  it("loads the next page from the cursor with “Cargar más” (useInfiniteQuery)", async () => {
    const extra = { ...LISTA_ROWS[0], id: "t-next", title: "Siguiente página" } as TaskListRow;
    pageData.getTareasListPage.mockResolvedValue({ rows: [extra], nextCursor: null, total: 60 });
    renderLista({ nextCursor: "cur-1" });

    const spec = listPageProps[listPageProps.length - 1].spec;
    if (spec.kind !== "table") throw new Error("table spec");
    expect(spec.pagination?.hasMore).toBe(true);
    await act(async () => spec.pagination?.onEndReached?.());

    expect(pageData.getTareasListPage).toHaveBeenCalledWith({
      filters: tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY }),
      cursor: "cur-1",
    });
    await waitFor(() => expect(screen.getByRole("link", { name: "Siguiente página" })).toBeTruthy());
    const last = listPageProps[listPageProps.length - 1].spec;
    expect(last.kind === "table" ? last.pagination?.hasMore : undefined).toBe(false);
  });
});

describe("TareasLista start slot", () => {
  it("mounts the start slot for exactly one known tramo", () => {
    nav.search = "estilo=analitico&tramo=diseno";
    renderLista({ tramo: "diseno" });
    expect(screen.getByTestId("tareas-start-slot").getAttribute("data-workflow")).toBe("w-diseno");
    expect(screen.getByTestId("lista-table")).toBeTruthy();
  });

  it("renders no slot with several tramos selected", () => {
    nav.search = "estilo=analitico&tramo=presale,diseno&project=p9&iniciar=1";
    renderLista({ tramo: "presale,diseno" });
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
  });

  it("renders no slot for Todas or an unknown tramo", () => {
    renderLista({ tramo: null });
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
    cleanup();
    renderLista({ tramo: "otro" });
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
  });

  it("never reloads the route", () => {
    nav.search = "estilo=analitico&tramo=diseno";
    renderLista({ tramo: "diseno" });
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
