// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { ListPageProps } from "@/components/patterns/ListPage";
import type { TramoBoard } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

import { DISENO, LISTA_TASKS, LISTA_TRAMOS } from "./fixtures/lista-tasks";

const nav = vi.hoisted(() => ({
  search: "vista=lista",
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, scroll, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => {
    void scroll;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const BOARD: TramoBoard = {
  workflow: DISENO,
  ready: [{ project: { id: "p7", name: "Casa Valle" }, currentTramo: null, readySince: "2026-11-02T10:00:00.000Z", pending: null }],
  upcoming: [
    {
      project: { id: "p8", name: "Loft Centro" },
      currentTramo: null,
      readySince: null,
      pending: {
        tramo: { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
        phase: { id: "f-cobro", name: "Cobro", sortOrder: 3 },
        open: 1,
        total: 2,
      },
    },
  ],
  started: [],
};

const compat = vi.hoisted(() => ({
  present: true,
  fetchBoard: vi.fn(),
  fetchCandidates: vi.fn(),
}));
vi.mock("@/lib/tramos/compat", () => ({
  get tramoStart() {
    return compat.present ? { fetchBoard: compat.fetchBoard, fetchCandidates: compat.fetchCandidates } : null;
  },
  canSeeAdminData: () => true,
}));

const auth = vi.hoisted(() => ({ canStart: true }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" }),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canCreateActivity: auth.canStart }),
}));

vi.mock("@/components/tareas/start-tramo-toast", () => ({ notifyTramoStarted: vi.fn() }));
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

function renderLista({ tramo = null, style = "visual" }: { tramo?: string | null; style?: PresentationStyle } = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <TareasLista tasks={LISTA_TASKS} header={{ title: "Tareas" }} tramo={tramo} tramos={LISTA_TRAMOS} />
    </StyleProvider>,
  );
}

beforeEach(() => {
  nav.search = "vista=lista";
  compat.present = true;
  compat.fetchBoard.mockResolvedValue(BOARD);
  compat.fetchCandidates.mockResolvedValue([]);
  auth.canStart = true;
  listPageProps.length = 0;
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
    expect(link.getAttribute("href")).toBe("/tareas?vista=lista&tarea=t1");
    expect(screen.getAllByTestId("tramo-badge").map((b) => b.textContent)).toContain("Diseño");
    expect(screen.getByTestId("lista-table").getAttribute("data-columns")).toContain("pctVencidas");
  });

  it("shows only the selected tramo's tasks", () => {
    nav.search = "vista=lista&tramo=diseno";
    renderLista({ tramo: "diseno" });
    const rows = screen.getByTestId("lista-table").querySelectorAll("tr[data-row-id]");
    expect([...rows].map((r) => r.getAttribute("data-row-id"))).toEqual(["t1", "t2"]);
  });

  it("passes the Lista empty state", () => {
    renderLista();
    expect(listPageProps[listPageProps.length - 1].empty).toEqual({ title: "No hay tareas con estos filtros" });
  });
});

describe("TareasLista start slot", () => {
  it("renders Listos para iniciar and Próximos for one tramo with Project Flow present", async () => {
    nav.search = "vista=lista&tramo=diseno";
    renderLista({ tramo: "diseno" });
    expect(await screen.findByText("Listos para iniciar (1)")).toBeTruthy();
    expect(screen.getByText("Próximos (1)")).toBeTruthy();
    expect(compat.fetchBoard).toHaveBeenCalledWith("w-diseno");
    expect(compat.fetchCandidates).toHaveBeenCalledWith("w-diseno");
    expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-open")).toBe("false");
  });

  it("opens the sheet from the Iniciar button", async () => {
    nav.search = "vista=lista&tramo=diseno";
    renderLista({ tramo: "diseno" });
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar Diseño en Casa Valle" }));
    const sheet = screen.getByTestId("start-tramo-sheet");
    expect(sheet.getAttribute("data-open")).toBe("true");
    expect(sheet.getAttribute("data-project")).toBe("p7");
  });

  it("opens the sheet for project X from ?project=X&iniciar=1 and drops both params on close", async () => {
    nav.search = "vista=lista&tramo=diseno&project=p9&iniciar=1";
    renderLista({ tramo: "diseno" });
    await waitFor(() => expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-open")).toBe("true"));
    expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-project")).toBe("p9");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar hoja" }));
    });
    expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-open")).toBe("false");
    expect(nav.replace).toHaveBeenCalledWith("/tareas?vista=lista&tramo=diseno", { scroll: false });
  });

  it("does not open the sheet for ?project=X without iniciar=1", async () => {
    nav.search = "vista=lista&tramo=diseno&project=p9";
    renderLista({ tramo: "diseno" });
    await screen.findByText("Listos para iniciar (1)");
    expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-open")).toBe("false");
  });

  it("does not open the sheet from iniciar without canCreateActivity", async () => {
    auth.canStart = false;
    nav.search = "vista=lista&tramo=diseno&project=p9&iniciar=1";
    renderLista({ tramo: "diseno" });
    expect(await screen.findByTestId("ready-to-start-count")).toBeTruthy();
    expect(screen.getByTestId("start-tramo-sheet").getAttribute("data-open")).toBe("false");
  });

  it("renders nothing in the slot and ignores iniciar without Project Flow", async () => {
    compat.present = false;
    nav.search = "vista=lista&tramo=diseno&project=p9&iniciar=1";
    renderLista({ tramo: "diseno" });
    await act(async () => {});
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
    expect(screen.queryByTestId("start-tramo-sheet")).toBeNull();
    expect(compat.fetchBoard).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("lista-table")).toBeTruthy();
  });

  it("renders nothing in the slot and ignores iniciar with several tramos selected", async () => {
    nav.search = "vista=lista&tramo=presale,diseno&project=p9&iniciar=1";
    renderLista({ tramo: "presale,diseno" });
    await act(async () => {});
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
    expect(screen.queryByTestId("start-tramo-sheet")).toBeNull();
    expect(compat.fetchBoard).not.toHaveBeenCalled();
  });

  it("renders nothing in the slot for Todas or an unknown tramo", async () => {
    renderLista({ tramo: null });
    cleanup();
    renderLista({ tramo: "otro" });
    await act(async () => {});
    expect(screen.queryByTestId("tareas-start-slot")).toBeNull();
    expect(compat.fetchBoard).not.toHaveBeenCalled();
  });

  it("shows the mapped error when the tramo board can't load", async () => {
    compat.fetchBoard.mockRejectedValue(new Error("FORBIDDEN"));
    nav.search = "vista=lista&tramo=diseno";
    renderLista({ tramo: "diseno" });
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });
});
